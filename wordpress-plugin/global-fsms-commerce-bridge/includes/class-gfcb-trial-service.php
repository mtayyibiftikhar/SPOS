<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Trial_Service {
	public static function eligibility( $user_id ) {
		global $wpdb;
		$user = get_userdata( $user_id );
		if ( ! $user || ! get_user_meta( $user_id, 'gfcb_email_verified_at', true ) || ! get_user_meta( $user_id, 'gfcb_phone_verified_at', true ) ) {
			return new WP_Error( 'gfcb_verification_required', __( 'Verify your email and phone before starting a trial.', 'global-fsms-commerce-bridge' ) );
		}
		$phone = (string) get_user_meta( $user_id, 'gfcb_phone_e164', true );
		$table = GFCB_Database::table( 'trial_claims' );
		$row   = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT id, status FROM {$table} WHERE connector_profile = %s AND (normalized_email_hash = %s OR normalized_phone_hash = %s) LIMIT 1",
				GFCB_Brand_Profile::active_key(),
				GFCB_Verification_Service::hash_identity( GFCB_Verification_Service::normalize_email( $user->user_email ) ),
				GFCB_Verification_Service::hash_identity( $phone )
			)
		); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return $row ? new WP_Error( 'gfcb_trial_used', __( 'This verified identity has already claimed or reserved its free trial.', 'global-fsms-commerce-bridge' ) ) : true;
	}

	public static function reserve( $user_id, $source_order_id = null ) {
		global $wpdb;
		$eligible = self::eligibility( $user_id );
		if ( is_wp_error( $eligible ) ) {
			return $eligible;
		}
		$user  = get_userdata( $user_id );
		$phone = (string) get_user_meta( $user_id, 'gfcb_phone_e164', true );
		$now   = current_time( 'mysql', true );
		$data  = array(
			'connector_profile'       => GFCB_Brand_Profile::active_key(),
			'user_id'                 => $user_id,
			'normalized_email_hash'   => GFCB_Verification_Service::hash_identity( GFCB_Verification_Service::normalize_email( $user->user_email ) ),
			'normalized_phone_hash'   => GFCB_Verification_Service::hash_identity( $phone ),
			'status'                  => 'reserved',
			'reserved_at'             => $now,
			'source_order_id'         => $source_order_id ? absint( $source_order_id ) : null,
			'created_at'              => $now,
			'updated_at'              => $now,
		);
		$result = $wpdb->insert( GFCB_Database::table( 'trial_claims' ), $data );
		if ( false === $result ) {
			return new WP_Error( 'gfcb_trial_conflict', __( 'A trial has already been reserved for this identity.', 'global-fsms-commerce-bridge' ) );
		}
		$claim_id = (int) $wpdb->insert_id;
		GFCB_Database::audit( 'trial_reserved', 'trial_claim', $claim_id );
		return $claim_id;
	}

	public static function mark_provisioning( $claim_id, $store_id ) {
		global $wpdb;
		$wpdb->update( GFCB_Database::table( 'trial_claims' ), array( 'status' => 'provisioning', 'store_id' => $store_id, 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $claim_id ), array( '%s', '%d', '%s' ), array( '%d' ) );
	}

	public static function activate( $claim_id, $store_id, $expires_at ) {
		global $wpdb;
		$now = current_time( 'mysql', true );
		$wpdb->update( GFCB_Database::table( 'trial_claims' ), array( 'status' => 'activated', 'store_id' => $store_id, 'activated_at' => $now, 'expired_at' => $expires_at, 'updated_at' => $now ), array( 'id' => $claim_id ), array( '%s', '%d', '%s', '%s', '%s' ), array( '%d' ) );
		GFCB_Database::audit( 'trial_activated', 'trial_claim', $claim_id, array( 'store_id' => $store_id, 'expires_at' => $expires_at ) );
	}

	public static function remaining( $expires_at ) {
		$seconds = strtotime( (string) $expires_at . ' UTC' ) - time();
		return max( 0, (int) ceil( $seconds / DAY_IN_SECONDS ) );
	}

	public static function expire_due_claims() {
		global $wpdb;
		$table = GFCB_Database::table( 'trial_claims' );
		$wpdb->query( $wpdb->prepare( "UPDATE {$table} SET status = 'expired', updated_at = %s WHERE status = 'activated' AND expired_at IS NOT NULL AND expired_at <= %s", current_time( 'mysql', true ), current_time( 'mysql', true ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}
}

