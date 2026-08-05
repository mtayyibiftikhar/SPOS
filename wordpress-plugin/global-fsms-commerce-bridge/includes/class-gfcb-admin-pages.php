<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Admin_Pages {
	public function register() {
		add_action( 'admin_menu', array( $this, 'menu' ), 20 );
		foreach ( array( 'save_product_mappings', 'save_business_settings', 'save_email_templates', 'retry_job', 'admin_store_action', 'send_test_email' ) as $action ) {
			add_action( 'admin_post_gfcb_' . $action, array( $this, $action ) );
		}
	}

	public function menu() {
		$items = array(
			'gfcb-customers' => array( 'Customers', 'manage_gfcb_customers', 'customers' ),
			'gfcb-stores' => array( 'Stores', 'manage_gfcb_stores', 'stores' ),
			'gfcb-devices' => array( 'Devices', 'manage_gfcb_stores', 'devices' ),
			'gfcb-subscriptions' => array( 'Subscriptions', 'manage_gfcb_billing', 'subscriptions' ),
			'gfcb-trials' => array( 'Trial Claims', 'manage_gfcb_billing', 'trials' ),
			'gfcb-provisioning' => array( 'Provisioning Queue', 'manage_gfcb_stores', 'provisioning' ),
			'gfcb-webhooks' => array( 'Webhook Logs', 'manage_gfcb_security', 'webhooks' ),
			'gfcb-audit' => array( 'Audit Logs', 'manage_gfcb_security', 'audit' ),
			'gfcb-emails' => array( 'Email Templates', 'manage_gfcb', 'emails' ),
			'gfcb-products' => array( 'Product Mapping', 'manage_gfcb_billing', 'products' ),
			'gfcb-tools' => array( 'Tools', 'manage_gfcb', 'tools' ),
			'gfcb-settings' => array( 'Settings', 'manage_gfcb', 'settings_page' ),
		);
		foreach ( $items as $slug => $item ) {
			add_submenu_page( 'gfcb', __( $item[0], 'global-fsms-commerce-bridge' ), __( $item[0], 'global-fsms-commerce-bridge' ), $item[1], $slug, array( $this, $item[2] ) ); // phpcs:ignore WordPress.WP.I18n.NonSingularStringLiteralText
		}
	}

	public function customers() {
		$this->guard( 'manage_gfcb_customers' );
		$query = new WP_User_Query( array( 'role__in' => array( 'customer', 'subscriber' ), 'number' => 25, 'paged' => $this->page_number(), 'orderby' => 'registered', 'order' => 'DESC' ) );
		$rows  = array();
		foreach ( $query->get_results() as $user ) {
			$rows[] = array( 'ID' => $user->ID, 'Name' => $user->display_name, 'Email' => $user->user_email, 'Phone' => get_user_meta( $user->ID, 'gfcb_phone_e164', true ), 'Email verified' => get_user_meta( $user->ID, 'gfcb_email_verified_at', true ) ? 'Yes' : 'No', 'Phone verified' => get_user_meta( $user->ID, 'gfcb_phone_verified_at', true ) ? 'Yes' : 'No', 'Status' => get_user_meta( $user->ID, 'gfcb_account_status', true ) );
		}
		$this->render_table( __( 'Customers', 'global-fsms-commerce-bridge' ), $rows, (int) ceil( $query->get_total() / 25 ) );
	}

	public function stores() {
		$this->guard( 'manage_gfcb_stores' );
		$data = $this->db_page( GFCB_Database::table( 'stores' ), 'id,uuid,external_store_id,owner_user_id,store_name,status,provisioning_status,plan_key,device_limit,ends_at,last_synced_at' );
		$this->render_table( __( 'Stores', 'global-fsms-commerce-bridge' ), $data['rows'], $data['pages'], array( $this, 'store_actions' ) );
	}

	public function devices() {
		$this->guard( 'manage_gfcb_stores' );
		$data = $this->db_page( GFCB_Database::table( 'devices' ), 'id,uuid,external_device_id,store_id,device_name,platform,app_version,status,activated_at,last_seen_at,revoked_at' );
		$this->render_table( __( 'Devices', 'global-fsms-commerce-bridge' ), $data['rows'], $data['pages'] );
	}

	public function subscriptions() {
		$this->guard( 'manage_gfcb_billing' );
		$rows = array();
		if ( function_exists( 'wcs_get_subscriptions' ) ) {
			foreach ( wcs_get_subscriptions( array( 'subscriptions_per_page' => 50, 'orderby' => 'ID', 'order' => 'DESC' ) ) as $subscription ) {
				$rows[] = array( 'ID' => $subscription->get_id(), 'Customer' => $subscription->get_user_id(), 'Status' => $subscription->get_status(), 'Total' => wp_strip_all_tags( $subscription->get_formatted_order_total() ), 'Next payment' => $subscription->get_date_to_display( 'next_payment' ), 'End' => $subscription->get_date_to_display( 'end' ) );
			}
		} else {
			$rows[] = array( 'Status' => __( 'WooCommerce Subscriptions is not active.', 'global-fsms-commerce-bridge' ) );
		}
		$this->render_table( __( 'Subscriptions', 'global-fsms-commerce-bridge' ), $rows, 1 );
	}

	public function trials() { $this->render_db( 'manage_gfcb_billing', 'Trial Claims', 'trial_claims', 'id,connector_profile,user_id,status,reserved_at,activated_at,expired_at,store_id,source_order_id,admin_override_by' ); }
	public function webhooks() { $this->render_db( 'manage_gfcb_security', 'Webhook Logs', 'webhook_events', 'id,provider,external_event_id,event_type,processing_status,attempts,received_at,processed_at' ); }
	public function audit() { $this->render_db( 'manage_gfcb_security', 'Audit Logs', 'audit_log', 'id,actor_type,actor_id,event_type,object_type,object_id,ip_address,reason,created_at' ); }

	public function provisioning() {
		$this->guard( 'manage_gfcb_stores' );
		$data = $this->db_page( GFCB_Database::table( 'provisioning_jobs' ), 'id,request_id,connector_profile,job_type,object_id,status,attempts,next_attempt_at,last_error,created_at,completed_at' );
		$this->render_table( __( 'Provisioning Queue', 'global-fsms-commerce-bridge' ), $data['rows'], $data['pages'], array( $this, 'job_actions' ) );
	}

	public function products() {
		$this->guard( 'manage_gfcb_billing' );
		$products = function_exists( 'wc_get_products' ) ? wc_get_products( array( 'limit' => 200, 'status' => array( 'publish', 'draft', 'private' ), 'orderby' => 'name' ) ) : array();
		$maps     = GFCB_WooCommerce::mappings();
		?>
		<div class="wrap"><h1><?php esc_html_e( 'Product Mapping', 'global-fsms-commerce-bridge' ); ?></h1><p><?php esc_html_e( 'WooCommerce collects money; these mappings create independent store and device entitlements after confirmed payment.', 'global-fsms-commerce-bridge' ); ?></p>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="gfcb_save_product_mappings"><?php wp_nonce_field( 'gfcb_save_product_mappings' ); ?>
		<table class="widefat striped"><thead><tr><th>Product</th><th>Entitlement</th><th>Plan key</th><th>Devices</th><th>Days</th><th>Cycle</th><th>Hidden</th></tr></thead><tbody>
		<?php foreach ( $products as $product ) : $id = $product->get_id(); $map = isset( $maps[ $id ] ) ? $maps[ $id ] : array(); ?><tr><td><?php echo esc_html( $product->get_name() ); ?> (#<?php echo esc_html( $id ); ?>)</td><td><select name="mapping[<?php echo esc_attr( $id ); ?>][type]"><?php foreach ( array( '' => 'Not mapped', 'plan' => 'Store plan', 'additional_store' => 'Additional store', 'additional_device' => 'Additional device', 'device_pack' => 'Device pack' ) as $value => $label ) : ?><option value="<?php echo esc_attr( $value ); ?>" <?php selected( isset( $map['type'] ) ? $map['type'] : '', $value ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></td><td><input name="mapping[<?php echo esc_attr( $id ); ?>][plan_key]" value="<?php echo esc_attr( isset( $map['plan_key'] ) ? $map['plan_key'] : '' ); ?>"></td><td><input type="number" min="1" max="1000" name="mapping[<?php echo esc_attr( $id ); ?>][devices]" value="<?php echo esc_attr( isset( $map['devices'] ) ? $map['devices'] : 1 ); ?>"></td><td><input type="number" min="1" max="3650" name="mapping[<?php echo esc_attr( $id ); ?>][duration_days]" value="<?php echo esc_attr( isset( $map['duration_days'] ) ? $map['duration_days'] : 365 ); ?>"></td><td><select name="mapping[<?php echo esc_attr( $id ); ?>][billing_cycle]"><?php foreach ( array( 'monthly', 'annual', 'one_time', 'subscription' ) as $cycle ) : ?><option value="<?php echo esc_attr( $cycle ); ?>" <?php selected( isset( $map['billing_cycle'] ) ? $map['billing_cycle'] : 'monthly', $cycle ); ?>><?php echo esc_html( $cycle ); ?></option><?php endforeach; ?></select></td><td><input type="checkbox" name="mapping[<?php echo esc_attr( $id ); ?>][hidden]" value="1" <?php checked( ! empty( $map['hidden'] ) ); ?>></td></tr><?php endforeach; ?>
		</tbody></table><?php submit_button( __( 'Save product mappings', 'global-fsms-commerce-bridge' ) ); ?></form></div><?php
	}

	public function emails() {
		$this->guard( 'manage_gfcb' ); $templates = GFCB_Email_Service::templates();
		?><div class="wrap"><h1><?php esc_html_e( 'Email Templates', 'global-fsms-commerce-bridge' ); ?></h1><form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="gfcb_save_email_templates"><?php wp_nonce_field( 'gfcb_save_email_templates' ); ?><?php foreach ( $templates as $key => $template ) : ?><h2><?php echo esc_html( ucwords( str_replace( '_', ' ', $key ) ) ); ?></h2><table class="form-table"><tr><th>Subject</th><td><input class="large-text" name="templates[<?php echo esc_attr( $key ); ?>][subject]" value="<?php echo esc_attr( $template['subject'] ); ?>"></td></tr><tr><th>Heading</th><td><input class="large-text" name="templates[<?php echo esc_attr( $key ); ?>][heading]" value="<?php echo esc_attr( $template['heading'] ); ?>"></td></tr><tr><th>Intro</th><td><textarea class="large-text" name="templates[<?php echo esc_attr( $key ); ?>][intro]" rows="3"><?php echo esc_textarea( $template['intro'] ); ?></textarea></td></tr></table><?php endforeach; ?><?php submit_button( __( 'Save email templates', 'global-fsms-commerce-bridge' ) ); ?></form></div><?php
	}

	public function settings_page() {
		$this->guard( 'manage_gfcb' ); $trial = get_option( 'gfcb_trial_settings', array() );
		?><div class="wrap"><h1><?php esc_html_e( 'Business Settings', 'global-fsms-commerce-bridge' ); ?></h1><form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="gfcb_save_business_settings"><?php wp_nonce_field( 'gfcb_save_business_settings' ); ?><table class="form-table"><tr><th>Trial duration</th><td><input type="number" min="1" max="90" name="trial_duration_days" value="<?php echo esc_attr( isset( $trial['duration_days'] ) ? $trial['duration_days'] : 14 ); ?>"> days</td></tr><tr><th>Included devices</th><td><input type="number" min="1" max="100" name="included_devices" value="<?php echo esc_attr( isset( $trial['included_devices'] ) ? $trial['included_devices'] : 1 ); ?>"></td></tr><tr><th>Trial plan key</th><td><input name="trial_plan_key" value="<?php echo esc_attr( isset( $trial['plan_key'] ) ? $trial['plan_key'] : 'trial' ); ?>"></td></tr><tr><th>Payment method required</th><td><input type="checkbox" name="payment_method_required" value="1" <?php checked( ! empty( $trial['payment_method_required'] ) ); ?>></td></tr><tr><th>Grace period</th><td><input type="number" min="0" max="30" name="grace_period_days" value="<?php echo esc_attr( get_option( 'gfcb_grace_period_days', 5 ) ); ?>"> days</td></tr></table><?php submit_button( __( 'Save business settings', 'global-fsms-commerce-bridge' ) ); ?></form></div><?php
	}

	public function tools() {
		$this->guard( 'manage_gfcb' );
		?><div class="wrap"><h1><?php esc_html_e( 'Tools', 'global-fsms-commerce-bridge' ); ?></h1><h2><?php esc_html_e( 'Send test email', 'global-fsms-commerce-bridge' ); ?></h2><form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="gfcb_send_test_email"><?php wp_nonce_field( 'gfcb_send_test_email' ); ?><input type="email" name="email" value="<?php echo esc_attr( wp_get_current_user()->user_email ); ?>" required><?php submit_button( __( 'Send test', 'global-fsms-commerce-bridge' ), 'secondary' ); ?></form><h2><?php esc_html_e( 'Connection status', 'global-fsms-commerce-bridge' ); ?></h2><p><?php echo ( new GFCB_API_Client() )->is_configured() ? esc_html__( 'Active connector is configured and fingerprint-locked.', 'global-fsms-commerce-bridge' ) : esc_html__( 'Active connector is incomplete.', 'global-fsms-commerce-bridge' ); ?></p></div><?php
	}

	public function save_product_mappings() {
		$this->guard( 'manage_gfcb_billing' ); check_admin_referer( 'gfcb_save_product_mappings' );
		$raw = isset( $_POST['mapping'] ) && is_array( $_POST['mapping'] ) ? wp_unslash( $_POST['mapping'] ) : array(); $out = array();
		foreach ( $raw as $product_id => $map ) { $type = isset( $map['type'] ) ? sanitize_key( $map['type'] ) : ''; if ( ! in_array( $type, array( 'plan', 'additional_store', 'additional_device', 'device_pack' ), true ) ) continue; $out[ absint( $product_id ) ] = array( 'type' => $type, 'plan_key' => sanitize_key( $map['plan_key'] ), 'devices' => max( 1, min( 1000, absint( $map['devices'] ) ) ), 'duration_days' => max( 1, min( 3650, absint( $map['duration_days'] ) ) ), 'billing_cycle' => sanitize_key( $map['billing_cycle'] ), 'hidden' => ! empty( $map['hidden'] ) ); }
		update_option( 'gfcb_product_mappings', $out, false ); GFCB_Database::audit( 'product_mappings_updated', 'settings', 'product_mappings' ); $this->redirect( 'gfcb-products' );
	}

	public function save_business_settings() {
		$this->guard( 'manage_gfcb' ); check_admin_referer( 'gfcb_save_business_settings' );
		update_option( 'gfcb_trial_settings', array( 'duration_days' => max( 1, min( 90, absint( $_POST['trial_duration_days'] ) ) ), 'included_devices' => max( 1, min( 100, absint( $_POST['included_devices'] ) ) ), 'plan_key' => sanitize_key( wp_unslash( $_POST['trial_plan_key'] ) ), 'payment_method_required' => ! empty( $_POST['payment_method_required'] ) ), false );
		update_option( 'gfcb_grace_period_days', max( 0, min( 30, absint( $_POST['grace_period_days'] ) ) ), false ); GFCB_Database::audit( 'business_settings_updated', 'settings', 'business' ); $this->redirect( 'gfcb-settings' );
	}

	public function save_email_templates() {
		$this->guard( 'manage_gfcb' ); check_admin_referer( 'gfcb_save_email_templates' ); $raw = isset( $_POST['templates'] ) && is_array( $_POST['templates'] ) ? wp_unslash( $_POST['templates'] ) : array(); $out = array();
		foreach ( GFCB_Email_Service::templates() as $key => $default ) { if ( isset( $raw[ $key ] ) ) $out[ $key ] = array( 'subject' => sanitize_text_field( $raw[ $key ]['subject'] ), 'heading' => sanitize_text_field( $raw[ $key ]['heading'] ), 'intro' => sanitize_textarea_field( $raw[ $key ]['intro'] ) ); }
		update_option( 'gfcb_email_templates', $out, false ); GFCB_Database::audit( 'email_templates_updated', 'settings', 'emails' ); $this->redirect( 'gfcb-emails' );
	}

	public function retry_job() { $this->guard( 'manage_gfcb_stores' ); check_admin_referer( 'gfcb_retry_job' ); GFCB_Provisioning_Service::retry( sanitize_text_field( wp_unslash( $_GET['request_id'] ) ) ); $this->redirect( 'gfcb-provisioning' ); }

	public function admin_store_action() {
		global $wpdb; $this->guard( 'manage_gfcb_stores' ); check_admin_referer( 'gfcb_admin_store_action' ); $store_id = absint( $_POST['store_id'] ); $action = sanitize_key( wp_unslash( $_POST['store_action'] ) ); $reason = sanitize_textarea_field( wp_unslash( $_POST['reason'] ) );
		if ( ! $reason || ! in_array( $action, array( 'suspend', 'reactivate' ), true ) ) wp_die( esc_html__( 'A valid action and audit reason are required.', 'global-fsms-commerce-bridge' ) );
		$store = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . GFCB_Database::table( 'stores' ) . ' WHERE id=%d', $store_id ), ARRAY_A ); if ( ! $store ) wp_die( 'Store not found.' ); $status = 'suspend' === $action ? 'suspended' : 'active';
		$wpdb->update( GFCB_Database::table( 'stores' ), array( 'status' => $status, 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $store_id ) ); GFCB_Provisioning_Service::enqueue_store_action( $store_id, 'update_access', array( 'status' => $status, 'reason' => $reason ) ); GFCB_Database::audit( 'admin_store_' . $action, 'store', $store_id, array( 'reason' => $reason ) ); $this->redirect( 'gfcb-stores' );
	}

	public function send_test_email() { $this->guard( 'manage_gfcb' ); check_admin_referer( 'gfcb_send_test_email' ); wp_mail( sanitize_email( wp_unslash( $_POST['email'] ) ), 'Global FSMS test email', '<p>Your transactional email configuration is working.</p>', array( 'Content-Type: text/html; charset=UTF-8' ) ); $this->redirect( 'gfcb-tools' ); }
	public function store_actions( $row ) { return '<form style="display:flex;gap:6px" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="gfcb_admin_store_action"><input type="hidden" name="store_id" value="' . esc_attr( $row['id'] ) . '">' . wp_nonce_field( 'gfcb_admin_store_action', '_wpnonce', true, false ) . '<select name="store_action"><option value="suspend">Suspend</option><option value="reactivate">Reactivate</option></select><input name="reason" placeholder="Required reason" required><button class="button">Apply</button></form>'; }
	public function job_actions( $row ) { return in_array( $row['status'], array( 'failed', 'manual_review', 'retrying' ), true ) ? '<a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=gfcb_retry_job&request_id=' . rawurlencode( $row['request_id'] ) ), 'gfcb_retry_job' ) ) . '">Retry</a>' : ''; }

	private function render_db( $cap, $title, $name, $columns ) { $this->guard( $cap ); $data = $this->db_page( GFCB_Database::table( $name ), $columns ); $this->render_table( __( $title, 'global-fsms-commerce-bridge' ), $data['rows'], $data['pages'] ); } // phpcs:ignore WordPress.WP.I18n.NonSingularStringLiteralText
	private function db_page( $table, $columns ) { global $wpdb; $limit = 25; $offset = ( $this->page_number() - 1 ) * $limit; $rows = $wpdb->get_results( "SELECT {$columns} FROM {$table} ORDER BY id DESC LIMIT {$limit} OFFSET {$offset}", ARRAY_A ); $total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ); return array( 'rows' => $rows ?: array(), 'pages' => max( 1, (int) ceil( $total / $limit ) ) ); } // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery.DirectQuery
	private function render_table( $title, $rows, $pages, $actions = null ) { ?><div class="wrap"><h1><?php echo esc_html( $title ); ?></h1><table class="widefat striped"><thead><tr><?php if ( $rows ) foreach ( array_keys( $rows[0] ) as $key ) echo '<th>' . esc_html( ucwords( str_replace( '_', ' ', $key ) ) ) . '</th>'; if ( $actions ) echo '<th>Actions</th>'; ?></tr></thead><tbody><?php if ( ! $rows ) echo '<tr><td>No records found.</td></tr>'; foreach ( $rows as $row ) { echo '<tr>'; foreach ( $row as $value ) echo '<td>' . esc_html( is_scalar( $value ) ? (string) $value : wp_json_encode( $value ) ) . '</td>'; if ( $actions ) echo '<td>' . call_user_func( $actions, $row ) . '</td>'; echo '</tr>'; } ?></tbody></table><?php if ( $pages > 1 ) echo '<p>' . wp_kses_post( paginate_links( array( 'total' => $pages, 'current' => $this->page_number() ) ) ) . '</p>'; ?></div><?php }
	private function page_number() { return max( 1, isset( $_GET['paged'] ) ? absint( $_GET['paged'] ) : 1 ); } // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	private function guard( $cap ) { if ( ! current_user_can( $cap ) ) wp_die( esc_html__( 'You are not allowed to manage this area.', 'global-fsms-commerce-bridge' ) ); }
	private function redirect( $page ) { wp_safe_redirect( add_query_arg( 'updated', '1', admin_url( 'admin.php?page=' . $page ) ) ); exit; }
}

