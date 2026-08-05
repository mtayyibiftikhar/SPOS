<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Database {
	public static function table( $name ) {
		global $wpdb;
		$allowed = array( 'stores', 'entitlements', 'devices', 'trial_claims', 'verification_tokens', 'webhook_events', 'audit_log', 'provisioning_jobs' );
		if ( ! in_array( $name, $allowed, true ) ) {
			throw new InvalidArgumentException( 'Unknown Global FSMS Commerce Bridge table.' );
		}
		return $wpdb->prefix . 'gfcb_' . $name;
	}

	public static function install() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$sql     = array();
		$sql[]   = 'CREATE TABLE ' . self::table( 'stores' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			uuid char(36) NOT NULL,
			connector_profile varchar(32) NOT NULL DEFAULT 'global_fsms',
			external_store_id varchar(191) NULL,
			owner_user_id bigint unsigned NOT NULL,
			store_name varchar(191) NOT NULL,
			trading_name varchar(191) NULL,
			business_category varchar(100) NULL,
			country char(2) NULL,
			currency char(3) NOT NULL DEFAULT 'SAR',
			timezone varchar(100) NOT NULL DEFAULT 'Asia/Riyadh',
			contact_email varchar(191) NULL,
			contact_phone varchar(32) NULL,
			status varchar(32) NOT NULL DEFAULT 'provisioning',
			provisioning_status varchar(32) NOT NULL DEFAULT 'pending',
			provisioning_error text NULL,
			provisioning_request_id char(36) NULL,
			plan_key varchar(100) NULL,
			billing_cycle varchar(32) NULL,
			subscription_id bigint unsigned NULL,
			source_order_id bigint unsigned NULL,
			trial_claim_id bigint unsigned NULL,
			starts_at datetime NULL,
			ends_at datetime NULL,
			grace_ends_at datetime NULL,
			device_limit int unsigned NOT NULL DEFAULT 1,
			encrypted_store_key longtext NULL,
			store_key_last_four char(4) NULL,
			store_key_rotated_at datetime NULL,
			pos_password_changed_at datetime NULL,
			last_synced_at datetime NULL,
			open_pos_url varchar(500) NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY uuid (uuid),
			UNIQUE KEY provisioning_request (provisioning_request_id),
			KEY owner_status (owner_user_id,status),
			KEY external_store (connector_profile,external_store_id)
		) $charset;";

		$sql[] = 'CREATE TABLE ' . self::table( 'entitlements' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint unsigned NOT NULL,
			store_id bigint unsigned NULL,
			entitlement_type varchar(64) NOT NULL,
			quantity int NOT NULL DEFAULT 1,
			status varchar(32) NOT NULL DEFAULT 'active',
			source_type varchar(32) NOT NULL,
			source_id varchar(191) NOT NULL,
			starts_at datetime NULL,
			ends_at datetime NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY source_entitlement (source_type,source_id,entitlement_type,store_id),
			KEY user_status (user_id,status),
			KEY store_status (store_id,status)
		) $charset;";

		$sql[] = 'CREATE TABLE ' . self::table( 'devices' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			uuid char(36) NOT NULL,
			external_device_id varchar(191) NULL,
			store_id bigint unsigned NOT NULL,
			device_name varchar(191) NOT NULL,
			device_type varchar(64) NULL,
			platform varchar(64) NULL,
			app_version varchar(64) NULL,
			fingerprint_hash char(64) NULL,
			status varchar(32) NOT NULL DEFAULT 'pending_activation',
			activated_at datetime NULL,
			last_seen_at datetime NULL,
			revoked_at datetime NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY uuid (uuid),
			KEY store_status (store_id,status),
			KEY external_device (external_device_id)
		) $charset;";

		$sql[] = 'CREATE TABLE ' . self::table( 'provisioning_jobs' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			request_id char(36) NOT NULL,
			connector_profile varchar(32) NOT NULL,
			job_type varchar(64) NOT NULL,
			object_type varchar(64) NOT NULL,
			object_id varchar(191) NOT NULL,
			status varchar(32) NOT NULL DEFAULT 'pending',
			attempts smallint unsigned NOT NULL DEFAULT 0,
			next_attempt_at datetime NULL,
			last_error text NULL,
			payload longtext NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			completed_at datetime NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY request_id (request_id),
			KEY queue (status,next_attempt_at),
			KEY object_jobs (object_type,object_id,created_at)
		) $charset;";

		$sql[] = 'CREATE TABLE ' . self::table( 'trial_claims' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			connector_profile varchar(32) NOT NULL DEFAULT 'global_fsms',
			user_id bigint unsigned NOT NULL,
			normalized_email_hash char(64) NOT NULL,
			normalized_phone_hash char(64) NOT NULL,
			payment_customer_hash char(64) NULL,
			status varchar(32) NOT NULL DEFAULT 'reserved',
			reserved_at datetime NOT NULL,
			activated_at datetime NULL,
			expired_at datetime NULL,
			store_id bigint unsigned NULL,
			source_order_id bigint unsigned NULL,
			admin_override_by bigint unsigned NULL,
			admin_override_reason text NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY email_identity (connector_profile,normalized_email_hash),
			UNIQUE KEY phone_identity (connector_profile,normalized_phone_hash),
			KEY user_status (connector_profile,user_id,status)
		) $charset;";

		$sql[] = 'CREATE TABLE ' . self::table( 'verification_tokens' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			user_id bigint unsigned NOT NULL,
			token_type varchar(32) NOT NULL,
			token_hash char(64) NOT NULL,
			expires_at datetime NOT NULL,
			attempt_count smallint unsigned NOT NULL DEFAULT 0,
			consumed_at datetime NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY token_hash (token_hash),
			KEY user_type_active (user_id,token_type,consumed_at),
			KEY expires_at (expires_at)
		) $charset;";

		$sql[] = 'CREATE TABLE ' . self::table( 'webhook_events' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			provider varchar(64) NOT NULL,
			external_event_id varchar(191) NOT NULL,
			event_type varchar(100) NOT NULL,
			payload_hash char(64) NOT NULL,
			processing_status varchar(32) NOT NULL DEFAULT 'received',
			attempts smallint unsigned NOT NULL DEFAULT 0,
			received_at datetime NOT NULL,
			processed_at datetime NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY provider_event (provider,external_event_id),
			KEY status_received (processing_status,received_at)
		) $charset;";

		$sql[] = 'CREATE TABLE ' . self::table( 'audit_log' ) . " (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			actor_type varchar(32) NOT NULL,
			actor_id varchar(191) NULL,
			event_type varchar(100) NOT NULL,
			object_type varchar(64) NULL,
			object_id varchar(191) NULL,
			old_value longtext NULL,
			new_value longtext NULL,
			ip_address varchar(45) NULL,
			user_agent varchar(255) NULL,
			reason text NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY event_created (event_type,created_at),
			KEY object_history (object_type,object_id,created_at)
		) $charset;";

		foreach ( $sql as $statement ) {
			dbDelta( $statement );
		}

		update_option( 'gfcb_db_version', GFCB_DB_VERSION, false );
	}

	public static function audit( $event_type, $object_type = null, $object_id = null, $data = array() ) {
		global $wpdb;
		$sensitive = array( 'password', 'current_password', 'new_password', 'otp', 'token', 'secret', 'store_key', 'api_key' );
		foreach ( $sensitive as $key ) {
			unset( $data[ $key ] );
		}

		$wpdb->insert(
			self::table( 'audit_log' ),
			array(
				'actor_type' => is_user_logged_in() ? 'user' : 'system',
				'actor_id'   => is_user_logged_in() ? (string) get_current_user_id() : null,
				'event_type' => sanitize_key( $event_type ),
				'object_type'=> $object_type ? sanitize_key( $object_type ) : null,
				'object_id'  => $object_id ? sanitize_text_field( (string) $object_id ) : null,
				'new_value'  => $data ? wp_json_encode( $data ) : null,
				'ip_address' => self::request_ip(),
				'user_agent' => isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 255 ) : null,
				'created_at' => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
	}

	public static function request_ip() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return filter_var( $ip, FILTER_VALIDATE_IP ) ? $ip : null;
	}
}
