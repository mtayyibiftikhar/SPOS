<?php
/**
 * Plugin Name: Global FSMS Commerce Bridge
 * Plugin URI: https://globalfsms.com/
 * Description: Secure WooCommerce customer, verification, licensing, and POS provisioning bridge for Global FSMS.
 * Version: 1.0.0
 * Author: Global FSMS
 * Text Domain: global-fsms-commerce-bridge
 * Domain Path: /languages
 * Requires at least: 6.9
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * WC requires at least: 10.8
 * WC tested up to: 10.9.4
 * License: GPL-2.0-or-later
 */

defined( 'ABSPATH' ) || exit;

define( 'GFCB_VERSION', '1.0.0' );
define( 'GFCB_DB_VERSION', '3' );
define( 'GFCB_FILE', __FILE__ );
define( 'GFCB_PATH', plugin_dir_path( __FILE__ ) );
define( 'GFCB_URL', plugin_dir_url( __FILE__ ) );

require_once GFCB_PATH . 'includes/class-gfcb-brand-profile.php';
require_once GFCB_PATH . 'includes/class-gfcb-database.php';
require_once GFCB_PATH . 'includes/class-gfcb-activator.php';
require_once GFCB_PATH . 'includes/class-gfcb-rate-limiter.php';
require_once GFCB_PATH . 'includes/class-gfcb-captcha.php';
require_once GFCB_PATH . 'includes/class-gfcb-verification-service.php';
require_once GFCB_PATH . 'includes/class-gfcb-secret-vault.php';
require_once GFCB_PATH . 'includes/class-gfcb-api-client.php';
require_once GFCB_PATH . 'includes/class-gfcb-email-service.php';
require_once GFCB_PATH . 'includes/class-gfcb-trial-service.php';
require_once GFCB_PATH . 'includes/class-gfcb-store-service.php';
require_once GFCB_PATH . 'includes/class-gfcb-provisioning-service.php';
require_once GFCB_PATH . 'includes/class-gfcb-woocommerce.php';
require_once GFCB_PATH . 'includes/class-gfcb-rest-controller.php';
require_once GFCB_PATH . 'includes/class-gfcb-account.php';
require_once GFCB_PATH . 'includes/class-gfcb-elementor.php';
require_once GFCB_PATH . 'includes/class-gfcb-admin.php';
require_once GFCB_PATH . 'includes/class-gfcb-admin-pages.php';
require_once GFCB_PATH . 'includes/class-gfcb-plugin.php';

register_activation_hook( __FILE__, array( 'GFCB_Activator', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'GFCB_Activator', 'deactivate' ) );

add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( '\\Automattic\\WooCommerce\\Utilities\\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', GFCB_FILE, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', GFCB_FILE, true );
		}
	}
);

add_action(
	'plugins_loaded',
	static function () {
		load_plugin_textdomain( 'global-fsms-commerce-bridge', false, dirname( plugin_basename( GFCB_FILE ) ) . '/languages' );
		GFCB_Plugin::instance()->boot();
	},
	20
);
