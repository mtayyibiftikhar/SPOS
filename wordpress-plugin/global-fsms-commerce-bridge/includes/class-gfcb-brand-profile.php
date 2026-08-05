<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Brand_Profile {
	const GLOBAL_FSMS = 'global_fsms';
	const ABSHER_POS  = 'absher_pos';

	public static function all() {
		return array(
			self::GLOBAL_FSMS => array(
				'label'       => 'Global FSMS',
				'option_key'  => 'gfcb_global_fsms_connector',
				'header_name' => 'global-fsms',
			),
			self::ABSHER_POS => array(
				'label'       => 'Absher POS',
				'option_key'  => 'gfcb_absher_pos_connector',
				'header_name' => 'absher-pos',
			),
		);
	}

	public static function active_key() {
		$key = (string) get_option( 'gfcb_active_connector', self::GLOBAL_FSMS );
		return isset( self::all()[ $key ] ) ? $key : self::GLOBAL_FSMS;
	}

	public static function active() {
		return self::all()[ self::active_key() ];
	}

	public static function connector_options( $profile_key = null ) {
		$profile_key = $profile_key ?: self::active_key();
		$profiles     = self::all();
		if ( ! isset( $profiles[ $profile_key ] ) ) {
			return array();
		}

		$options = get_option( $profiles[ $profile_key ]['option_key'], array() );
		return is_array( $options ) ? $options : array();
	}

	public static function fingerprint( $profile_key, $base_url ) {
		return hash_hmac( 'sha256', $profile_key . '|' . untrailingslashit( strtolower( $base_url ) ), wp_salt( 'auth' ) );
	}

	public static function validate_lock( $profile_key, $base_url, $fingerprint ) {
		if ( ! isset( self::all()[ $profile_key ] ) || empty( $base_url ) || empty( $fingerprint ) ) {
			return false;
		}

		return hash_equals( self::fingerprint( $profile_key, $base_url ), $fingerprint );
	}
}

