<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_WooCommerce {
	public function register() {
		add_filter( 'woocommerce_product_is_visible', array( $this, 'hide_system_products' ), 10, 2 );
		add_filter( 'wp_sitemaps_posts_query_args', array( $this, 'exclude_system_products_from_sitemap' ), 10, 2 );
		add_action( 'woocommerce_checkout_create_order_line_item', array( $this, 'order_item_meta' ), 10, 4 );
		add_action( 'woocommerce_payment_complete', array( __CLASS__, 'process_paid_order' ) );
		add_action( 'woocommerce_order_status_processing', array( __CLASS__, 'process_paid_order' ) );
		add_action( 'woocommerce_order_status_completed', array( __CLASS__, 'process_paid_order' ) );
		add_action( 'woocommerce_order_status_refunded', array( __CLASS__, 'mark_order_manual_review' ) );
		add_action( 'woocommerce_subscription_status_updated', array( __CLASS__, 'subscription_status_updated' ), 10, 3 );
		add_action( 'woocommerce_subscription_renewal_payment_complete', array( __CLASS__, 'subscription_payment_recovered' ), 10, 2 );
		add_action( 'woocommerce_subscription_payment_failed', array( __CLASS__, 'subscription_payment_failed' ), 10, 2 );
		add_action( 'woocommerce_subscription_renewal_payment_failed', array( __CLASS__, 'subscription_payment_failed' ), 10, 2 );
		add_action( 'admin_post_gfcb_store_checkout', array( $this, 'store_checkout' ) );
		add_action( 'admin_post_gfcb_device_checkout', array( $this, 'device_checkout' ) );
	}

	public static function mappings() {
		$mappings = get_option( 'gfcb_product_mappings', array() );
		return is_array( $mappings ) ? $mappings : array();
	}

	public function hide_system_products( $visible, $product_id ) {
		$mappings = self::mappings();
		return ! empty( $mappings[ $product_id ]['hidden'] ) ? false : $visible;
	}

	public function exclude_system_products_from_sitemap( $args, $post_type ) {
		if ( 'product' !== $post_type ) {
			return $args;
		}
		$hidden = array();
		foreach ( self::mappings() as $product_id => $mapping ) {
			if ( ! empty( $mapping['hidden'] ) ) {
				$hidden[] = absint( $product_id );
			}
		}
		if ( $hidden ) {
			$args['post__not_in'] = array_values( array_unique( array_merge( isset( $args['post__not_in'] ) ? $args['post__not_in'] : array(), $hidden ) ) );
		}
		return $args;
	}

	public function store_checkout() {
		$this->checkout_guard( 'gfcb_store_checkout' );
		$product_id = isset( $_POST['product_id'] ) ? absint( $_POST['product_id'] ) : 0;
		$mapping    = isset( self::mappings()[ $product_id ] ) ? self::mappings()[ $product_id ] : array();
		if ( ! in_array( isset( $mapping['type'] ) ? $mapping['type'] : '', array( 'plan', 'additional_store' ), true ) ) {
			wp_die( esc_html__( 'The selected product is not mapped to a store plan.', 'global-fsms-commerce-bridge' ) );
		}
		$input = array(
			'store_name'        => sanitize_text_field( isset( $_POST['store_name'] ) ? wp_unslash( $_POST['store_name'] ) : '' ),
			'trading_name'      => sanitize_text_field( isset( $_POST['trading_name'] ) ? wp_unslash( $_POST['trading_name'] ) : '' ),
			'business_category' => sanitize_text_field( isset( $_POST['business_category'] ) ? wp_unslash( $_POST['business_category'] ) : '' ),
			'country'           => sanitize_text_field( isset( $_POST['country'] ) ? wp_unslash( $_POST['country'] ) : 'SA' ),
			'currency'          => sanitize_text_field( isset( $_POST['currency'] ) ? wp_unslash( $_POST['currency'] ) : 'SAR' ),
			'timezone'          => sanitize_text_field( isset( $_POST['timezone'] ) ? wp_unslash( $_POST['timezone'] ) : 'Asia/Riyadh' ),
			'contact_email'     => sanitize_email( isset( $_POST['contact_email'] ) ? wp_unslash( $_POST['contact_email'] ) : '' ),
			'contact_phone'     => sanitize_text_field( isset( $_POST['contact_phone'] ) ? wp_unslash( $_POST['contact_phone'] ) : '' ),
		);
		if ( ! $input['store_name'] ) {
			wp_die( esc_html__( 'Store name is required.', 'global-fsms-commerce-bridge' ) );
		}
		$this->load_cart();
		WC()->cart->add_to_cart( $product_id, 1, 0, array(), array( 'gfcb_request_id' => wp_generate_uuid4(), 'gfcb_store_request' => $input, 'gfcb_entitlement_type' => $mapping['type'] ) );
		wp_safe_redirect( wc_get_checkout_url() );
		exit;
	}

	public function device_checkout() {
		$this->checkout_guard( 'gfcb_device_checkout' );
		$product_id = isset( $_POST['product_id'] ) ? absint( $_POST['product_id'] ) : 0;
		$store_uuid = isset( $_POST['store_uuid'] ) ? sanitize_text_field( wp_unslash( $_POST['store_uuid'] ) ) : '';
		$quantity   = isset( $_POST['quantity'] ) ? max( 1, min( 100, absint( $_POST['quantity'] ) ) ) : 1;
		$mapping    = isset( self::mappings()[ $product_id ] ) ? self::mappings()[ $product_id ] : array();
		$store      = GFCB_Store_Service::get_by_uuid_owned( $store_uuid, get_current_user_id() );
		if ( ! $store || ! in_array( isset( $mapping['type'] ) ? $mapping['type'] : '', array( 'additional_device', 'device_pack' ), true ) ) {
			wp_die( esc_html__( 'The device purchase request is invalid.', 'global-fsms-commerce-bridge' ) );
		}
		$this->load_cart();
		WC()->cart->add_to_cart( $product_id, $quantity, 0, array(), array( 'gfcb_request_id' => wp_generate_uuid4(), 'gfcb_store_uuid' => $store_uuid, 'gfcb_entitlement_type' => $mapping['type'] ) );
		wp_safe_redirect( wc_get_checkout_url() );
		exit;
	}

	public function order_item_meta( $item, $cart_item_key, $values, $order ) {
		foreach ( array( 'gfcb_request_id', 'gfcb_store_uuid', 'gfcb_entitlement_type' ) as $key ) {
			if ( isset( $values[ $key ] ) ) {
				$item->add_meta_data( '_' . $key, sanitize_text_field( $values[ $key ] ), true );
			}
		}
		if ( isset( $values['gfcb_store_request'] ) ) {
			$item->add_meta_data( '_gfcb_store_request', wp_json_encode( $values['gfcb_store_request'] ), true );
		}
	}

	public static function process_paid_order( $order_id ) {
		if ( ! function_exists( 'wc_get_order' ) ) {
			return;
		}
		$order = wc_get_order( $order_id );
		if ( ! $order || ! $order->is_paid() ) {
			return;
		}
		$user_id  = (int) $order->get_user_id();
		$mappings = self::mappings();
		$all_processed = true;
		foreach ( $order->get_items( 'line_item' ) as $item_id => $item ) {
			$product_id = $item->get_product_id();
			if ( empty( $mappings[ $product_id ] ) || $item->get_meta( '_gfcb_processed_at', true ) ) {
				continue;
			}
			$mapping = $mappings[ $product_id ];
			$type    = sanitize_key( isset( $mapping['type'] ) ? $mapping['type'] : '' );
			$processed = false;
			if ( in_array( $type, array( 'plan', 'additional_store' ), true ) ) {
				$processed = self::create_store_from_item( $order, $item, $mapping );
			} elseif ( in_array( $type, array( 'additional_device', 'device_pack' ), true ) ) {
				$processed = self::apply_devices_from_item( $order, $item, $mapping );
			}
			if ( ! $processed ) {
				$all_processed = false;
				continue;
			}
			$item->update_meta_data( '_gfcb_processed_at', current_time( 'mysql', true ) );
			$item->save();
		}
		if ( $all_processed ) {
			$order->update_meta_data( '_gfcb_entitlements_processed_at', current_time( 'mysql', true ) );
		}
		$order->save();
	}

	private static function create_store_from_item( $order, $item, $mapping ) {
		$user_id = (int) $order->get_user_id();
		$request = json_decode( (string) $item->get_meta( '_gfcb_store_request', true ), true );
		if ( ! $user_id || ! is_array( $request ) ) {
			return false;
		}
		$subscription_id = self::subscription_id_for_order( $order );
		$starts_at       = current_time( 'mysql', true );
		$ends_at         = self::calculate_end( $mapping, $subscription_id );
		$store = GFCB_Store_Service::create_pending(
			$user_id,
			$request,
			array(
				'plan_key'       => isset( $mapping['plan_key'] ) ? $mapping['plan_key'] : 'paid',
				'billing_cycle'  => isset( $mapping['billing_cycle'] ) ? $mapping['billing_cycle'] : 'one_time',
				'subscription_id'=> $subscription_id,
				'source_order_id'=> $order->get_id(),
				'request_id'     => (string) $item->get_meta( '_gfcb_request_id', true ),
				'starts_at'      => $starts_at,
				'ends_at'        => $ends_at,
				'device_limit'   => max( 1, absint( isset( $mapping['devices'] ) ? $mapping['devices'] : 1 ) ),
			)
		);
		if ( is_array( $store ) ) {
			$item->update_meta_data( '_gfcb_store_id', (int) $store['id'] );
			return self::insert_entitlement( $user_id, (int) $store['id'], 'store_plan', 1, 'order_item', (string) $item->get_id(), $starts_at, $ends_at );
		}
		return false;
	}

	private static function apply_devices_from_item( $order, $item, $mapping ) {
		global $wpdb;
		$user_id = (int) $order->get_user_id();
		$store   = GFCB_Store_Service::get_by_uuid_owned( (string) $item->get_meta( '_gfcb_store_uuid', true ), $user_id );
		if ( ! $store ) {
			return false;
		}
		$per_item = max( 1, absint( isset( $mapping['devices'] ) ? $mapping['devices'] : 1 ) );
		$quantity = max( 1, (int) $item->get_quantity() * $per_item );
		$source   = (string) $item->get_id();
		if ( ! self::insert_entitlement( $user_id, (int) $store['id'], 'devices', $quantity, 'order_item', $source, current_time( 'mysql', true ), self::calculate_end( $mapping, self::subscription_id_for_order( $order ) ) ) ) {
			return false;
		}
		$new_limit = (int) $store['device_limit'] + $quantity;
		$wpdb->update( GFCB_Database::table( 'stores' ), array( 'device_limit' => $new_limit, 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $store['id'] ), array( '%d', '%s' ), array( '%d' ) );
		$item->update_meta_data( '_gfcb_previous_allowance', (int) $store['device_limit'] );
		$item->update_meta_data( '_gfcb_new_allowance', $new_limit );
		GFCB_Provisioning_Service::enqueue_store_action( (int) $store['id'], 'update_device_allowance', array( 'device_limit' => $new_limit ), (string) $item->get_meta( '_gfcb_request_id', true ) );
		GFCB_Database::audit( 'device_allowance_increased', 'store', $store['id'], array( 'previous' => (int) $store['device_limit'], 'new' => $new_limit, 'order_id' => $order->get_id() ) );
		return true;
	}

	private static function insert_entitlement( $user_id, $store_id, $type, $quantity, $source_type, $source_id, $starts_at, $ends_at ) {
		global $wpdb;
		$now = current_time( 'mysql', true );
		$result = $wpdb->query(
			$wpdb->prepare(
				'INSERT IGNORE INTO ' . GFCB_Database::table( 'entitlements' ) . ' (user_id,store_id,entitlement_type,quantity,status,source_type,source_id,starts_at,ends_at,created_at,updated_at) VALUES (%d,%d,%s,%d,%s,%s,%s,%s,%s,%s,%s)',
				$user_id, $store_id, $type, $quantity, 'active', $source_type, $source_id, $starts_at, $ends_at, $now, $now
			)
		);
		if ( $result ) {
			return true;
		}
		$existing = $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . GFCB_Database::table( 'entitlements' ) . ' WHERE source_type = %s AND source_id = %s AND entitlement_type = %s LIMIT 1', $source_type, $source_id, $type ) );
		return (bool) $existing;
	}

	private static function subscription_id_for_order( $order ) {
		if ( function_exists( 'wcs_get_subscriptions_for_order' ) ) {
			$subscriptions = wcs_get_subscriptions_for_order( $order, array( 'order_type' => 'any' ) );
			$subscription  = $subscriptions ? reset( $subscriptions ) : false;
			return $subscription ? (int) $subscription->get_id() : null;
		}
		return null;
	}

	private static function calculate_end( $mapping, $subscription_id = null ) {
		if ( $subscription_id && function_exists( 'wcs_get_subscription' ) ) {
			$subscription = wcs_get_subscription( $subscription_id );
			if ( $subscription ) {
				$end = $subscription->get_date( 'end' ) ?: $subscription->get_date( 'next_payment' );
				if ( $end ) return gmdate( 'Y-m-d H:i:s', strtotime( $end . ' UTC' ) );
			}
		}
		$days = max( 1, absint( isset( $mapping['duration_days'] ) ? $mapping['duration_days'] : 365 ) );
		return gmdate( 'Y-m-d H:i:s', time() + ( $days * DAY_IN_SECONDS ) );
	}

	public static function subscription_payment_failed( $subscription, $order = null ) {
		self::set_subscription_store_status( $subscription, 'grace_period', 'payment_failed' );
	}

	public static function subscription_payment_recovered( $subscription, $order = null ) {
		self::set_subscription_store_status( $subscription, 'active', 'payment_recovered' );
	}

	public static function subscription_status_updated( $subscription, $new_status, $old_status ) {
		$map = array( 'active' => 'active', 'on-hold' => 'grace_period', 'pending-cancel' => 'active', 'cancelled' => 'cancelled', 'expired' => 'expired' );
		if ( isset( $map[ $new_status ] ) ) {
			self::set_subscription_store_status( $subscription, $map[ $new_status ], 'subscription_' . sanitize_key( $new_status ) );
		}
	}

	private static function set_subscription_store_status( $subscription, $status, $reason ) {
		global $wpdb;
		$subscription_id = is_object( $subscription ) ? (int) $subscription->get_id() : absint( $subscription );
		$table           = GFCB_Database::table( 'stores' );
		$stores          = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE subscription_id = %d", $subscription_id ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$grace_days      = max( 0, absint( get_option( 'gfcb_grace_period_days', 5 ) ) );
		foreach ( $stores ?: array() as $store ) {
			$effective = $status;
			$data      = array( 'status' => $status, 'updated_at' => current_time( 'mysql', true ) );
			if ( 'grace_period' === $status ) {
				$data['grace_ends_at'] = gmdate( 'Y-m-d H:i:s', time() + ( $grace_days * DAY_IN_SECONDS ) );
				GFCB_Email_Service::send( 'payment_failed', (int) $store['owner_user_id'], array( 'store' => $store ) );
			} elseif ( 'active' === $status ) {
				$data['grace_ends_at'] = null;
				GFCB_Email_Service::send( 'store_reactivated', (int) $store['owner_user_id'], array( 'store' => $store ) );
			} elseif ( 'cancelled' === $status && is_object( $subscription ) && $subscription->get_date( 'end' ) ) {
				$data['ends_at'] = gmdate( 'Y-m-d H:i:s', strtotime( $subscription->get_date( 'end' ) . ' UTC' ) );
				$effective = 'active';
				$data['status'] = 'active';
			}
			$wpdb->update( $table, $data, array( 'id' => $store['id'] ) );
			GFCB_Provisioning_Service::enqueue_store_action( (int) $store['id'], 'update_access', array( 'status' => $effective, 'ends_at' => isset( $data['ends_at'] ) ? $data['ends_at'] : $store['ends_at'], 'grace_ends_at' => isset( $data['grace_ends_at'] ) ? $data['grace_ends_at'] : null, 'reason' => $reason ) );
			GFCB_Database::audit( 'subscription_status_changed', 'store', $store['id'], array( 'status' => $effective, 'reason' => $reason ) );
		}
	}

	public static function mark_order_manual_review( $order_id ) {
		global $wpdb;
		$table  = GFCB_Database::table( 'stores' );
		$stores = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE source_order_id = %d", $order_id ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		foreach ( $stores ?: array() as $store ) {
			$wpdb->update( $table, array( 'status' => 'manual_review', 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $store['id'] ) );
			GFCB_Provisioning_Service::enqueue_store_action( (int) $store['id'], 'update_access', array( 'status' => 'manual_review', 'reason' => 'order_refunded' ) );
		}
	}

	public static function enforce_expired_access() {
		global $wpdb;
		$table = GFCB_Database::table( 'stores' );
		$rows  = $wpdb->get_results( "SELECT * FROM {$table} WHERE (status IN ('trialing','active','cancelled') AND ends_at IS NOT NULL AND ends_at <= UTC_TIMESTAMP()) OR (status = 'grace_period' AND grace_ends_at IS NOT NULL AND grace_ends_at <= UTC_TIMESTAMP())", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery.DirectQuery
		foreach ( $rows ?: array() as $store ) {
			$wpdb->update( $table, array( 'status' => 'locked', 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $store['id'] ) );
			GFCB_Provisioning_Service::enqueue_store_action( (int) $store['id'], 'update_access', array( 'status' => 'locked', 'reason' => 'entitlement_expired' ) );
			GFCB_Email_Service::send( 'store_locked', (int) $store['owner_user_id'], array( 'store' => $store ) );
		}
	}

	private function checkout_guard( $action ) {
		if ( ! is_user_logged_in() || ! function_exists( 'WC' ) ) {
			wp_die( esc_html__( 'Please sign in before continuing to checkout.', 'global-fsms-commerce-bridge' ) );
		}
		check_admin_referer( $action );
		if ( 'active' !== get_user_meta( get_current_user_id(), 'gfcb_account_status', true ) ) {
			wp_die( esc_html__( 'Complete email and phone verification before purchasing a POS entitlement.', 'global-fsms-commerce-bridge' ) );
		}
	}

	private function load_cart() {
		if ( null === WC()->cart && function_exists( 'wc_load_cart' ) ) {
			wc_load_cart();
		}
	}
}
