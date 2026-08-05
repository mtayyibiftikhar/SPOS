<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Admin {
	public function register() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'settings' ) );
		add_action( 'admin_init', array( $this, 'activation_redirect' ) );
		add_action( 'admin_post_gfcb_switch_connector', array( $this, 'switch_connector' ) );
		add_action( 'admin_post_gfcb_test_connection', array( $this, 'test_connection' ) );
		add_action( 'admin_post_gfcb_finish_setup', array( $this, 'finish_setup' ) );
		add_action( 'admin_notices', array( $this, 'setup_notice' ) );
	}

	public function menu() {
		add_menu_page( __( 'Global FSMS', 'global-fsms-commerce-bridge' ), __( 'Global FSMS', 'global-fsms-commerce-bridge' ), 'manage_gfcb', 'gfcb', array( $this, 'dashboard' ), 'dashicons-store', 56 );
		add_submenu_page( 'gfcb', __( 'System Status', 'global-fsms-commerce-bridge' ), __( 'System Status', 'global-fsms-commerce-bridge' ), 'manage_gfcb', 'gfcb-status', array( $this, 'status' ) );
		add_submenu_page( 'gfcb', __( 'Integrations', 'global-fsms-commerce-bridge' ), __( 'Integrations', 'global-fsms-commerce-bridge' ), 'manage_gfcb', 'gfcb-integrations', array( $this, 'integrations' ) );
		add_submenu_page( 'gfcb', __( 'Page Settings', 'global-fsms-commerce-bridge' ), __( 'Page Settings', 'global-fsms-commerce-bridge' ), 'manage_gfcb', 'gfcb-pages', array( $this, 'pages' ) );
	}

	public function settings() {
		register_setting( 'gfcb_security', 'gfcb_security_settings', array( 'sanitize_callback' => array( $this, 'sanitize_security' ) ) );
		foreach ( GFCB_Brand_Profile::all() as $key => $profile ) {
			register_setting( 'gfcb_connector_' . $key, $profile['option_key'], array( 'sanitize_callback' => array( $this, 'sanitize_connector' ) ) );
		}
	}

	public function sanitize_security( $input ) {
		$old = get_option( 'gfcb_security_settings', array() );
		return array(
			'captcha_provider'    => isset( $input['captcha_provider'] ) && 'recaptcha' === $input['captcha_provider'] ? 'recaptcha' : 'turnstile',
			'turnstile_site_key' => sanitize_text_field( isset( $input['turnstile_site_key'] ) ? $input['turnstile_site_key'] : '' ),
			'turnstile_secret'   => ! empty( $input['turnstile_secret'] ) ? sanitize_text_field( $input['turnstile_secret'] ) : ( isset( $old['turnstile_secret'] ) ? $old['turnstile_secret'] : '' ),
			'recaptcha_site_key' => sanitize_text_field( isset( $input['recaptcha_site_key'] ) ? $input['recaptcha_site_key'] : '' ),
			'recaptcha_secret'   => ! empty( $input['recaptcha_secret'] ) ? sanitize_text_field( $input['recaptcha_secret'] ) : ( isset( $old['recaptcha_secret'] ) ? $old['recaptcha_secret'] : '' ),
			'recaptcha_minimum_score' => max( 0, min( 1, (float) ( isset( $input['recaptcha_minimum_score'] ) ? $input['recaptcha_minimum_score'] : 0.5 ) ) ),
			'otp_provider'       => isset( $input['otp_provider'] ) && 'twilio' === $input['otp_provider'] ? 'twilio' : 'disabled',
			'twilio_service_sid' => sanitize_text_field( isset( $input['twilio_service_sid'] ) ? $input['twilio_service_sid'] : '' ),
			'twilio_api_key'     => ! empty( $input['twilio_api_key'] ) ? sanitize_text_field( $input['twilio_api_key'] ) : ( isset( $old['twilio_api_key'] ) ? $old['twilio_api_key'] : '' ),
			'twilio_api_secret'  => ! empty( $input['twilio_api_secret'] ) ? sanitize_text_field( $input['twilio_api_secret'] ) : ( isset( $old['twilio_api_secret'] ) ? $old['twilio_api_secret'] : '' ),
		);
	}

	public function sanitize_connector( $input ) {
		$option_name = current_filter();
		$profile_key = false !== strpos( $option_name, GFCB_Brand_Profile::ABSHER_POS ) ? GFCB_Brand_Profile::ABSHER_POS : GFCB_Brand_Profile::GLOBAL_FSMS;
		$profiles    = GFCB_Brand_Profile::all();
		$old         = get_option( $profiles[ $profile_key ]['option_key'], array() );
		$base_url    = esc_url_raw( isset( $input['base_url'] ) ? untrailingslashit( $input['base_url'] ) : '' );
		$environment = isset( $input['environment'] ) && 'production' === $input['environment'] ? 'production' : 'test';
		$host        = wp_parse_url( $base_url, PHP_URL_HOST );
		$scheme      = wp_parse_url( $base_url, PHP_URL_SCHEME );
		$is_local    = in_array( $host, array( 'localhost', '127.0.0.1', '::1' ), true );
		if ( $base_url && 'https' !== $scheme && ! ( 'test' === $environment && $is_local ) ) {
			add_settings_error( 'gfcb_connector', 'gfcb_https_required', __( 'Connector URLs must use HTTPS. HTTP is allowed only for local test environments.', 'global-fsms-commerce-bridge' ) );
			$base_url = '';
		}
		$api_key     = ! empty( $input['api_key'] ) ? sanitize_text_field( $input['api_key'] ) : ( isset( $old['api_key'] ) ? $old['api_key'] : '' );
		$webhook_secret = ! empty( $input['webhook_secret'] ) ? sanitize_text_field( $input['webhook_secret'] ) : ( isset( $old['webhook_secret'] ) ? $old['webhook_secret'] : '' );
		return array(
			'base_url'    => $base_url,
			'api_key'     => $api_key,
			'webhook_secret' => $webhook_secret,
			'environment' => $environment,
			'fingerprint' => $base_url ? GFCB_Brand_Profile::fingerprint( $profile_key, $base_url ) : '',
		);
	}

	public function activation_redirect() {
		if ( ! get_transient( 'gfcb_activation_redirect' ) || wp_doing_ajax() || is_network_admin() ) {
			return;
		}
		delete_transient( 'gfcb_activation_redirect' );
		if ( current_user_can( 'manage_gfcb' ) ) {
			wp_safe_redirect( admin_url( 'admin.php?page=gfcb' ) );
			exit;
		}
	}

	public function setup_notice() {
		if ( 'yes' === get_option( 'gfcb_setup_complete' ) || ! current_user_can( 'manage_gfcb' ) ) {
			return;
		}
		echo '<div class="notice notice-warning"><p><strong>' . esc_html__( 'Global FSMS Commerce Bridge setup is incomplete.', 'global-fsms-commerce-bridge' ) . '</strong> <a href="' . esc_url( admin_url( 'admin.php?page=gfcb' ) ) . '">' . esc_html__( 'Open setup checklist', 'global-fsms-commerce-bridge' ) . '</a></p></div>';
	}

	public function dashboard() {
		$this->guard();
		$status = $this->status_data();
		?>
		<div class="wrap"><h1><?php esc_html_e( 'Global FSMS Commerce Bridge', 'global-fsms-commerce-bridge' ); ?></h1>
		<p><?php esc_html_e( 'Complete every item before allowing customer registration or provisioning.', 'global-fsms-commerce-bridge' ); ?></p>
		<table class="widefat striped"><tbody>
		<?php foreach ( $status as $label => $value ) : ?><tr><th><?php echo esc_html( $label ); ?></th><td><?php echo $value ? '<span style="color:#08783e">● ' . esc_html__( 'Ready', 'global-fsms-commerce-bridge' ) . '</span>' : '<span style="color:#b42318">● ' . esc_html__( 'Action required', 'global-fsms-commerce-bridge' ) . '</span>'; ?></td></tr><?php endforeach; ?>
		</tbody></table>
		<p><a class="button button-primary" href="<?php echo esc_url( admin_url( 'admin.php?page=gfcb-integrations' ) ); ?>"><?php esc_html_e( 'Configure integrations', 'global-fsms-commerce-bridge' ); ?></a> <a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=gfcb-pages' ) ); ?>"><?php esc_html_e( 'Review portal pages', 'global-fsms-commerce-bridge' ); ?></a></p></div>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="gfcb_finish_setup"><?php wp_nonce_field( 'gfcb_finish_setup' ); ?><?php submit_button( __( 'Validate and finish setup', 'global-fsms-commerce-bridge' ), 'primary' ); ?></form>
		<?php
	}

	public function integrations() {
		$this->guard();
		$active   = GFCB_Brand_Profile::active_key();
		$profiles = GFCB_Brand_Profile::all();
		?>
		<div class="wrap"><h1><?php esc_html_e( 'Integrations', 'global-fsms-commerce-bridge' ); ?></h1>
		<div class="notice notice-info inline"><p><strong><?php esc_html_e( 'Isolation rule:', 'global-fsms-commerce-bridge' ); ?></strong> <?php esc_html_e( 'Global FSMS and Absher POS use different URLs, keys, signatures, and connector fingerprints. Saving one profile never changes the other.', 'global-fsms-commerce-bridge' ); ?></p></div>
		<?php foreach ( $profiles as $key => $profile ) : $options = GFCB_Brand_Profile::connector_options( $key ); ?>
			<h2><?php echo esc_html( $profile['label'] ); ?> <?php echo $active === $key ? '<span class="dashicons dashicons-yes-alt" title="Active"></span>' : ''; ?></h2>
			<form method="post" action="options.php">
				<?php settings_fields( 'gfcb_connector_' . $key ); ?>
				<table class="form-table"><tr><th><label for="<?php echo esc_attr( $key ); ?>-url"><?php esc_html_e( 'Backend API URL', 'global-fsms-commerce-bridge' ); ?></label></th><td><input class="regular-text code" id="<?php echo esc_attr( $key ); ?>-url" type="url" name="<?php echo esc_attr( $profile['option_key'] ); ?>[base_url]" value="<?php echo esc_attr( isset( $options['base_url'] ) ? $options['base_url'] : '' ); ?>" placeholder="https://api.example.com" required></td></tr>
				<tr><th><label><?php esc_html_e( 'Environment', 'global-fsms-commerce-bridge' ); ?></label></th><td><select name="<?php echo esc_attr( $profile['option_key'] ); ?>[environment]"><option value="test" <?php selected( isset( $options['environment'] ) ? $options['environment'] : 'test', 'test' ); ?>>Test</option><option value="production" <?php selected( isset( $options['environment'] ) ? $options['environment'] : '', 'production' ); ?>>Production</option></select></td></tr>
				<tr><th><label><?php esc_html_e( 'Signing key', 'global-fsms-commerce-bridge' ); ?></label></th><td><input class="regular-text" type="password" name="<?php echo esc_attr( $profile['option_key'] ); ?>[api_key]" value="" autocomplete="new-password" placeholder="<?php echo ! empty( $options['api_key'] ) ? esc_attr__( 'Configured — leave blank to keep', 'global-fsms-commerce-bridge' ) : esc_attr__( 'Not configured', 'global-fsms-commerce-bridge' ); ?>"><p class="description"><?php esc_html_e( 'Never paste a key belonging to the other POS brand.', 'global-fsms-commerce-bridge' ); ?></p></td></tr>
				<tr><th><label><?php esc_html_e( 'Inbound webhook secret', 'global-fsms-commerce-bridge' ); ?></label></th><td><input class="regular-text" type="password" name="<?php echo esc_attr( $profile['option_key'] ); ?>[webhook_secret]" value="" autocomplete="new-password" placeholder="<?php echo ! empty( $options['webhook_secret'] ) ? esc_attr__( 'Configured — leave blank to keep', 'global-fsms-commerce-bridge' ) : esc_attr__( 'Not configured', 'global-fsms-commerce-bridge' ); ?>"></td></tr></table>
				<?php submit_button( sprintf( __( 'Save %s connector', 'global-fsms-commerce-bridge' ), $profile['label'] ) ); ?>
			</form>
		<?php endforeach; ?>

		<hr><h2><?php esc_html_e( 'Active connector', 'global-fsms-commerce-bridge' ); ?></h2>
		<p><strong><?php esc_html_e( 'POS webhook URL:', 'global-fsms-commerce-bridge' ); ?></strong> <code><?php echo esc_html( rest_url( GFCB_REST_Controller::NAMESPACE . '/webhooks/pos' ) ); ?></code></p>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="gfcb_test_connection"><?php wp_nonce_field( 'gfcb_test_connection' ); ?><?php submit_button( __( 'Test active POS connection', 'global-fsms-commerce-bridge' ), 'secondary', 'submit', false ); ?><?php $tested = get_option( 'gfcb_connection_test_' . $active, array() ); if ( ! empty( $tested['at'] ) ) : ?> <span><?php echo esc_html( sprintf( __( 'Last successful test: %s', 'global-fsms-commerce-bridge' ), $tested['at'] ) ); ?></span><?php endif; ?></form>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="gfcb_switch_connector"><?php wp_nonce_field( 'gfcb_switch_connector' ); ?>
			<select name="connector"><?php foreach ( $profiles as $key => $profile ) : ?><option value="<?php echo esc_attr( $key ); ?>" <?php selected( $active, $key ); ?>><?php echo esc_html( $profile['label'] ); ?></option><?php endforeach; ?></select>
			<p><label><?php esc_html_e( 'Type SWITCH CONNECTOR to confirm:', 'global-fsms-commerce-bridge' ); ?> <input name="confirmation" autocomplete="off"></label></p>
			<?php submit_button( __( 'Switch active connector', 'global-fsms-commerce-bridge' ), 'secondary' ); ?>
		</form>

		<hr><h2><?php esc_html_e( 'CAPTCHA and phone verification', 'global-fsms-commerce-bridge' ); ?></h2>
		<?php $security = get_option( 'gfcb_security_settings', array() ); ?>
		<form method="post" action="options.php"><?php settings_fields( 'gfcb_security' ); ?><table class="form-table">
		<tr><th><?php esc_html_e( 'CAPTCHA provider', 'global-fsms-commerce-bridge' ); ?></th><td><select name="gfcb_security_settings[captcha_provider]"><option value="turnstile" <?php selected( isset( $security['captcha_provider'] ) ? $security['captcha_provider'] : 'turnstile', 'turnstile' ); ?>>Cloudflare Turnstile</option><option value="recaptcha" <?php selected( isset( $security['captcha_provider'] ) ? $security['captcha_provider'] : '', 'recaptcha' ); ?>>Google reCAPTCHA v3</option></select></td></tr>
		<tr><th><?php esc_html_e( 'Turnstile site key', 'global-fsms-commerce-bridge' ); ?></th><td><input class="regular-text" name="gfcb_security_settings[turnstile_site_key]" value="<?php echo esc_attr( isset( $security['turnstile_site_key'] ) ? $security['turnstile_site_key'] : '' ); ?>"></td></tr><tr><th><?php esc_html_e( 'Turnstile secret', 'global-fsms-commerce-bridge' ); ?></th><td><input class="regular-text" type="password" name="gfcb_security_settings[turnstile_secret]" value="" placeholder="<?php echo ! empty( $security['turnstile_secret'] ) ? esc_attr__( 'Configured — leave blank to keep', 'global-fsms-commerce-bridge' ) : ''; ?>"></td></tr>
		<tr><th><?php esc_html_e( 'reCAPTCHA site key', 'global-fsms-commerce-bridge' ); ?></th><td><input class="regular-text" name="gfcb_security_settings[recaptcha_site_key]" value="<?php echo esc_attr( isset( $security['recaptcha_site_key'] ) ? $security['recaptcha_site_key'] : '' ); ?>"></td></tr><tr><th><?php esc_html_e( 'reCAPTCHA secret', 'global-fsms-commerce-bridge' ); ?></th><td><input class="regular-text" type="password" name="gfcb_security_settings[recaptcha_secret]" value="" placeholder="<?php echo ! empty( $security['recaptcha_secret'] ) ? esc_attr__( 'Configured — leave blank to keep', 'global-fsms-commerce-bridge' ) : ''; ?>"></td></tr><tr><th><?php esc_html_e( 'Minimum score', 'global-fsms-commerce-bridge' ); ?></th><td><input type="number" min="0" max="1" step="0.1" name="gfcb_security_settings[recaptcha_minimum_score]" value="<?php echo esc_attr( isset( $security['recaptcha_minimum_score'] ) ? $security['recaptcha_minimum_score'] : '0.5' ); ?>"></td></tr>
		<tr><th><?php esc_html_e( 'Phone OTP provider', 'global-fsms-commerce-bridge' ); ?></th><td><select name="gfcb_security_settings[otp_provider]"><option value="disabled" <?php selected( isset( $security['otp_provider'] ) ? $security['otp_provider'] : 'disabled', 'disabled' ); ?>>Disabled</option><option value="twilio" <?php selected( isset( $security['otp_provider'] ) ? $security['otp_provider'] : '', 'twilio' ); ?>>Twilio Verify</option></select></td></tr>
		<tr><th><?php esc_html_e( 'Twilio Verify Service SID', 'global-fsms-commerce-bridge' ); ?></th><td><input class="regular-text" name="gfcb_security_settings[twilio_service_sid]" value="<?php echo esc_attr( isset( $security['twilio_service_sid'] ) ? $security['twilio_service_sid'] : '' ); ?>"></td></tr><tr><th><?php esc_html_e( 'Twilio API key', 'global-fsms-commerce-bridge' ); ?></th><td><input class="regular-text" type="password" name="gfcb_security_settings[twilio_api_key]" value="" placeholder="<?php echo ! empty( $security['twilio_api_key'] ) ? esc_attr__( 'Configured — leave blank to keep', 'global-fsms-commerce-bridge' ) : ''; ?>"></td></tr><tr><th><?php esc_html_e( 'Twilio API secret', 'global-fsms-commerce-bridge' ); ?></th><td><input class="regular-text" type="password" name="gfcb_security_settings[twilio_api_secret]" value="" placeholder="<?php echo ! empty( $security['twilio_api_secret'] ) ? esc_attr__( 'Configured — leave blank to keep', 'global-fsms-commerce-bridge' ) : ''; ?>"></td></tr>
		</table><?php submit_button( __( 'Save security settings', 'global-fsms-commerce-bridge' ) ); ?></form>
		</div>
		<?php
	}

	public function switch_connector() {
		$this->guard();
		check_admin_referer( 'gfcb_switch_connector' );
		$target  = isset( $_POST['connector'] ) ? sanitize_key( wp_unslash( $_POST['connector'] ) ) : '';
		$confirm = isset( $_POST['confirmation'] ) ? sanitize_text_field( wp_unslash( $_POST['confirmation'] ) ) : '';
		if ( 'SWITCH CONNECTOR' !== $confirm || ! isset( GFCB_Brand_Profile::all()[ $target ] ) ) {
			wp_die( esc_html__( 'Connector switch confirmation failed.', 'global-fsms-commerce-bridge' ) );
		}
		$options = GFCB_Brand_Profile::connector_options( $target );
		if ( ! ( new GFCB_API_Client( $target ) )->is_configured() ) {
			wp_die( esc_html__( 'The target connector must be configured and locked before activation.', 'global-fsms-commerce-bridge' ) );
		}
		$old = GFCB_Brand_Profile::active_key();
		update_option( 'gfcb_active_connector', $target, false );
		GFCB_Database::audit( 'connector_switched', 'connector', $target, array( 'from' => $old, 'to' => $target ) );
		wp_safe_redirect( add_query_arg( 'switched', '1', admin_url( 'admin.php?page=gfcb-integrations' ) ) );
		exit;
	}

	public function test_connection() {
		$this->guard();
		check_admin_referer( 'gfcb_test_connection' );
		$profile = GFCB_Brand_Profile::active_key();
		$result  = ( new GFCB_API_Client( $profile ) )->request( 'GET', '/api/commerce-bridge/v1/status', array(), wp_generate_uuid4() );
		if ( is_wp_error( $result ) || empty( $result['ok'] ) || empty( $result['profile'] ) || $profile !== $result['profile'] ) {
			GFCB_Database::audit( 'connector_test_failed', 'connector', $profile );
			wp_die( esc_html__( 'Connection test failed. Confirm the active profile, API URL, signing key, and POS environment variables.', 'global-fsms-commerce-bridge' ) );
		}
		update_option( 'gfcb_connection_test_' . $profile, array( 'at' => current_time( 'mysql', true ), 'fingerprint' => GFCB_Brand_Profile::connector_options( $profile )['fingerprint'] ), false );
		GFCB_Database::audit( 'connector_test_succeeded', 'connector', $profile );
		wp_safe_redirect( add_query_arg( 'connection_test', 'success', admin_url( 'admin.php?page=gfcb-integrations' ) ) );
		exit;
	}

	public function finish_setup() {
		$this->guard();
		check_admin_referer( 'gfcb_finish_setup' );
		$missing = array_keys( array_filter( $this->status_data(), function ( $ready ) { return ! $ready; } ) );
		if ( $missing ) {
			wp_die( esc_html( sprintf( __( 'Setup is not ready. Complete: %s', 'global-fsms-commerce-bridge' ), implode( ', ', $missing ) ) ) );
		}
		update_option( 'gfcb_setup_complete', 'yes', false );
		GFCB_Database::audit( 'setup_completed', 'settings', 'setup' );
		wp_safe_redirect( add_query_arg( 'setup', 'complete', admin_url( 'admin.php?page=gfcb' ) ) );
		exit;
	}

	public function pages() {
		$this->guard();
		$pages = get_option( 'gfcb_pages', array() );
		?><div class="wrap"><h1><?php esc_html_e( 'Portal Pages', 'global-fsms-commerce-bridge' ); ?></h1><table class="widefat striped"><thead><tr><th><?php esc_html_e( 'Purpose', 'global-fsms-commerce-bridge' ); ?></th><th><?php esc_html_e( 'Page', 'global-fsms-commerce-bridge' ); ?></th><th><?php esc_html_e( 'Actions', 'global-fsms-commerce-bridge' ); ?></th></tr></thead><tbody><?php foreach ( $pages as $key => $page_id ) : ?><tr><td><?php echo esc_html( ucwords( str_replace( '-', ' ', $key ) ) ); ?></td><td><?php echo esc_html( get_the_title( $page_id ) ); ?></td><td><a href="<?php echo esc_url( get_edit_post_link( $page_id ) ); ?>"><?php esc_html_e( 'Edit', 'global-fsms-commerce-bridge' ); ?></a> · <a href="<?php echo esc_url( get_permalink( $page_id ) ); ?>"><?php esc_html_e( 'View', 'global-fsms-commerce-bridge' ); ?></a></td></tr><?php endforeach; ?></tbody></table></div><?php
	}

	public function status() {
		$this->guard();
		?><div class="wrap"><h1><?php esc_html_e( 'System Status', 'global-fsms-commerce-bridge' ); ?></h1><textarea class="large-text code" rows="16" readonly><?php echo esc_textarea( wp_json_encode( array( 'plugin_version' => GFCB_VERSION, 'active_connector' => GFCB_Brand_Profile::active_key(), 'checks' => $this->status_data() ), JSON_PRETTY_PRINT ) ); ?></textarea></div><?php
	}

	private function status_data() {
		$client = new GFCB_API_Client();
		$profile = GFCB_Brand_Profile::active_key();
		$options = GFCB_Brand_Profile::connector_options( $profile );
		$tested  = get_option( 'gfcb_connection_test_' . $profile, array() );
		$security = get_option( 'gfcb_security_settings', array() );
		$pages = get_option( 'gfcb_pages', array() );
		return array(
			__( 'WooCommerce active', 'global-fsms-commerce-bridge' ) => class_exists( 'WooCommerce' ),
			__( 'HTTPS enabled', 'global-fsms-commerce-bridge' ) => is_ssl(),
			__( 'Database installed', 'global-fsms-commerce-bridge' ) => GFCB_DB_VERSION === get_option( 'gfcb_db_version' ),
			__( 'Active connector securely locked', 'global-fsms-commerce-bridge' ) => $client->is_configured(),
			__( 'CAPTCHA configured', 'global-fsms-commerce-bridge' ) => (bool) GFCB_Captcha::site_key(),
			__( 'Phone OTP configured', 'global-fsms-commerce-bridge' ) => 'twilio' === ( isset( $security['otp_provider'] ) ? $security['otp_provider'] : '' ) && ! empty( $security['twilio_service_sid'] ) && ! empty( $security['twilio_api_key'] ) && ! empty( $security['twilio_api_secret'] ),
			__( 'Action Scheduler available', 'global-fsms-commerce-bridge' ) => function_exists( 'as_enqueue_async_action' ),
			__( 'Portal pages created', 'global-fsms-commerce-bridge' ) => count( array_filter( $pages, 'get_post' ) ) >= 11,
			__( 'WooCommerce products mapped', 'global-fsms-commerce-bridge' ) => (bool) GFCB_WooCommerce::mappings(),
			__( 'Active POS connection tested', 'global-fsms-commerce-bridge' ) => ! empty( $tested['at'] ) && ! empty( $tested['fingerprint'] ) && isset( $options['fingerprint'] ) && hash_equals( (string) $options['fingerprint'], (string) $tested['fingerprint'] ),
		);
	}

	private function guard() {
		if ( ! current_user_can( 'manage_gfcb' ) ) {
			wp_die( esc_html__( 'You are not allowed to manage this plugin.', 'global-fsms-commerce-bridge' ) );
		}
	}
}
