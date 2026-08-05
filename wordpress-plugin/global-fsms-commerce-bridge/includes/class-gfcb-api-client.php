<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_API_Client {
	private $profile_key;
	private $options;

	public function __construct( $profile_key = null ) {
		$this->profile_key = $profile_key ?: GFCB_Brand_Profile::active_key();
		$this->options     = GFCB_Brand_Profile::connector_options( $this->profile_key );
		$constant = GFCB_Brand_Profile::ABSHER_POS === $this->profile_key ? 'GFCB_ABSHER_POS_API_KEY' : 'GFCB_GLOBAL_FSMS_API_KEY';
		if ( defined( $constant ) && constant( $constant ) ) {
			$this->options['api_key'] = (string) constant( $constant );
		}
	}

	public function is_configured() {
		return ! empty( $this->options['base_url'] ) && ! empty( $this->options['api_key'] ) && GFCB_Brand_Profile::validate_lock( $this->profile_key, $this->options['base_url'], isset( $this->options['fingerprint'] ) ? $this->options['fingerprint'] : '' );
	}

	public function request( $method, $path, $payload = array(), $idempotency_key = '' ) {
		if ( ! $this->is_configured() ) {
			return new WP_Error( 'gfcb_connector_not_configured', __( 'The selected POS connector is not securely configured.', 'global-fsms-commerce-bridge' ) );
		}

		$timestamp = time();
		$body      = wp_json_encode( $payload );
		$signature = hash_hmac( 'sha256', strtoupper( $method ) . "\n" . $path . "\n" . $timestamp . "\n" . hash( 'sha256', $body ), $this->options['api_key'] );
		$response  = wp_safe_remote_request(
			untrailingslashit( $this->options['base_url'] ) . '/' . ltrim( $path, '/' ),
			array(
				'method'  => strtoupper( $method ),
				'timeout' => 15,
				'headers' => array(
					'Content-Type'       => 'application/json',
					'X-GFCB-Profile'     => $this->profile_key,
					'X-GFCB-Timestamp'   => (string) $timestamp,
					'X-GFCB-Signature'   => $signature,
					'Idempotency-Key'    => sanitize_text_field( $idempotency_key ),
				),
				'body' => $body,
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$status = wp_remote_retrieve_response_code( $response );
		$data   = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $status < 200 || $status >= 300 ) {
			return new WP_Error( 'gfcb_backend_error', __( 'The POS service could not complete the request.', 'global-fsms-commerce-bridge' ), array( 'status' => $status ) );
		}
		return is_array( $data ) ? $data : array();
	}
}
