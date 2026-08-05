<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Email_Service {
	private static $defaults = array(
		'store_ready'         => array( 'subject' => 'Your Global FSMS store is ready', 'heading' => 'Your store is ready', 'intro' => 'Your POS store has been created successfully.' ),
		'trial_activated'     => array( 'subject' => 'Your Global FSMS trial is active', 'heading' => 'Trial activated', 'intro' => 'Your free trial is now active.' ),
		'trial_reminder'      => array( 'subject' => 'Your Global FSMS trial is ending soon', 'heading' => 'Trial reminder', 'intro' => 'Your trial is ending soon. Choose a paid plan to keep access.' ),
		'trial_expired'       => array( 'subject' => 'Your Global FSMS trial has ended', 'heading' => 'Trial ended', 'intro' => 'Your store is locked until a paid plan is activated.' ),
		'payment_failed'      => array( 'subject' => 'Payment failed — action required', 'heading' => 'Update your payment method', 'intro' => 'A subscription payment failed and your store has entered its configured grace period.' ),
		'store_locked'        => array( 'subject' => 'Your Global FSMS store is locked', 'heading' => 'Store access locked', 'intro' => 'Store access has been locked. Open your account to resolve the issue.' ),
		'store_reactivated'   => array( 'subject' => 'Your Global FSMS store is active again', 'heading' => 'Access restored', 'intro' => 'Your payment was recovered and eligible store access has been restored.' ),
		'device_activated'    => array( 'subject' => 'A POS device was activated', 'heading' => 'New device activity', 'intro' => 'A device was activated for your POS store.' ),
		'device_revoked'      => array( 'subject' => 'A POS device was revoked', 'heading' => 'Device revoked', 'intro' => 'A device was revoked from your POS store.' ),
		'key_rotated'         => array( 'subject' => 'Your POS store key was rotated', 'heading' => 'Store key rotated', 'intro' => 'Your store key was rotated. Existing copies of the previous key no longer work.' ),
		'pos_password_changed'=> array( 'subject' => 'Your POS administrator password changed', 'heading' => 'Security change completed', 'intro' => 'The POS administrator password was changed. If this was not you, contact support immediately.' ),
	);

	public static function register() {
		// Reserved for future WooCommerce email-class registration.
	}

	public static function templates() {
		$saved = get_option( 'gfcb_email_templates', array() );
		return array_replace_recursive( self::$defaults, is_array( $saved ) ? $saved : array() );
	}

	public static function send( $event, $user_id, $context = array() ) {
		$user      = get_userdata( $user_id );
		$templates = self::templates();
		if ( ! $user || empty( $templates[ $event ] ) ) {
			return false;
		}
		$template   = $templates[ $event ];
		$account_url = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'myaccount' ) : home_url( '/' );
		$store       = isset( $context['store'] ) && is_array( $context['store'] ) ? $context['store'] : array();
		$details     = '';
		if ( $store ) {
			$details .= '<p><strong>' . esc_html__( 'Store:', 'global-fsms-commerce-bridge' ) . '</strong> ' . esc_html( isset( $store['store_name'] ) ? $store['store_name'] : '' ) . '</p>';
			$details .= '<p><strong>' . esc_html__( 'Plan:', 'global-fsms-commerce-bridge' ) . '</strong> ' . esc_html( isset( $store['plan_key'] ) ? $store['plan_key'] : '' ) . '</p>';
			$details .= '<p><strong>' . esc_html__( 'Device allowance:', 'global-fsms-commerce-bridge' ) . '</strong> ' . esc_html( isset( $store['device_limit'] ) ? $store['device_limit'] : '' ) . '</p>';
		}
		$message = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#102a43"><div style="background:#086f58;color:#fff;padding:22px 28px"><strong>Global FSMS</strong></div><div style="padding:28px;border:1px solid #d9e2ec"><h1 style="font-size:24px">' . esc_html( $template['heading'] ) . '</h1><p>' . esc_html( $template['intro'] ) . '</p>' . $details . '<p><a style="display:inline-block;background:#086f58;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px" href="' . esc_url( $account_url ) . '">' . esc_html__( 'Open my account', 'global-fsms-commerce-bridge' ) . '</a></p><p style="font-size:12px;color:#627d98">' . esc_html__( 'For security, emails never include a store key, API key, OTP, or current password.', 'global-fsms-commerce-bridge' ) . '</p></div></div>';
		return wp_mail( $user->user_email, sanitize_text_field( $template['subject'] ), $message, array( 'Content-Type: text/html; charset=UTF-8' ) );
	}

	public static function send_due_reminders() {
		global $wpdb;
		$table = GFCB_Database::table( 'stores' );
		$rows  = $wpdb->get_results( "SELECT * FROM {$table} WHERE status = 'trialing' AND ends_at IS NOT NULL AND ends_at > UTC_TIMESTAMP() AND ends_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)" , ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery.DirectQuery
		foreach ( $rows ?: array() as $store ) {
			$days = GFCB_Trial_Service::remaining( $store['ends_at'] );
			if ( ! in_array( $days, array( 7, 3, 1, 0 ), true ) ) {
				continue;
			}
			$key = 'gfcb_trial_reminder_' . $store['id'] . '_' . $days;
			if ( get_option( $key ) ) {
				continue;
			}
			self::send( 'trial_reminder', (int) $store['owner_user_id'], array( 'store' => $store, 'days' => $days ) );
			add_option( $key, current_time( 'mysql', true ), '', false );
		}
	}
}
