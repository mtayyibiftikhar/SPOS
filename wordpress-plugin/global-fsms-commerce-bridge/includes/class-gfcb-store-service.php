<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Store_Service {
	public static function create_pending( $user_id, $input, $context = array() ) {
		global $wpdb;
		$name = sanitize_text_field( isset( $input['store_name'] ) ? $input['store_name'] : '' );
		if ( ! $name ) {
			return new WP_Error( 'gfcb_store_name_required', __( 'Store name is required.', 'global-fsms-commerce-bridge' ) );
		}
		$request_id = ! empty( $context['request_id'] ) ? sanitize_text_field( $context['request_id'] ) : wp_generate_uuid4();
		$existing   = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . GFCB_Database::table( 'stores' ) . ' WHERE provisioning_request_id = %s AND owner_user_id = %d LIMIT 1', $request_id, absint( $user_id ) ), ARRAY_A );
		if ( $existing ) {
			return $existing;
		}
		$uuid       = wp_generate_uuid4();
		$now        = current_time( 'mysql', true );
		$data       = array(
			'uuid'                    => $uuid,
			'connector_profile'       => GFCB_Brand_Profile::active_key(),
			'owner_user_id'           => absint( $user_id ),
			'store_name'              => $name,
			'trading_name'            => sanitize_text_field( isset( $input['trading_name'] ) ? $input['trading_name'] : '' ),
			'business_category'       => sanitize_text_field( isset( $input['business_category'] ) ? $input['business_category'] : '' ),
			'country'                 => strtoupper( substr( sanitize_text_field( isset( $input['country'] ) ? $input['country'] : 'SA' ), 0, 2 ) ),
			'currency'                => strtoupper( substr( sanitize_text_field( isset( $input['currency'] ) ? $input['currency'] : 'SAR' ), 0, 3 ) ),
			'timezone'                => sanitize_text_field( isset( $input['timezone'] ) ? $input['timezone'] : 'Asia/Riyadh' ),
			'contact_email'           => sanitize_email( isset( $input['contact_email'] ) ? $input['contact_email'] : '' ),
			'contact_phone'           => sanitize_text_field( isset( $input['contact_phone'] ) ? $input['contact_phone'] : '' ),
			'status'                  => 'provisioning',
			'provisioning_status'     => 'pending',
			'provisioning_request_id' => $request_id,
			'plan_key'                => sanitize_key( isset( $context['plan_key'] ) ? $context['plan_key'] : 'trial' ),
			'billing_cycle'           => sanitize_key( isset( $context['billing_cycle'] ) ? $context['billing_cycle'] : 'trial' ),
			'subscription_id'         => ! empty( $context['subscription_id'] ) ? absint( $context['subscription_id'] ) : null,
			'source_order_id'         => ! empty( $context['source_order_id'] ) ? absint( $context['source_order_id'] ) : null,
			'trial_claim_id'          => ! empty( $context['trial_claim_id'] ) ? absint( $context['trial_claim_id'] ) : null,
			'starts_at'               => isset( $context['starts_at'] ) ? $context['starts_at'] : $now,
			'ends_at'                 => isset( $context['ends_at'] ) ? $context['ends_at'] : null,
			'device_limit'            => max( 1, absint( isset( $context['device_limit'] ) ? $context['device_limit'] : 1 ) ),
			'created_at'              => $now,
			'updated_at'              => $now,
		);
		if ( false === $wpdb->insert( GFCB_Database::table( 'stores' ), $data ) ) {
			return new WP_Error( 'gfcb_store_create_failed', __( 'The store request could not be saved.', 'global-fsms-commerce-bridge' ) );
		}
		$store_id = (int) $wpdb->insert_id;
		if ( ! empty( $context['trial_claim_id'] ) ) {
			GFCB_Trial_Service::mark_provisioning( $context['trial_claim_id'], $store_id );
		}
		GFCB_Database::audit( 'store_requested', 'store', $store_id, array( 'request_id' => $request_id, 'plan_key' => $data['plan_key'] ) );
		GFCB_Provisioning_Service::enqueue_store( $store_id );
		return self::get_owned( $store_id, $user_id );
	}

	public static function get_owned( $store_id, $user_id ) {
		global $wpdb;
		$table = GFCB_Database::table( 'stores' );
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d AND owner_user_id = %d AND connector_profile = %s", $store_id, $user_id, GFCB_Brand_Profile::active_key() ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	public static function get_by_uuid_owned( $uuid, $user_id ) {
		global $wpdb;
		$table = GFCB_Database::table( 'stores' );
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE uuid = %s AND owner_user_id = %d AND connector_profile = %s", sanitize_text_field( $uuid ), $user_id, GFCB_Brand_Profile::active_key() ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	public static function update_from_provisioning( $store_id, $response ) {
		global $wpdb;
		$product_key = isset( $response['product_key'] ) ? (string) $response['product_key'] : '';
		$encrypted   = $product_key ? GFCB_Secret_Vault::encrypt( $product_key ) : '';
		if ( is_wp_error( $encrypted ) ) {
			return $encrypted;
		}
		$now  = current_time( 'mysql', true );
		$data = array(
			'external_store_id'     => sanitize_text_field( isset( $response['store_id'] ) ? $response['store_id'] : '' ),
			'status'                => sanitize_key( isset( $response['status'] ) ? $response['status'] : 'active' ),
			'provisioning_status'   => 'completed',
			'provisioning_error'    => null,
			'encrypted_store_key'   => $encrypted ?: null,
			'store_key_last_four'   => $product_key ? substr( $product_key, -4 ) : null,
			'store_key_rotated_at'  => $product_key ? $now : null,
			'last_synced_at'        => $now,
			'open_pos_url'          => esc_url_raw( isset( $response['open_pos_url'] ) ? $response['open_pos_url'] : '' ),
			'updated_at'            => $now,
		);
		$wpdb->update( GFCB_Database::table( 'stores' ), $data, array( 'id' => $store_id ) );
		$store = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . GFCB_Database::table( 'stores' ) . ' WHERE id = %d', $store_id ), ARRAY_A );
		if ( $store && ! empty( $store['trial_claim_id'] ) ) {
			GFCB_Trial_Service::activate( (int) $store['trial_claim_id'], $store_id, $store['ends_at'] );
		}
		GFCB_Database::audit( 'store_provisioned', 'store', $store_id, array( 'external_store_id' => $data['external_store_id'] ) );
		GFCB_Email_Service::send( 'store_ready', (int) $store['owner_user_id'], array( 'store' => $store ) );
		return true;
	}

	public static function public_view( $store ) {
		global $wpdb;
		$active_devices = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . GFCB_Database::table( 'devices' ) . ' WHERE store_id = %d AND status = %s', (int) $store['id'], 'active' ) );
		return array(
			'id'                  => (int) $store['id'],
			'uuid'                => $store['uuid'],
			'store_name'          => $store['store_name'],
			'trading_name'        => $store['trading_name'],
			'business_category'   => $store['business_category'],
			'country'             => $store['country'],
			'currency'            => $store['currency'],
			'timezone'            => $store['timezone'],
			'status'              => $store['status'],
			'provisioning_status' => $store['provisioning_status'],
			'plan_key'            => $store['plan_key'],
			'billing_cycle'       => $store['billing_cycle'],
			'starts_at'           => $store['starts_at'],
			'ends_at'             => $store['ends_at'],
			'grace_ends_at'       => $store['grace_ends_at'],
			'device_limit'        => (int) $store['device_limit'],
			'active_devices'      => $active_devices,
			'store_key_masked'    => $store['store_key_last_four'] ? '•••• •••• •••• ' . $store['store_key_last_four'] : null,
			'last_synced_at'      => $store['last_synced_at'],
			'open_pos_url'        => $store['open_pos_url'],
			'pos_password_changed_at' => $store['pos_password_changed_at'],
		);
	}
}
