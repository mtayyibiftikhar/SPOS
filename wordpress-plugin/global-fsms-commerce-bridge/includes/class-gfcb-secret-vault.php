<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Secret_Vault {
	private static function key() {
		return hash( 'sha256', wp_salt( 'secure_auth' ) . '|gfcb-vault-v1', true );
	}

	public static function encrypt( $plaintext ) {
		if ( ! function_exists( 'openssl_encrypt' ) || '' === (string) $plaintext ) {
			return new WP_Error( 'gfcb_encryption_unavailable', __( 'Secure credential encryption is unavailable.', 'global-fsms-commerce-bridge' ) );
		}
		$iv   = random_bytes( 12 );
		$tag  = '';
		$data = openssl_encrypt( (string) $plaintext, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, 'gfcb-store-key-v1' );
		if ( false === $data ) {
			return new WP_Error( 'gfcb_encryption_failed', __( 'The store credential could not be protected.', 'global-fsms-commerce-bridge' ) );
		}
		return base64_encode( wp_json_encode( array( 'v' => 1, 'iv' => base64_encode( $iv ), 'tag' => base64_encode( $tag ), 'data' => base64_encode( $data ) ) ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
	}

	public static function decrypt( $envelope ) {
		$decoded = json_decode( base64_decode( (string) $envelope, true ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		if ( ! is_array( $decoded ) || 1 !== (int) ( isset( $decoded['v'] ) ? $decoded['v'] : 0 ) ) {
			return new WP_Error( 'gfcb_secret_invalid', __( 'The protected store credential is invalid.', 'global-fsms-commerce-bridge' ) );
		}
		$iv   = base64_decode( (string) $decoded['iv'], true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		$tag  = base64_decode( (string) $decoded['tag'], true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		$data = base64_decode( (string) $decoded['data'], true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		if ( false === $iv || false === $tag || false === $data ) {
			return new WP_Error( 'gfcb_secret_invalid', __( 'The protected store credential is invalid.', 'global-fsms-commerce-bridge' ) );
		}
		$value = openssl_decrypt( $data, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, 'gfcb-store-key-v1' );
		return false === $value ? new WP_Error( 'gfcb_secret_invalid', __( 'The protected store credential could not be opened.', 'global-fsms-commerce-bridge' ) ) : $value;
	}
}

