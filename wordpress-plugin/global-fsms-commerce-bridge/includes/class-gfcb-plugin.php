<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Plugin {
	private static $instance;

	public static function instance() {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	public function boot() {
		add_filter( 'password_reset_expiration', static function () { return 600; } );
		add_action( 'rest_api_init', array( new GFCB_REST_Controller(), 'register_routes' ) );

		if ( get_option( 'gfcb_db_version' ) !== GFCB_DB_VERSION ) {
			GFCB_Database::install();
		}

		( new GFCB_Account() )->register();
		( new GFCB_Elementor() )->register();
		( new GFCB_WooCommerce() )->register();
		GFCB_Provisioning_Service::register();
		GFCB_Email_Service::register();
		if ( is_admin() ) {
			( new GFCB_Admin() )->register();
			( new GFCB_Admin_Pages() )->register();
		}

		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action( 'admin_notices', array( $this, 'woocommerce_notice' ) );
		}
	}

	public function woocommerce_notice() {
		if ( current_user_can( 'activate_plugins' ) ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Global FSMS Commerce Bridge requires WooCommerce to be installed and active.', 'global-fsms-commerce-bridge' ) . '</p></div>';
		}
	}
}
