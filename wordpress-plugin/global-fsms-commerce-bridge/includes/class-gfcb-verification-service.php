<?php

defined( 'ABSPATH' ) || exit;

interface GFCB_OTP_Provider {
	public function send( $phone_e164, $code );
	public function verify( $phone_e164, $code );
	public function health();
	public function is_managed();
}

final class GFCB_Disabled_OTP_Provider implements GFCB_OTP_Provider {
	public function send( $phone_e164, $code ) {
		return new WP_Error( 'gfcb_otp_not_configured', __( 'Phone verification is not configured. Please contact support.', 'global-fsms-commerce-bridge' ), array( 'status' => 503 ) );
	}
	public function verify( $phone_e164, $code ) { return new WP_Error( 'gfcb_otp_not_configured', __( 'Phone verification is not configured.', 'global-fsms-commerce-bridge' ) ); }
	public function health() {
		return false;
	}
	public function is_managed() { return false; }
}

final class GFCB_Twilio_OTP_Provider implements GFCB_OTP_Provider {
	private $service_sid;
	private $username;
	private $password;

	public function __construct( $settings ) {
		$this->service_sid = isset( $settings['twilio_service_sid'] ) ? (string) $settings['twilio_service_sid'] : '';
		$this->username    = defined( 'GFCB_TWILIO_API_KEY' ) ? (string) GFCB_TWILIO_API_KEY : ( isset( $settings['twilio_api_key'] ) ? (string) $settings['twilio_api_key'] : '' );
		$this->password    = defined( 'GFCB_TWILIO_API_SECRET' ) ? (string) GFCB_TWILIO_API_SECRET : ( isset( $settings['twilio_api_secret'] ) ? (string) $settings['twilio_api_secret'] : '' );
	}

	public function send( $phone_e164, $code ) {
		return $this->call( 'Verifications', array( 'To' => $phone_e164, 'Channel' => 'sms' ), 'pending' );
	}

	public function verify( $phone_e164, $code ) {
		return $this->call( 'VerificationCheck', array( 'To' => $phone_e164, 'Code' => $code ), 'approved' );
	}

	private function call( $resource, $body, $expected_status ) {
		if ( ! $this->health() ) return new WP_Error( 'gfcb_otp_not_configured', __( 'Phone verification is not configured.', 'global-fsms-commerce-bridge' ) );
		$response = wp_safe_remote_post(
			'https://verify.twilio.com/v2/Services/' . rawurlencode( $this->service_sid ) . '/' . $resource,
			array( 'timeout' => 15, 'headers' => array( 'Authorization' => 'Basic ' . base64_encode( $this->username . ':' . $this->password ) ), 'body' => $body ) // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		);
		if ( is_wp_error( $response ) ) return new WP_Error( 'gfcb_otp_unavailable', __( 'Phone verification is temporarily unavailable.', 'global-fsms-commerce-bridge' ) );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		return wp_remote_retrieve_response_code( $response ) >= 200 && wp_remote_retrieve_response_code( $response ) < 300 && isset( $data['status'] ) && $expected_status === $data['status'] ? true : new WP_Error( 'gfcb_otp_failed', __( 'The verification code could not be sent or verified.', 'global-fsms-commerce-bridge' ) );
	}

	public function health() { return (bool) ( $this->service_sid && $this->username && $this->password ); }
	public function is_managed() { return true; }
}

final class GFCB_Verification_Service {
	const EMAIL_TTL = 86400;
	const OTP_TTL   = 300;

	public static function otp_provider() {
		$settings = get_option( 'gfcb_security_settings', array() );
		$provider = isset( $settings['otp_provider'] ) ? $settings['otp_provider'] : 'disabled';
		$instance = 'twilio' === $provider ? new GFCB_Twilio_OTP_Provider( $settings ) : new GFCB_Disabled_OTP_Provider();
		return apply_filters( 'gfcb_otp_provider', $instance, $provider );
	}

	public static function normalize_email( $email ) {
		return strtolower( sanitize_email( trim( (string) $email ) ) );
	}

	public static function normalize_phone( $country_code, $phone ) {
		$country_code = preg_replace( '/\D+/', '', (string) $country_code );
		$phone        = preg_replace( '/\D+/', '', (string) $phone );
		$phone        = ltrim( $phone, '0' );
		$e164         = '+' . $country_code . $phone;
		return preg_match( '/^\+[1-9]\d{7,14}$/', $e164 ) ? $e164 : '';
	}

	public static function hash_identity( $value ) {
		return hash_hmac( 'sha256', strtolower( trim( (string) $value ) ), wp_salt( 'auth' ) );
	}

	public static function issue_email_token( $user_id ) {
		$token = bin2hex( random_bytes( 32 ) );
		self::replace_token( $user_id, 'email', hash( 'sha256', $token ), self::EMAIL_TTL );
		return $token;
	}

	public static function issue_pos_password_token( $user_id, $store_uuid ) {
		$token = bin2hex( random_bytes( 32 ) );
		self::replace_token( $user_id, 'pos_password', hash( 'sha256', $token . '|' . sanitize_text_field( $store_uuid ) ), 600 );
		return $token;
	}

	public static function consume_pos_password_token( $user_id, $store_uuid, $token ) {
		return self::consume_token( $user_id, 'pos_password', hash( 'sha256', (string) $token . '|' . sanitize_text_field( $store_uuid ) ), 5 );
	}

	public static function send_email_verification( $user_id ) {
		$user = get_userdata( $user_id );
		if ( ! $user ) {
			return new WP_Error( 'gfcb_user_missing', __( 'Account not found.', 'global-fsms-commerce-bridge' ) );
		}

		$token = self::issue_email_token( $user_id );
		$pages = get_option( 'gfcb_pages', array() );
		$url   = ! empty( $pages['verify-account'] ) ? get_permalink( (int) $pages['verify-account'] ) : home_url( '/' );
		$url   = add_query_arg( array( 'gfcb_verify' => $token, 'uid' => (int) $user_id ), $url );
		return wp_mail(
			$user->user_email,
			__( 'Verify your Global FSMS account', 'global-fsms-commerce-bridge' ),
			sprintf( __( "Welcome. Verify your email using this secure link:\n\n%s\n\nThis link expires in 24 hours.", 'global-fsms-commerce-bridge' ), esc_url_raw( $url ) )
		);
	}

	public static function verify_email( $user_id, $token ) {
		$verified = self::consume_token( $user_id, 'email', hash( 'sha256', (string) $token ), 5 );
		if ( is_wp_error( $verified ) ) {
			return $verified;
		}
		update_user_meta( $user_id, 'gfcb_email_verified_at', current_time( 'mysql', true ) );
		self::refresh_account_status( $user_id );
		GFCB_Database::audit( 'email_verified', 'user', $user_id );
		return true;
	}

	public static function send_phone_otp( $user_id ) {
		$phone = (string) get_user_meta( $user_id, 'gfcb_phone_e164', true );
		if ( ! $phone ) {
			return new WP_Error( 'gfcb_phone_missing', __( 'No valid phone number is saved.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}

		$limited = GFCB_Rate_Limiter::consume( 'phone_otp', self::hash_identity( $phone ) . '|' . GFCB_Rate_Limiter::request_identity(), 3, HOUR_IN_SECONDS );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}

		$code     = (string) random_int( 100000, 999999 );
		$provider = self::otp_provider();
		$result   = $provider->send( $phone, $code );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( ! $provider->is_managed() ) {
			self::replace_token( $user_id, 'phone', wp_hash_password( $code ), self::OTP_TTL );
		} else {
			update_user_meta( $user_id, 'gfcb_phone_otp_requested_at', current_time( 'mysql', true ) );
		}
		return true;
	}

	public static function verify_phone_otp( $user_id, $code ) {
		$phone    = (string) get_user_meta( $user_id, 'gfcb_phone_e164', true );
		$provider = self::otp_provider();
		$limited  = GFCB_Rate_Limiter::consume( 'phone_otp_verify', (string) $user_id . '|' . GFCB_Rate_Limiter::request_identity(), 5, self::OTP_TTL );
		if ( is_wp_error( $limited ) ) return $limited;
		if ( $provider->is_managed() ) {
			if ( ! preg_match( '/^\d{6}$/', (string) $code ) ) return new WP_Error( 'gfcb_otp_invalid', __( 'The verification code is invalid or expired.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
			$result = $provider->verify( $phone, $code );
			if ( is_wp_error( $result ) ) return $result;
			update_user_meta( $user_id, 'gfcb_phone_verified_at', current_time( 'mysql', true ) );
			self::refresh_account_status( $user_id );
			GFCB_Database::audit( 'phone_verified', 'user', $user_id );
			return true;
		}
		global $wpdb;
		$table = GFCB_Database::table( 'verification_tokens' );
		$row   = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE user_id = %d AND token_type = %s AND consumed_at IS NULL ORDER BY id DESC LIMIT 1", $user_id, 'phone' ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $row || strtotime( $row->expires_at . ' UTC' ) < time() || (int) $row->attempt_count >= 5 ) {
			return new WP_Error( 'gfcb_otp_invalid', __( 'The verification code is invalid or expired.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		$wpdb->query( $wpdb->prepare( "UPDATE {$table} SET attempt_count = attempt_count + 1 WHERE id = %d", $row->id ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! wp_check_password( (string) $code, $row->token_hash ) ) {
			return new WP_Error( 'gfcb_otp_invalid', __( 'The verification code is invalid or expired.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		$wpdb->update( $table, array( 'consumed_at' => current_time( 'mysql', true ) ), array( 'id' => $row->id ), array( '%s' ), array( '%d' ) );
		update_user_meta( $user_id, 'gfcb_phone_verified_at', current_time( 'mysql', true ) );
		self::refresh_account_status( $user_id );
		GFCB_Database::audit( 'phone_verified', 'user', $user_id );
		return true;
	}

	public static function refresh_account_status( $user_id ) {
		$email = get_user_meta( $user_id, 'gfcb_email_verified_at', true );
		$phone = get_user_meta( $user_id, 'gfcb_phone_verified_at', true );
		update_user_meta( $user_id, 'gfcb_account_status', $email && $phone ? 'active' : 'verification_pending' );
	}

	private static function replace_token( $user_id, $type, $hash, $ttl ) {
		global $wpdb;
		$table = GFCB_Database::table( 'verification_tokens' );
		$wpdb->query( $wpdb->prepare( "UPDATE {$table} SET consumed_at = %s WHERE user_id = %d AND token_type = %s AND consumed_at IS NULL", current_time( 'mysql', true ), $user_id, $type ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->insert(
			$table,
			array( 'user_id' => $user_id, 'token_type' => $type, 'token_hash' => $hash, 'expires_at' => gmdate( 'Y-m-d H:i:s', time() + $ttl ), 'created_at' => current_time( 'mysql', true ) ),
			array( '%d', '%s', '%s', '%s', '%s' )
		);
	}

	private static function consume_token( $user_id, $type, $hash, $max_attempts ) {
		global $wpdb;
		$table = GFCB_Database::table( 'verification_tokens' );
		$row   = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE user_id = %d AND token_type = %s AND consumed_at IS NULL ORDER BY id DESC LIMIT 1", $user_id, $type ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $row || strtotime( $row->expires_at . ' UTC' ) < time() || (int) $row->attempt_count >= $max_attempts || ! hash_equals( $row->token_hash, $hash ) ) {
			if ( $row ) {
				$wpdb->query( $wpdb->prepare( "UPDATE {$table} SET attempt_count = attempt_count + 1 WHERE id = %d", $row->id ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			}
			return new WP_Error( 'gfcb_token_invalid', __( 'This verification link is invalid or expired.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}
		$wpdb->update( $table, array( 'consumed_at' => current_time( 'mysql', true ) ), array( 'id' => $row->id ), array( '%s' ), array( '%d' ) );
		return true;
	}
}
