<?php
/**
 * Uninstall intentionally preserves customer, trial, entitlement, audit, and connector data.
 * Deleting licensing history automatically could enable trial abuse or destroy financial evidence.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'gfcb_setup_complete' );
delete_transient( 'gfcb_activation_redirect' );

