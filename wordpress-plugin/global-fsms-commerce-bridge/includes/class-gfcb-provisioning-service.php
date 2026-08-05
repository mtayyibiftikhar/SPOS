<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Provisioning_Service {
	const HOOK = 'gfcb_process_provisioning_job';
	const GROUP = 'global-fsms-commerce-bridge';

	public static function register() {
		add_action( self::HOOK, array( __CLASS__, 'process' ) );
		add_action( 'gfcb_hourly_lifecycle', array( __CLASS__, 'lifecycle' ) );
		if ( ! wp_next_scheduled( 'gfcb_hourly_lifecycle' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', 'gfcb_hourly_lifecycle' );
		}
	}

	public static function enqueue_store( $store_id ) {
		global $wpdb;
		$store = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . GFCB_Database::table( 'stores' ) . ' WHERE id = %d', $store_id ), ARRAY_A );
		if ( ! $store ) {
			return new WP_Error( 'gfcb_store_missing', __( 'Store request not found.', 'global-fsms-commerce-bridge' ) );
		}
		$request_id = $store['provisioning_request_id'];
		$payload    = array(
			'store_uuid'        => $store['uuid'],
			'store_name'        => $store['store_name'],
			'trading_name'      => $store['trading_name'],
			'business_category' => $store['business_category'],
			'country'           => $store['country'],
			'currency'          => $store['currency'],
			'timezone'          => $store['timezone'],
			'contact_email'     => $store['contact_email'],
			'contact_phone'     => $store['contact_phone'],
			'plan_key'          => $store['plan_key'],
			'billing_cycle'     => $store['billing_cycle'],
			'starts_at'         => $store['starts_at'],
			'ends_at'           => $store['ends_at'],
			'device_limit'      => (int) $store['device_limit'],
		);
		$now = current_time( 'mysql', true );
		$wpdb->query(
			$wpdb->prepare(
				'INSERT IGNORE INTO ' . GFCB_Database::table( 'provisioning_jobs' ) . ' (request_id,connector_profile,job_type,object_type,object_id,status,attempts,payload,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%d,%s,%s,%s)',
				$request_id, $store['connector_profile'], 'create_store', 'store', (string) $store_id, 'pending', 0, wp_json_encode( $payload ), $now, $now
			)
		);
		self::schedule( $request_id, time() );
		return $request_id;
	}

	public static function enqueue_store_action( $store_id, $job_type, $payload, $request_id = '' ) {
		global $wpdb;
		$store = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . GFCB_Database::table( 'stores' ) . ' WHERE id = %d', $store_id ), ARRAY_A );
		if ( ! $store || empty( $store['external_store_id'] ) ) {
			return new WP_Error( 'gfcb_store_not_provisioned', __( 'The store is not ready for synchronization.', 'global-fsms-commerce-bridge' ) );
		}
		$request_id = $request_id && preg_match( '/^[a-f0-9-]{36}$/i', $request_id ) ? $request_id : wp_generate_uuid4();
		$now        = current_time( 'mysql', true );
		$wpdb->query(
			$wpdb->prepare(
				'INSERT IGNORE INTO ' . GFCB_Database::table( 'provisioning_jobs' ) . ' (request_id,connector_profile,job_type,object_type,object_id,status,attempts,payload,created_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%d,%s,%s,%s)',
				$request_id, $store['connector_profile'], sanitize_key( $job_type ), 'store', (string) $store_id, 'pending', 0, wp_json_encode( $payload ), $now, $now
			)
		);
		self::schedule( $request_id, time() );
		return $request_id;
	}

	private static function schedule( $request_id, $timestamp ) {
		if ( function_exists( 'as_schedule_single_action' ) ) {
			as_schedule_single_action( $timestamp, self::HOOK, array( 'request_id' => $request_id ), self::GROUP, true );
		} elseif ( ! wp_next_scheduled( self::HOOK, array( 'request_id' => $request_id ) ) ) {
			wp_schedule_single_event( $timestamp, self::HOOK, array( 'request_id' => $request_id ) );
		}
	}

	public static function process( $request_id ) {
		global $wpdb;
		$table = GFCB_Database::table( 'provisioning_jobs' );
		$job   = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE request_id = %s", $request_id ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $job || 'completed' === $job['status'] || 'manual_review' === $job['status'] ) {
			return;
		}
		$attempt = (int) $job['attempts'] + 1;
		$wpdb->update( $table, array( 'status' => 'processing', 'attempts' => $attempt, 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $job['id'] ) );
		$client = new GFCB_API_Client( $job['connector_profile'] );
		$payload = json_decode( $job['payload'], true );
		if ( 'create_store' === $job['job_type'] ) {
			$result = $client->request( 'POST', '/api/commerce-bridge/v1/stores', $payload, $request_id );
		} else {
			$store = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . GFCB_Database::table( 'stores' ) . ' WHERE id = %d', $job['object_id'] ), ARRAY_A );
			$result = $store ? $client->request( 'POST', '/api/commerce-bridge/v1/stores/' . rawurlencode( $store['external_store_id'] ) . '/actions', array_merge( array( 'action' => $job['job_type'] ), is_array( $payload ) ? $payload : array() ), $request_id ) : new WP_Error( 'gfcb_store_missing', __( 'Store not found.', 'global-fsms-commerce-bridge' ) );
		}
		if ( ! is_wp_error( $result ) ) {
			$updated = 'create_store' === $job['job_type'] ? GFCB_Store_Service::update_from_provisioning( (int) $job['object_id'], $result ) : true;
			if ( ! is_wp_error( $updated ) ) {
				$wpdb->update( $table, array( 'status' => 'completed', 'last_error' => null, 'completed_at' => current_time( 'mysql', true ), 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $job['id'] ) );
				return;
			}
			$result = $updated;
		}

		$delays = array( 0, 300, 900, 3600, 21600 );
		$error  = sanitize_text_field( $result->get_error_message() );
		if ( $attempt >= count( $delays ) ) {
			$wpdb->update( $table, array( 'status' => 'manual_review', 'last_error' => $error, 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $job['id'] ) );
			$wpdb->update( GFCB_Database::table( 'stores' ), array( 'provisioning_status' => 'failed', 'provisioning_error' => __( 'Setup requires assistance.', 'global-fsms-commerce-bridge' ), 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $job['object_id'] ) );
			GFCB_Database::audit( 'provisioning_failed', 'store', $job['object_id'], array( 'request_id' => $request_id, 'attempts' => $attempt ) );
			return;
		}
		$next = time() + $delays[ $attempt ];
		$wpdb->update( $table, array( 'status' => 'retrying', 'last_error' => $error, 'next_attempt_at' => gmdate( 'Y-m-d H:i:s', $next ), 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $job['id'] ) );
		self::schedule( $request_id, $next );
	}

	public static function retry( $request_id ) {
		global $wpdb;
		$wpdb->update( GFCB_Database::table( 'provisioning_jobs' ), array( 'status' => 'pending', 'attempts' => 0, 'last_error' => null, 'updated_at' => current_time( 'mysql', true ) ), array( 'request_id' => sanitize_text_field( $request_id ) ) );
		self::schedule( sanitize_text_field( $request_id ), time() );
	}

	public static function lifecycle() {
		GFCB_Trial_Service::expire_due_claims();
		GFCB_WooCommerce::enforce_expired_access();
		GFCB_Email_Service::send_due_reminders();
	}
}
