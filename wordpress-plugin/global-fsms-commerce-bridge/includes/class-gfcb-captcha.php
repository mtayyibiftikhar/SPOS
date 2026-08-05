<?php

defined( 'ABSPATH' ) || exit;

interface GFCB_Captcha_Provider {
	public function verify( $token, $remote_ip );
}

final class GFCB_Turnstile_Provider implements GFCB_Captcha_Provider {
	private $secret;

	public function __construct( $secret ) {
		$this->secret = (string) $secret;
	}

	public function verify( $token, $remote_ip ) {
		if ( empty( $this->secret ) || empty( $token ) ) {
			return new WP_Error( 'gfcb_captcha_required', __( 'Please complete the security check.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		}

		$response = wp_safe_remote_post(
			'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			array(
				'timeout' => 10,
				'body'    => array( 'secret' => $this->secret, 'response' => $token, 'remoteip' => $remote_ip ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'gfcb_captcha_unavailable', __( 'The security check is temporarily unavailable.', 'global-fsms-commerce-bridge' ), array( 'status' => 503 ) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		return ! empty( $body['success'] ) ? true : new WP_Error( 'gfcb_captcha_failed', __( 'The security check failed. Please try again.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
	}
}

final class GFCB_Recaptcha_Provider implements GFCB_Captcha_Provider {
	private $secret;
	private $minimum_score;
	public function __construct( $secret, $minimum_score = 0.5 ) { $this->secret = (string) $secret; $this->minimum_score = max( 0, min( 1, (float) $minimum_score ) ); }
	public function verify( $token, $remote_ip ) {
		if ( ! $this->secret || ! $token ) return new WP_Error( 'gfcb_captcha_required', __( 'Please complete the security check.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
		$response = wp_safe_remote_post( 'https://www.google.com/recaptcha/api/siteverify', array( 'timeout' => 10, 'body' => array( 'secret' => $this->secret, 'response' => $token, 'remoteip' => $remote_ip ) ) );
		if ( is_wp_error( $response ) ) return new WP_Error( 'gfcb_captcha_unavailable', __( 'The security check is temporarily unavailable.', 'global-fsms-commerce-bridge' ), array( 'status' => 503 ) );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		return ! empty( $body['success'] ) && isset( $body['score'] ) && (float) $body['score'] >= $this->minimum_score ? true : new WP_Error( 'gfcb_captcha_failed', __( 'The security check failed. Please try again.', 'global-fsms-commerce-bridge' ), array( 'status' => 400 ) );
	}
}

final class GFCB_Captcha {
	public static function provider() {
		$settings = get_option( 'gfcb_security_settings', array() );
		if ( isset( $settings['captcha_provider'] ) && 'recaptcha' === $settings['captcha_provider'] ) {
			return new GFCB_Recaptcha_Provider( isset( $settings['recaptcha_secret'] ) ? $settings['recaptcha_secret'] : '', isset( $settings['recaptcha_minimum_score'] ) ? $settings['recaptcha_minimum_score'] : 0.5 );
		}
		return new GFCB_Turnstile_Provider( isset( $settings['turnstile_secret'] ) ? $settings['turnstile_secret'] : '' );
	}

	public static function provider_key() {
		$settings = get_option( 'gfcb_security_settings', array() );
		return isset( $settings['captcha_provider'] ) && 'recaptcha' === $settings['captcha_provider'] ? 'recaptcha' : 'turnstile';
	}

	public static function site_key() {
		$settings = get_option( 'gfcb_security_settings', array() );
		$key = 'recaptcha' === self::provider_key() ? 'recaptcha_site_key' : 'turnstile_site_key';
		return isset( $settings[ $key ] ) ? (string) $settings[ $key ] : '';
	}
}
