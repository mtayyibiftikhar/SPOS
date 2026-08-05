<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Rate_Limiter {
	public static function consume( $action, $identity, $limit, $window_seconds ) {
		$key   = 'gfcb_rl_' . hash_hmac( 'sha256', sanitize_key( $action ) . '|' . strtolower( trim( (string) $identity ) ), wp_salt( 'nonce' ) );
		$state = get_transient( $key );
		$now   = time();

		if ( ! is_array( $state ) || empty( $state['started'] ) || (int) $state['started'] + $window_seconds <= $now ) {
			$state = array( 'started' => $now, 'count' => 0 );
		}

		if ( (int) $state['count'] >= $limit ) {
			return new WP_Error(
				'gfcb_rate_limited',
				__( 'Too many requests. Please wait and try again.', 'global-fsms-commerce-bridge' ),
				array( 'status' => 429, 'retry_after' => max( 1, (int) $state['started'] + $window_seconds - $now ) )
			);
		}

		$state['count']++;
		set_transient( $key, $state, $window_seconds );
		return true;
	}

	public static function request_identity( $suffix = '' ) {
		return ( GFCB_Database::request_ip() ?: 'unknown' ) . '|' . (string) $suffix;
	}
}

