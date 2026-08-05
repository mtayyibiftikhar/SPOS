<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Activator {
	public static function activate() {
		if ( version_compare( PHP_VERSION, '7.4', '<' ) ) {
			deactivate_plugins( plugin_basename( GFCB_FILE ) );
			wp_die( esc_html__( 'Global FSMS Commerce Bridge requires PHP 7.4 or newer.', 'global-fsms-commerce-bridge' ) );
		}

		GFCB_Database::install();
		self::create_pages();
		self::add_capabilities();
		add_option( 'gfcb_active_connector', GFCB_Brand_Profile::GLOBAL_FSMS, '', false );
		add_option( 'gfcb_setup_complete', 'no', '', false );
		set_transient( 'gfcb_activation_redirect', 1, 60 );
		add_rewrite_endpoint( 'pos-overview', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'my-pos-stores', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-security', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-devices', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-subscription', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-verification', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-support', EP_ROOT | EP_PAGES );
		flush_rewrite_rules();
	}

	public static function deactivate() {
		flush_rewrite_rules();
	}

	private static function create_pages() {
		$pages = array(
			'sign-in'       => array( 'Global FSMS Sign In', '[gfcb_login]' ),
			'create-account' => array( 'Create Account', '[gfcb_registration]' ),
			'verify-account' => array( 'Verify Account', '[gfcb_verification]' ),
			'forgot-password'=> array( 'Forgot Password', '[gfcb_forgot_password]' ),
			'reset-password' => array( 'Reset Password', '[gfcb_forgot_password]' ),
			'account-portal' => array( 'My POS Account', '[gfcb_dashboard]' ),
			'store-setup'   => array( 'Store Setup', '[gfcb_store_setup]' ),
			'trial-activation'=> array( 'Trial Activation', '[gfcb_trial_activation]' ),
			'provisioning-status'=> array( 'Store Provisioning Status', '[gfcb_provisioning_status]' ),
			'payment-result'=> array( 'Payment Result', '[gfcb_payment_result]' ),
			'help-support'  => array( 'Help and Support', '[gfcb_support]' ),
		);

		$assigned = get_option( 'gfcb_pages', array() );
		foreach ( $pages as $key => $page ) {
			if ( ! empty( $assigned[ $key ] ) && get_post( (int) $assigned[ $key ] ) ) {
				continue;
			}
			$existing = get_page_by_path( $key, OBJECT, 'page' );
			$page_id  = $existing ? $existing->ID : wp_insert_post(
				array(
					'post_title'   => $page[0],
					'post_name'    => $key,
					'post_content' => $page[1],
					'post_status'  => 'publish',
					'post_type'    => 'page',
				),
				true
			);
			if ( ! is_wp_error( $page_id ) ) {
				$assigned[ $key ] = (int) $page_id;
			}
		}
		update_option( 'gfcb_pages', $assigned, false );
	}

	private static function add_capabilities() {
		$administrator = get_role( 'administrator' );
		if ( $administrator ) {
			foreach ( array( 'manage_gfcb', 'manage_gfcb_customers', 'manage_gfcb_stores', 'manage_gfcb_billing', 'manage_gfcb_security' ) as $capability ) {
				$administrator->add_cap( $capability );
			}
		}
	}
}
