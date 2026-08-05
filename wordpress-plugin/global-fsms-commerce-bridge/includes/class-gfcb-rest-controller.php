<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_REST_Controller {
	const NAMESPACE = 'gfcb/v1';

	public function register_routes() {
		register_rest_route( self::NAMESPACE, '/auth/register', array( 'methods' => 'POST', 'callback' => array( $this, 'register_customer' ), 'permission_callback' => '__return_true' ) );
		register_rest_route( self::NAMESPACE, '/auth/verify-email', array( 'methods' => 'POST', 'callback' => array( $this, 'verify_email' ), 'permission_callback' => '__return_true' ) );
		register_rest_route( self::NAMESPACE, '/auth/resend-email', array( 'methods' => 'POST', 'callback' => array( $this, 'resend_email' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/auth/request-phone-otp', array( 'methods' => 'POST', 'callback' => array( $this, 'request_phone_otp' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/auth/verify-phone-otp', array( 'methods' => 'POST', 'callback' => array( $this, 'verify_phone_otp' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/auth/password-reset/request', array( 'methods' => 'POST', 'callback' => array( $this, 'request_password_reset' ), 'permission_callback' => '__return_true' ) );
		register_rest_route( self::NAMESPACE, '/me', array( 'methods' => 'GET', 'callback' => array( $this, 'me' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores', array( 'methods' => 'GET', 'callback' => array( $this, 'stores' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/trial/activate', array( 'methods' => 'POST', 'callback' => array( $this, 'activate_trial' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})', array( 'methods' => 'GET', 'callback' => array( $this, 'store_detail' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/devices', array( 'methods' => 'GET', 'callback' => array( $this, 'store_devices' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/activation-code', array( 'methods' => 'POST', 'callback' => array( $this, 'activation_code' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/reveal-key', array( 'methods' => 'POST', 'callback' => array( $this, 'reveal_key' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/rotate-key', array( 'methods' => 'POST', 'callback' => array( $this, 'rotate_key' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/password-reset', array( 'methods' => 'POST', 'callback' => array( $this, 'pos_password_reset' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/password-setup-link', array( 'methods' => 'POST', 'callback' => array( $this, 'pos_password_setup_link' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/logout-all', array( 'methods' => 'POST', 'callback' => array( $this, 'logout_all' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/stores/(?P<store>[a-f0-9-]{36})/devices/(?P<device>[a-f0-9-]{36})/revoke', array( 'methods' => 'POST', 'callback' => array( $this, 'revoke_device' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/me/trial-status', array( 'methods' => 'GET', 'callback' => array( $this, 'trial_status' ), 'permission_callback' => array( $this, 'is_customer' ) ) );
		register_rest_route( self::NAMESPACE, '/webhooks/pos', array( 'methods' => 'POST', 'callback' => array( $this, 'pos_webhook' ), 'permission_callback' => '__return_true' ) );
		register_rest_route( self::NAMESPACE, '/system/status', array( 'methods' => 'GET', 'callback' => array( $this, 'system_status' ), 'permission_callback' => array( $this, 'can_manage' ) ) );
	}

	public function is_customer() {
		return is_user_logged_in();
	}

	public function can_manage() {
		return current_user_can( 'manage_gfcb' );
	}

	public function register_customer( WP_REST_Request $request ) {
		if ( ! function_exists( 'wc_create_new_customer' ) ) {
			return new WP_Error( 'gfcb_woocommerce_required', __( 'Customer registration is temporarily unavailable.', 'global-fsms-commerce-bridge' ), array( 'status' => 503 ) );
		}
		$limited = GFCB_Rate_Limiter::consume( 'register', GFCB_Rate_Limiter::request_identity(), 5, HOUR_IN_SECONDS );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}

		$captcha = GFCB_Captcha::provider()->verify( (string) $request->get_param( 'captcha_token' ), GFCB_Database::request_ip() );
		if ( is_wp_error( $captcha ) ) {
			return $captcha;
		}

		$first_name = sanitize_text_field( (string) $request->get_param( 'first_name' ) );
		$last_name  = sanitize_text_field( (string) $request->get_param( 'last_name' ) );
		$email      = GFCB_Verification_Service::normalize_email( $request->get_param( 'email' ) );
		$password   = (string) $request->get_param( 'password' );
		$confirm    = (string) $request->get_param( 'confirm_password' );
		$phone      = GFCB_Verification_Service::normalize_phone( $request->get_param( 'country_code' ), $request->get_param( 'phone' ) );

		if ( ! $first_name || ! $last_name || ! is_email( $email ) || ! $phone ) {
			return new WP_Error( 'gfcb_invalid_registration', __( 'Please enter valid account and contact details.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		if ( strlen( $password ) < 12 || $password !== $confirm ) {
			return new WP_Error( 'gfcb_invalid_password', __( 'Passwords must match and contain at least 12 characters.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		if ( ! rest_sanitize_boolean( $request->get_param( 'accept_terms' ) ) || ! rest_sanitize_boolean( $request->get_param( 'accept_privacy' ) ) ) {
			return new WP_Error( 'gfcb_consent_required', __( 'You must accept the Terms and Privacy Policy.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		if ( email_exists( $email ) || self::phone_exists( $phone ) ) {
			return new WP_Error( 'gfcb_identity_unavailable', __( 'An account cannot be created with these details. Try signing in or recovering your account.', 'global-fsms-commerce-bridge' ), array( 'status' => 409 ) );
		}

		$user_id = wc_create_new_customer( $email, '', $password, array( 'first_name' => $first_name, 'last_name' => $last_name ) );
		if ( is_wp_error( $user_id ) ) {
			return new WP_Error( 'gfcb_registration_failed', __( 'We could not create the account. Please try again.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}

		update_user_meta( $user_id, 'billing_first_name', $first_name );
		update_user_meta( $user_id, 'billing_last_name', $last_name );
		update_user_meta( $user_id, 'billing_phone', $phone );
		update_user_meta( $user_id, 'billing_country', sanitize_text_field( (string) $request->get_param( 'country' ) ) );
		update_user_meta( $user_id, 'gfcb_phone_e164', $phone );
		update_user_meta( $user_id, 'gfcb_business_name', sanitize_text_field( (string) $request->get_param( 'business_name' ) ) );
		update_user_meta( $user_id, 'gfcb_marketing_consent', rest_sanitize_boolean( $request->get_param( 'marketing_consent' ) ) ? 'yes' : 'no' );
		update_user_meta( $user_id, 'gfcb_account_status', 'verification_pending' );
		update_user_meta( $user_id, 'gfcb_terms_accepted_at', current_time( 'mysql', true ) );
		update_user_meta( $user_id, 'gfcb_privacy_accepted_at', current_time( 'mysql', true ) );

		GFCB_Verification_Service::send_email_verification( $user_id );
		wp_set_current_user( $user_id );
		wp_set_auth_cookie( $user_id, true, is_ssl() );
		GFCB_Database::audit( 'customer_registered', 'user', $user_id, array( 'connector_profile' => GFCB_Brand_Profile::active_key() ) );

		return new WP_REST_Response( array( 'success' => true, 'user_id' => $user_id, 'status' => 'verification_pending' ), 201 );
	}

	public function verify_email( WP_REST_Request $request ) {
		$limited = GFCB_Rate_Limiter::consume( 'verify_email', GFCB_Rate_Limiter::request_identity( (string) $request->get_param( 'user_id' ) ), 10, HOUR_IN_SECONDS );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}
		$result = GFCB_Verification_Service::verify_email( absint( $request->get_param( 'user_id' ) ), (string) $request->get_param( 'token' ) );
		return is_wp_error( $result ) ? $result : array( 'success' => true );
	}

	public function resend_email() {
		$user_id = get_current_user_id();
		$limited = GFCB_Rate_Limiter::consume( 'resend_email', (string) $user_id, 3, HOUR_IN_SECONDS );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}
		GFCB_Verification_Service::send_email_verification( $user_id );
		return array( 'success' => true, 'message' => __( 'If delivery is available, a new verification email will arrive shortly.', 'global-fsms-commerce-bridge' ) );
	}

	public function request_phone_otp( WP_REST_Request $request ) {
		$captcha = GFCB_Captcha::provider()->verify( (string) $request->get_param( 'captcha_token' ), GFCB_Database::request_ip() );
		if ( is_wp_error( $captcha ) ) {
			return $captcha;
		}
		$result = GFCB_Verification_Service::send_phone_otp( get_current_user_id() );
		return is_wp_error( $result ) ? $result : array( 'success' => true );
	}

	public function verify_phone_otp( WP_REST_Request $request ) {
		$result = GFCB_Verification_Service::verify_phone_otp( get_current_user_id(), preg_replace( '/\D+/', '', (string) $request->get_param( 'code' ) ) );
		return is_wp_error( $result ) ? $result : array( 'success' => true );
	}

	public function request_password_reset( WP_REST_Request $request ) {
		$limited = GFCB_Rate_Limiter::consume( 'password_reset', GFCB_Rate_Limiter::request_identity( strtolower( (string) $request->get_param( 'login' ) ) ), 3, HOUR_IN_SECONDS );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}
		$captcha = GFCB_Captcha::provider()->verify( (string) $request->get_param( 'captcha_token' ), GFCB_Database::request_ip() );
		if ( is_wp_error( $captcha ) ) {
			return $captcha;
		}
		$_POST['user_login'] = sanitize_text_field( (string) $request->get_param( 'login' ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing
		retrieve_password();
		return array( 'success' => true, 'message' => __( 'If the account exists, a password reset email will arrive shortly.', 'global-fsms-commerce-bridge' ) );
	}

	public function me() {
		$user_id = get_current_user_id();
		$user    = wp_get_current_user();
		return array(
			'id'             => $user_id,
			'name'           => $user->display_name,
			'email'          => $user->user_email,
			'phone'          => self::mask_phone( get_user_meta( $user_id, 'gfcb_phone_e164', true ) ),
			'account_status' => get_user_meta( $user_id, 'gfcb_account_status', true ) ?: 'verification_pending',
			'email_verified' => (bool) get_user_meta( $user_id, 'gfcb_email_verified_at', true ),
			'phone_verified' => (bool) get_user_meta( $user_id, 'gfcb_phone_verified_at', true ),
		);
	}

	public function stores() {
		global $wpdb;
		$table = GFCB_Database::table( 'stores' );
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE owner_user_id = %d AND connector_profile = %s ORDER BY id DESC LIMIT 100", get_current_user_id(), GFCB_Brand_Profile::active_key() ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return array( 'stores' => array_map( array( 'GFCB_Store_Service', 'public_view' ), $rows ?: array() ) );
	}

	public function activate_trial( WP_REST_Request $request ) {
		$limited = GFCB_Rate_Limiter::consume( 'trial_activate', (string) get_current_user_id() . '|' . GFCB_Rate_Limiter::request_identity(), 3, DAY_IN_SECONDS );
		if ( is_wp_error( $limited ) ) return $limited;
		$captcha = GFCB_Captcha::provider()->verify( (string) $request->get_param( 'captcha_token' ), GFCB_Database::request_ip() );
		if ( is_wp_error( $captcha ) ) return $captcha;
		if ( 'active' !== get_user_meta( get_current_user_id(), 'gfcb_account_status', true ) ) {
			return new WP_Error( 'gfcb_verification_required', __( 'Complete email and phone verification first.', 'global-fsms-commerce-bridge' ), array( 'status' => 403 ) );
		}
		$trial = get_option( 'gfcb_trial_settings', array() );
		if ( ! empty( $trial['payment_method_required'] ) ) {
			return new WP_Error( 'gfcb_trial_checkout_required', __( 'This trial requires checkout with a payment method.', 'global-fsms-commerce-bridge' ), array( 'status' => 409 ) );
		}
		$claim_id = GFCB_Trial_Service::reserve( get_current_user_id() );
		if ( is_wp_error( $claim_id ) ) return $claim_id;
		$days       = max( 1, min( 90, absint( isset( $trial['duration_days'] ) ? $trial['duration_days'] : 14 ) ) );
		$ends_at    = gmdate( 'Y-m-d H:i:s', time() + ( $days * DAY_IN_SECONDS ) );
		$store_data = array(
			'store_name'        => sanitize_text_field( (string) $request->get_param( 'store_name' ) ),
			'trading_name'      => sanitize_text_field( (string) $request->get_param( 'trading_name' ) ),
			'business_category' => sanitize_text_field( (string) $request->get_param( 'business_category' ) ),
			'country'           => sanitize_text_field( (string) $request->get_param( 'country' ) ),
			'currency'          => sanitize_text_field( (string) $request->get_param( 'currency' ) ),
			'timezone'          => sanitize_text_field( (string) $request->get_param( 'timezone' ) ),
			'contact_email'     => wp_get_current_user()->user_email,
			'contact_phone'     => get_user_meta( get_current_user_id(), 'gfcb_phone_e164', true ),
		);
		$store = GFCB_Store_Service::create_pending( get_current_user_id(), $store_data, array( 'plan_key' => isset( $trial['plan_key'] ) ? $trial['plan_key'] : 'trial', 'billing_cycle' => 'trial', 'trial_claim_id' => $claim_id, 'ends_at' => $ends_at, 'device_limit' => max( 1, absint( isset( $trial['included_devices'] ) ? $trial['included_devices'] : 1 ) ) ) );
		return is_wp_error( $store ) ? $store : new WP_REST_Response( array( 'success' => true, 'store' => GFCB_Store_Service::public_view( $store ) ), 202 );
	}

	public function store_detail( WP_REST_Request $request ) {
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		return array( 'store' => GFCB_Store_Service::public_view( $store ), 'devices' => $this->device_rows( $store['id'] ) );
	}

	public function store_devices( WP_REST_Request $request ) {
		$store = $this->owned_store( $request );
		return is_wp_error( $store ) ? $store : array( 'devices' => $this->device_rows( $store['id'] ) );
	}

	public function activation_code( WP_REST_Request $request ) {
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		$auth = $this->require_password( $request );
		if ( is_wp_error( $auth ) ) return $auth;
		$result = ( new GFCB_API_Client() )->request( 'POST', '/api/commerce-bridge/v1/stores/' . rawurlencode( $store['external_store_id'] ) . '/actions', array( 'action' => 'create_activation_code' ), wp_generate_uuid4() );
		if ( is_wp_error( $result ) ) return $result;
		GFCB_Database::audit( 'device_activation_code_created', 'store', $store['id'] );
		$response = new WP_REST_Response( array( 'code' => isset( $result['activation_code'] ) ? $result['activation_code'] : null, 'expires_at' => isset( $result['expires_at'] ) ? $result['expires_at'] : null ) );
		$response->header( 'Cache-Control', 'no-store, private' );
		return $response;
	}

	public function reveal_key( WP_REST_Request $request ) {
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		$limited = GFCB_Rate_Limiter::consume( 'reveal_key', (string) get_current_user_id(), 3, 15 * MINUTE_IN_SECONDS );
		if ( is_wp_error( $limited ) ) return $limited;
		$auth = $this->require_password( $request );
		if ( is_wp_error( $auth ) ) return $auth;
		$key = GFCB_Secret_Vault::decrypt( $store['encrypted_store_key'] );
		if ( is_wp_error( $key ) ) return $key;
		GFCB_Database::audit( 'store_key_revealed', 'store', $store['id'] );
		$response = new WP_REST_Response( array( 'store_key' => $key ) );
		$response->header( 'Cache-Control', 'no-store, private' );
		return $response;
	}

	public function rotate_key( WP_REST_Request $request ) {
		global $wpdb;
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		$auth = $this->require_password( $request );
		if ( is_wp_error( $auth ) ) return $auth;
		$result = ( new GFCB_API_Client() )->request( 'POST', '/api/commerce-bridge/v1/stores/' . rawurlencode( $store['external_store_id'] ) . '/actions', array( 'action' => 'rotate_key' ), wp_generate_uuid4() );
		if ( is_wp_error( $result ) || empty( $result['product_key'] ) ) return is_wp_error( $result ) ? $result : new WP_Error( 'gfcb_rotation_failed', __( 'The store key could not be rotated.', 'global-fsms-commerce-bridge' ) );
		$encrypted = GFCB_Secret_Vault::encrypt( $result['product_key'] );
		if ( is_wp_error( $encrypted ) ) return $encrypted;
		$wpdb->update( GFCB_Database::table( 'stores' ), array( 'encrypted_store_key' => $encrypted, 'store_key_last_four' => substr( $result['product_key'], -4 ), 'store_key_rotated_at' => current_time( 'mysql', true ), 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $store['id'] ) );
		GFCB_Database::audit( 'store_key_rotated', 'store', $store['id'] );
		GFCB_Email_Service::send( 'key_rotated', get_current_user_id(), array( 'store' => $store ) );
		return array( 'success' => true, 'masked_key' => '•••• •••• •••• ' . substr( $result['product_key'], -4 ) );
	}

	public function pos_password_reset( WP_REST_Request $request ) {
		global $wpdb;
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		$new = (string) $request->get_param( 'new_pos_password' );
		if ( strlen( $new ) < 12 || $new !== (string) $request->get_param( 'confirm_pos_password' ) ) {
			return new WP_Error( 'gfcb_invalid_pos_password', __( 'The new POS password must match and contain at least 12 characters.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		$setup_token = (string) $request->get_param( 'setup_token' );
		$auth = $setup_token ? GFCB_Verification_Service::consume_pos_password_token( get_current_user_id(), $store['uuid'], $setup_token ) : $this->require_password( $request );
		if ( is_wp_error( $auth ) ) return $auth;
		$result = ( new GFCB_API_Client() )->request( 'POST', '/api/commerce-bridge/v1/stores/' . rawurlencode( $store['external_store_id'] ) . '/actions', array( 'action' => 'reset_admin_password', 'new_password' => $new, 'logout_all' => true ), wp_generate_uuid4() );
		unset( $new );
		if ( is_wp_error( $result ) ) return $result;
		$wpdb->update( GFCB_Database::table( 'stores' ), array( 'pos_password_changed_at' => current_time( 'mysql', true ), 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $store['id'] ) );
		GFCB_Database::audit( 'pos_admin_password_reset', 'store', $store['id'] );
		GFCB_Email_Service::send( 'pos_password_changed', get_current_user_id(), array( 'store' => $store ) );
		return array( 'success' => true );
	}

	public function pos_password_setup_link( WP_REST_Request $request ) {
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		$auth = $this->require_password( $request );
		if ( is_wp_error( $auth ) ) return $auth;
		$token = GFCB_Verification_Service::issue_pos_password_token( get_current_user_id(), $store['uuid'] );
		$url   = add_query_arg( array( 'gfcb_pos_setup' => $token, 'store' => $store['uuid'] ), wc_get_account_endpoint_url( 'pos-security' ) );
		$user  = wp_get_current_user();
		$sent  = wp_mail( $user->user_email, __( 'Set your POS administrator password', 'global-fsms-commerce-bridge' ), sprintf( __( "Use this secure link to set a new POS administrator password:\n\n%s\n\nThe link expires in 10 minutes and works once.", 'global-fsms-commerce-bridge' ), esc_url_raw( $url ) ) );
		GFCB_Database::audit( 'pos_password_setup_link_sent', 'store', $store['id'] );
		return $sent ? array( 'success' => true ) : new WP_Error( 'gfcb_email_failed', __( 'The password setup email could not be sent.', 'global-fsms-commerce-bridge' ), array( 'status' => 503 ) );
	}

	public function logout_all( WP_REST_Request $request ) {
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		$auth = $this->require_password( $request );
		if ( is_wp_error( $auth ) ) return $auth;
		$result = ( new GFCB_API_Client() )->request( 'POST', '/api/commerce-bridge/v1/stores/' . rawurlencode( $store['external_store_id'] ) . '/actions', array( 'action' => 'logout_all' ), wp_generate_uuid4() );
		if ( is_wp_error( $result ) ) return $result;
		GFCB_Database::audit( 'store_sessions_revoked', 'store', $store['id'] );
		return array( 'success' => true );
	}

	public function revoke_device( WP_REST_Request $request ) {
		global $wpdb;
		$store = $this->owned_store( $request );
		if ( is_wp_error( $store ) ) return $store;
		$device = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . GFCB_Database::table( 'devices' ) . ' WHERE uuid = %s AND store_id = %d', sanitize_text_field( $request['device'] ), $store['id'] ), ARRAY_A );
		if ( ! $device ) return new WP_Error( 'gfcb_device_not_found', __( 'Device not found.', 'global-fsms-commerce-bridge' ), array( 'status' => 404 ) );
		$result = ( new GFCB_API_Client() )->request( 'POST', '/api/commerce-bridge/v1/stores/' . rawurlencode( $store['external_store_id'] ) . '/actions', array( 'action' => 'revoke_device', 'device_id' => $device['external_device_id'] ), wp_generate_uuid4() );
		if ( is_wp_error( $result ) ) return $result;
		$wpdb->update( GFCB_Database::table( 'devices' ), array( 'status' => 'revoked', 'revoked_at' => current_time( 'mysql', true ), 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $device['id'] ) );
		GFCB_Database::audit( 'device_revoked', 'device', $device['uuid'], array( 'store_id' => $store['id'] ) );
		GFCB_Email_Service::send( 'device_revoked', get_current_user_id(), array( 'store' => $store ) );
		return array( 'success' => true );
	}

	public function trial_status() {
		global $wpdb;
		$table = GFCB_Database::table( 'trial_claims' );
		$row   = $wpdb->get_row( $wpdb->prepare( "SELECT status, reserved_at, activated_at, expired_at, store_id FROM {$table} WHERE user_id = %d AND connector_profile = %s ORDER BY id DESC LIMIT 1", get_current_user_id(), GFCB_Brand_Profile::active_key() ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return array( 'eligible' => ! $row, 'claim' => $row ?: null );
	}

	public function system_status() {
		global $wpdb;
		$client = new GFCB_API_Client();
		return array(
			'plugin_version'    => GFCB_VERSION,
			'database_version'  => get_option( 'gfcb_db_version' ),
			'woocommerce'       => defined( 'WC_VERSION' ) ? WC_VERSION : null,
			'action_scheduler'  => function_exists( 'as_enqueue_async_action' ),
			'active_connector'  => GFCB_Brand_Profile::active_key(),
			'connector_locked'  => $client->is_configured(),
			'https'             => is_ssl(),
			'turnstile'         => (bool) GFCB_Captcha::site_key(),
			'database_reachable'=> (bool) $wpdb->get_var( 'SELECT 1' ), // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		);
	}

	public function pos_webhook( WP_REST_Request $request ) {
		global $wpdb;
		$profile   = sanitize_key( (string) $request->get_header( 'x-gfcb-profile' ) );
		$timestamp = absint( $request->get_header( 'x-gfcb-timestamp' ) );
		$signature = (string) $request->get_header( 'x-gfcb-signature' );
		$event_id  = sanitize_text_field( (string) $request->get_header( 'x-gfcb-event-id' ) );
		$options   = GFCB_Brand_Profile::connector_options( $profile );
		$constant  = GFCB_Brand_Profile::GLOBAL_FSMS === $profile ? 'GFCB_GLOBAL_FSMS_WEBHOOK_SECRET' : 'GFCB_ABSHER_POS_WEBHOOK_SECRET';
		$secret    = defined( $constant ) ? (string) constant( $constant ) : ( isset( $options['webhook_secret'] ) ? (string) $options['webhook_secret'] : '' );
		$body      = $request->get_body();
		if ( $profile !== GFCB_Brand_Profile::active_key() || ! $secret || ! $timestamp || abs( time() - $timestamp ) > 300 || ! $event_id ) {
			GFCB_Database::audit( 'webhook_validation_failed', 'webhook', $event_id ?: 'unknown' );
			return new WP_Error( 'gfcb_webhook_unauthorized', __( 'Webhook authorization failed.', 'global-fsms-commerce-bridge' ), array( 'status' => 401 ) );
		}
		$expected = hash_hmac( 'sha256', $timestamp . '.' . $body, $secret );
		if ( ! hash_equals( $expected, $signature ) ) {
			GFCB_Database::audit( 'webhook_validation_failed', 'webhook', $event_id );
			return new WP_Error( 'gfcb_webhook_unauthorized', __( 'Webhook authorization failed.', 'global-fsms-commerce-bridge' ), array( 'status' => 401 ) );
		}
		$payload = json_decode( $body, true );
		if ( ! is_array( $payload ) || empty( $payload['event_type'] ) ) {
			return new WP_Error( 'gfcb_webhook_invalid', __( 'Webhook payload is invalid.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		$inserted = $wpdb->query(
			$wpdb->prepare(
				'INSERT IGNORE INTO ' . GFCB_Database::table( 'webhook_events' ) . ' (provider,external_event_id,event_type,payload_hash,processing_status,attempts,received_at) VALUES (%s,%s,%s,%s,%s,%d,%s)',
				$profile, $event_id, sanitize_key( $payload['event_type'] ), hash( 'sha256', $body ), 'received', 0, current_time( 'mysql', true )
			)
		);
		if ( ! $inserted ) {
			return array( 'success' => true, 'duplicate' => true );
		}
		$result = $this->apply_webhook_event( $payload );
		$status = is_wp_error( $result ) ? 'failed' : 'processed';
		$wpdb->update( GFCB_Database::table( 'webhook_events' ), array( 'processing_status' => $status, 'attempts' => 1, 'processed_at' => current_time( 'mysql', true ) ), array( 'provider' => $profile, 'external_event_id' => $event_id ) );
		return is_wp_error( $result ) ? $result : array( 'success' => true );
	}

	private function apply_webhook_event( $payload ) {
		global $wpdb;
		$external_store_id = sanitize_text_field( isset( $payload['store_id'] ) ? $payload['store_id'] : '' );
		$stores_table      = GFCB_Database::table( 'stores' );
		$store             = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$stores_table} WHERE external_store_id = %s AND connector_profile = %s", $external_store_id, GFCB_Brand_Profile::active_key() ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $store ) return new WP_Error( 'gfcb_webhook_store_missing', __( 'Webhook store not found.', 'global-fsms-commerce-bridge' ), array( 'status' => 404 ) );
		$type = sanitize_key( $payload['event_type'] );
		if ( 'device_activated' === $type ) {
			$device = isset( $payload['device'] ) && is_array( $payload['device'] ) ? $payload['device'] : array();
			$uuid   = ! empty( $device['uuid'] ) ? sanitize_text_field( $device['uuid'] ) : wp_generate_uuid4();
			$now    = current_time( 'mysql', true );
			$wpdb->replace( GFCB_Database::table( 'devices' ), array( 'uuid' => $uuid, 'external_device_id' => sanitize_text_field( isset( $device['id'] ) ? $device['id'] : '' ), 'store_id' => $store['id'], 'device_name' => sanitize_text_field( isset( $device['name'] ) ? $device['name'] : __( 'POS device', 'global-fsms-commerce-bridge' ) ), 'device_type' => sanitize_text_field( isset( $device['type'] ) ? $device['type'] : '' ), 'platform' => sanitize_text_field( isset( $device['platform'] ) ? $device['platform'] : '' ), 'app_version' => sanitize_text_field( isset( $device['app_version'] ) ? $device['app_version'] : '' ), 'status' => 'active', 'activated_at' => $now, 'last_seen_at' => $now, 'created_at' => $now, 'updated_at' => $now ) );
			GFCB_Email_Service::send( 'device_activated', (int) $store['owner_user_id'], array( 'store' => $store ) );
		} elseif ( 'device_revoked' === $type ) {
			$wpdb->update( GFCB_Database::table( 'devices' ), array( 'status' => 'revoked', 'revoked_at' => current_time( 'mysql', true ), 'updated_at' => current_time( 'mysql', true ) ), array( 'external_device_id' => sanitize_text_field( isset( $payload['device_id'] ) ? $payload['device_id'] : '' ), 'store_id' => $store['id'] ) );
		} elseif ( in_array( $type, array( 'store_access_blocked', 'store_access_restored', 'store_updated' ), true ) ) {
			$status = 'store_access_blocked' === $type ? 'locked' : ( 'store_access_restored' === $type ? 'active' : sanitize_key( isset( $payload['status'] ) ? $payload['status'] : $store['status'] ) );
			$wpdb->update( $stores_table, array( 'status' => $status, 'last_synced_at' => current_time( 'mysql', true ), 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $store['id'] ) );
		}
		GFCB_Database::audit( $type, 'store', $store['id'] );
		return true;
	}

	private function owned_store( WP_REST_Request $request ) {
		$store = GFCB_Store_Service::get_by_uuid_owned( sanitize_text_field( (string) $request['store'] ), get_current_user_id() );
		return $store ?: new WP_Error( 'gfcb_store_not_found', __( 'Store not found.', 'global-fsms-commerce-bridge' ), array( 'status' => 404 ) );
	}

	private function require_password( WP_REST_Request $request ) {
		$user = wp_get_current_user();
		$password = (string) $request->get_param( 'current_password' );
		if ( ! $password || ! wp_check_password( $password, $user->user_pass, $user->ID ) ) {
			return new WP_Error( 'gfcb_reauthentication_failed', __( 'Your current website password is incorrect.', 'global-fsms-commerce-bridge' ), array( 'status' => 403 ) );
		}
		return true;
	}

	private function device_rows( $store_id ) {
		global $wpdb;
		$table = GFCB_Database::table( 'devices' );
		return $wpdb->get_results( $wpdb->prepare( "SELECT uuid,device_name,device_type,platform,app_version,status,activated_at,last_seen_at,revoked_at FROM {$table} WHERE store_id = %d ORDER BY id DESC LIMIT 100", $store_id ), ARRAY_A ) ?: array(); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	private static function phone_exists( $phone ) {
		$query = new WP_User_Query( array( 'number' => 1, 'fields' => 'ids', 'meta_key' => 'gfcb_phone_e164', 'meta_value' => $phone ) ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		return ! empty( $query->get_results() );
	}

	private static function mask_phone( $phone ) {
		$phone = (string) $phone;
		return strlen( $phone ) > 4 ? substr( $phone, 0, 4 ) . str_repeat( '•', max( 2, strlen( $phone ) - 8 ) ) . substr( $phone, -4 ) : '';
	}
}
