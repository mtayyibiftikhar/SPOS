<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Account {
	public function register() {
		add_action( 'init', array( $this, 'add_endpoints' ) );
		add_filter( 'woocommerce_account_menu_items', array( $this, 'menu_items' ) );
		add_action( 'woocommerce_account_pos-overview_endpoint', array( $this, 'dashboard' ) );
		add_action( 'woocommerce_account_my-pos-stores_endpoint', array( $this, 'stores' ) );
		add_action( 'woocommerce_account_pos-security_endpoint', array( $this, 'security' ) );
		add_action( 'woocommerce_account_pos-devices_endpoint', array( $this, 'devices' ) );
		add_action( 'woocommerce_account_pos-subscription_endpoint', array( $this, 'subscription' ) );
		add_action( 'woocommerce_account_pos-verification_endpoint', array( $this, 'verification' ) );
		add_action( 'woocommerce_account_pos-support_endpoint', array( $this, 'support' ) );
		add_shortcode( 'gfcb_registration', array( $this, 'registration' ) );
		add_shortcode( 'gfcb_login', array( $this, 'login' ) );
		add_shortcode( 'gfcb_verification', array( $this, 'verification' ) );
		add_shortcode( 'gfcb_dashboard', array( $this, 'dashboard' ) );
		add_shortcode( 'gfcb_store_setup', array( $this, 'store_setup' ) );
		add_shortcode( 'gfcb_trial_activation', array( $this, 'trial_activation' ) );
		add_shortcode( 'gfcb_provisioning_status', array( $this, 'dashboard' ) );
		add_shortcode( 'gfcb_payment_result', array( $this, 'payment_result' ) );
		add_shortcode( 'gfcb_forgot_password', array( $this, 'forgot_password' ) );
		add_shortcode( 'gfcb_support', array( $this, 'support' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'assets' ) );
		add_action( 'send_headers', array( $this, 'verification_headers' ) );
		add_action( 'init', array( $this, 'blocks' ) );
	}

	public function blocks() {
		$blocks = array( 'login' => 'login', 'registration' => 'registration', 'password-reset' => 'forgot_password', 'verification' => 'verification', 'account-dashboard' => 'dashboard', 'store-list' => 'dashboard', 'store-details' => 'dashboard', 'device-manager' => 'devices', 'subscription-summary' => 'subscription', 'trial-countdown' => 'dashboard', 'billing-actions' => 'subscription', 'alert-centre' => 'dashboard' );
		foreach ( $blocks as $name => $callback ) register_block_type( 'global-fsms/' . $name, array( 'api_version' => 3, 'render_callback' => array( $this, $callback ) ) );
	}

	public function add_endpoints() {
		add_rewrite_endpoint( 'pos-overview', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'my-pos-stores', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-security', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-devices', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-subscription', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-verification', EP_ROOT | EP_PAGES );
		add_rewrite_endpoint( 'pos-support', EP_ROOT | EP_PAGES );
	}

	public function menu_items( $items ) {
		if ( ! is_user_logged_in() ) {
			return $items;
		}
		$logout = isset( $items['customer-logout'] ) ? $items['customer-logout'] : null;
		unset( $items['customer-logout'] );
		$items = array_merge(
			array(
				'pos-overview' => __( 'POS Overview', 'global-fsms-commerce-bridge' ),
				'my-pos-stores'=> __( 'My Stores', 'global-fsms-commerce-bridge' ),
				'pos-devices'  => __( 'Devices', 'global-fsms-commerce-bridge' ),
				'pos-subscription' => __( 'Subscription & Billing', 'global-fsms-commerce-bridge' ),
			),
			$items,
			array( 'pos-verification' => __( 'Profile & Verification', 'global-fsms-commerce-bridge' ), 'pos-security' => __( 'Security', 'global-fsms-commerce-bridge' ), 'pos-support' => __( 'Help and Support', 'global-fsms-commerce-bridge' ) )
		);
		if ( $logout ) {
			$items['customer-logout'] = $logout;
		}
		return $items;
	}

	public function assets() {
		wp_register_style( 'gfcb-portal', GFCB_URL . 'assets/css/portal.css', array(), GFCB_VERSION );
		wp_register_script( 'gfcb-portal', GFCB_URL . 'assets/js/portal.js', array(), GFCB_VERSION, true );
		if ( ! is_page() && ! is_account_page() ) {
			return;
		}
		global $post;
		$content = $post instanceof WP_Post ? $post->post_content : '';
		$relevant = is_account_page() || false !== strpos( $content, '[gfcb_' );
		if ( ! $relevant ) {
			return;
		}

		wp_enqueue_style( 'gfcb-portal' );
		wp_enqueue_script( 'gfcb-portal' );
		wp_localize_script(
			'gfcb-portal',
			'gfcbPortal',
			array(
				'root'          => esc_url_raw( rest_url( GFCB_REST_Controller::NAMESPACE . '/' ) ),
				'nonce'         => wp_create_nonce( 'wp_rest' ),
				'turnstileKey'  => GFCB_Captcha::site_key(),
				'captchaProvider'=> GFCB_Captcha::provider_key(),
				'accountUrl'    => wc_get_page_permalink( 'myaccount' ),
				'storeSetupUrl' => $this->page_url( 'store-setup' ),
				'trialUrl'      => $this->page_url( 'trial-activation' ),
				'securityUrl'   => wc_get_account_endpoint_url( 'pos-security' ),
				'devicesUrl'    => wc_get_account_endpoint_url( 'pos-devices' ),
				'billingUrl'    => wc_get_account_endpoint_url( 'pos-subscription' ),
				'posSetupToken' => isset( $_GET['gfcb_pos_setup'] ) ? sanitize_text_field( wp_unslash( $_GET['gfcb_pos_setup'] ) ) : '', // phpcs:ignore WordPress.Security.NonceVerification.Recommended
				'posSetupStore' => isset( $_GET['store'] ) ? sanitize_text_field( wp_unslash( $_GET['store'] ) ) : '', // phpcs:ignore WordPress.Security.NonceVerification.Recommended
				'verificationUrl'=> $this->page_url( 'verify-account' ),
				'adminPostUrl'   => admin_url( 'admin-post.php' ),
				'deviceCheckoutNonce' => wp_create_nonce( 'gfcb_device_checkout' ),
				'deviceProducts' => $this->device_products(),
			)
		);
		if ( GFCB_Captcha::site_key() && 'turnstile' === GFCB_Captcha::provider_key() ) {
			wp_enqueue_script( 'cloudflare-turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js', array(), null, true );
		} elseif ( GFCB_Captcha::site_key() ) {
			wp_enqueue_script( 'google-recaptcha-v3', 'https://www.google.com/recaptcha/api.js?render=' . rawurlencode( GFCB_Captcha::site_key() ), array(), null, true );
		}
	}

	public function verification_headers() {
		if ( isset( $_GET['gfcb_verify'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			header( 'Referrer-Policy: no-referrer' );
			header( 'X-Robots-Tag: noindex, nofollow, noarchive', true );
		}
	}

	public function registration() {
		if ( is_user_logged_in() ) {
			return '<div class="gfcb-notice gfcb-notice--info">' . esc_html__( 'You are already signed in.', 'global-fsms-commerce-bridge' ) . '</div>';
		}
		ob_start();
		?>
		<div class="gfcb-shell"><div class="gfcb-card gfcb-card--form">
			<p class="gfcb-eyebrow"><?php esc_html_e( 'GLOBAL FSMS CUSTOMER PORTAL', 'global-fsms-commerce-bridge' ); ?></p>
			<h2><?php esc_html_e( 'Create your account', 'global-fsms-commerce-bridge' ); ?></h2>
			<p><?php esc_html_e( 'Your website account is separate from every POS store administrator account.', 'global-fsms-commerce-bridge' ); ?></p>
			<form class="gfcb-form" data-gfcb-form="register" novalidate>
				<div class="gfcb-grid gfcb-grid--2">
					<label><?php esc_html_e( 'First name', 'global-fsms-commerce-bridge' ); ?><input name="first_name" required autocomplete="given-name"></label>
					<label><?php esc_html_e( 'Last name', 'global-fsms-commerce-bridge' ); ?><input name="last_name" required autocomplete="family-name"></label>
				</div>
				<label><?php esc_html_e( 'Email', 'global-fsms-commerce-bridge' ); ?><input name="email" type="email" required autocomplete="email"></label>
				<div class="gfcb-grid gfcb-grid--phone">
					<label><?php esc_html_e( 'Country code', 'global-fsms-commerce-bridge' ); ?><input name="country_code" value="966" inputmode="numeric" required></label>
					<label><?php esc_html_e( 'Mobile number', 'global-fsms-commerce-bridge' ); ?><input name="phone" inputmode="tel" required autocomplete="tel"></label>
				</div>
				<div class="gfcb-grid gfcb-grid--2">
					<label><?php esc_html_e( 'Country', 'global-fsms-commerce-bridge' ); ?><input name="country" required autocomplete="country-name"></label>
					<label><?php esc_html_e( 'Business name (optional)', 'global-fsms-commerce-bridge' ); ?><input name="business_name" autocomplete="organization"></label>
				</div>
				<div class="gfcb-grid gfcb-grid--2">
					<label><?php esc_html_e( 'Password', 'global-fsms-commerce-bridge' ); ?><input name="password" type="password" minlength="12" required autocomplete="new-password"></label>
					<label><?php esc_html_e( 'Confirm password', 'global-fsms-commerce-bridge' ); ?><input name="confirm_password" type="password" minlength="12" required autocomplete="new-password"></label>
				</div>
				<label class="gfcb-check"><input name="accept_terms" type="checkbox" value="1" required> <?php esc_html_e( 'I accept the Terms and Conditions.', 'global-fsms-commerce-bridge' ); ?></label>
				<label class="gfcb-check"><input name="accept_privacy" type="checkbox" value="1" required> <?php esc_html_e( 'I accept the Privacy Policy.', 'global-fsms-commerce-bridge' ); ?></label>
				<label class="gfcb-check"><input name="marketing_consent" type="checkbox" value="1"> <?php esc_html_e( 'Send me useful product updates (optional).', 'global-fsms-commerce-bridge' ); ?></label>
				<?php echo $this->turnstile(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
				<div class="gfcb-form-message" aria-live="polite"></div>
				<button class="gfcb-button" type="submit"><?php esc_html_e( 'Create secure account', 'global-fsms-commerce-bridge' ); ?></button>
			</form>
		</div></div>
		<?php
		return ob_get_clean();
	}

	public function login() {
		if ( is_user_logged_in() ) {
			return '<p><a class="gfcb-button" href="' . esc_url( wc_get_page_permalink( 'myaccount' ) ) . '">' . esc_html__( 'Open my account', 'global-fsms-commerce-bridge' ) . '</a></p>';
		}
		ob_start();
		woocommerce_login_form( array( 'redirect' => wc_get_page_permalink( 'myaccount' ) ) );
		return '<div class="gfcb-shell"><div class="gfcb-card gfcb-card--form"><h2>' . esc_html__( 'Sign in', 'global-fsms-commerce-bridge' ) . '</h2>' . ob_get_clean() . '</div></div>';
	}

	public function verification() {
		$token   = isset( $_GET['gfcb_verify'] ) ? sanitize_text_field( wp_unslash( $_GET['gfcb_verify'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$user_id = isset( $_GET['uid'] ) ? absint( $_GET['uid'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		ob_start();
		?>
		<div class="gfcb-shell"><div class="gfcb-card">
			<h2><?php esc_html_e( 'Verify your account', 'global-fsms-commerce-bridge' ); ?></h2>
			<?php if ( $token && $user_id ) : ?>
				<div data-gfcb-email-token="<?php echo esc_attr( $token ); ?>" data-gfcb-user-id="<?php echo esc_attr( $user_id ); ?>" class="gfcb-verification-state"><?php esc_html_e( 'Verifying your secure link…', 'global-fsms-commerce-bridge' ); ?></div>
			<?php elseif ( is_user_logged_in() ) : ?>
				<?php $me = ( new GFCB_REST_Controller() )->me(); ?>
				<p><?php echo $me['email_verified'] ? esc_html__( 'Email verified', 'global-fsms-commerce-bridge' ) : esc_html__( 'Email verification pending', 'global-fsms-commerce-bridge' ); ?></p>
				<p><?php echo $me['phone_verified'] ? esc_html__( 'Phone verified', 'global-fsms-commerce-bridge' ) : esc_html__( 'Phone verification pending', 'global-fsms-commerce-bridge' ); ?></p>
				<?php echo $this->phone_verification_form(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
			<?php else : ?>
				<p><?php esc_html_e( 'Open the verification link from your email, or sign in to continue.', 'global-fsms-commerce-bridge' ); ?></p>
			<?php endif; ?>
		</div></div>
		<?php
		return ob_get_clean();
	}

	public function dashboard() {
		if ( ! is_user_logged_in() ) {
			return '<div class="gfcb-notice gfcb-notice--warning">' . esc_html__( 'Please sign in to view your POS account.', 'global-fsms-commerce-bridge' ) . '</div>';
		}
		$me = ( new GFCB_REST_Controller() )->me();
		ob_start();
		?>
		<div class="gfcb-shell">
			<div class="gfcb-hero"><div><p class="gfcb-eyebrow"><?php esc_html_e( 'GLOBAL FSMS', 'global-fsms-commerce-bridge' ); ?></p><h2><?php echo esc_html( sprintf( __( 'Welcome, %s', 'global-fsms-commerce-bridge' ), $me['name'] ) ); ?></h2><p><?php esc_html_e( 'Manage verification, stores, licensing, and devices from one secure place.', 'global-fsms-commerce-bridge' ); ?></p></div><span class="gfcb-status gfcb-status--<?php echo esc_attr( sanitize_html_class( $me['account_status'] ) ); ?>"><?php echo esc_html( ucwords( str_replace( '_', ' ', $me['account_status'] ) ) ); ?></span></div>
			<div class="gfcb-grid gfcb-grid--cards">
				<div class="gfcb-card"><span><?php esc_html_e( 'Email', 'global-fsms-commerce-bridge' ); ?></span><strong><?php echo $me['email_verified'] ? esc_html__( 'Verified', 'global-fsms-commerce-bridge' ) : esc_html__( 'Pending', 'global-fsms-commerce-bridge' ); ?></strong></div>
				<div class="gfcb-card"><span><?php esc_html_e( 'Phone', 'global-fsms-commerce-bridge' ); ?></span><strong><?php echo $me['phone_verified'] ? esc_html__( 'Verified', 'global-fsms-commerce-bridge' ) : esc_html__( 'Pending', 'global-fsms-commerce-bridge' ); ?></strong></div>
				<div class="gfcb-card"><span><?php esc_html_e( 'Backend', 'global-fsms-commerce-bridge' ); ?></span><strong><?php echo esc_html( GFCB_Brand_Profile::active()['label'] ); ?></strong></div>
			</div>
			<div data-gfcb-summary class="gfcb-grid gfcb-grid--cards" aria-live="polite"></div>
			<div class="gfcb-dashboard-actions"><a class="gfcb-button" href="<?php echo esc_url( $this->page_url( 'trial-activation' ) ); ?>"><?php esc_html_e( 'Activate Free Trial', 'global-fsms-commerce-bridge' ); ?></a><a class="gfcb-button gfcb-button--secondary" href="<?php echo esc_url( $this->page_url( 'store-setup' ) ); ?>"><?php esc_html_e( 'Add New Store', 'global-fsms-commerce-bridge' ); ?></a><a class="gfcb-button gfcb-button--secondary" href="<?php echo esc_url( wc_get_account_endpoint_url( 'pos-devices' ) ); ?>"><?php esc_html_e( 'Manage Devices', 'global-fsms-commerce-bridge' ); ?></a><a class="gfcb-button gfcb-button--secondary" href="<?php echo esc_url( wc_get_account_endpoint_url( 'pos-subscription' ) ); ?>"><?php esc_html_e( 'Billing', 'global-fsms-commerce-bridge' ); ?></a></div>
			<div data-gfcb-stores class="gfcb-stores"><div class="gfcb-card"><?php esc_html_e( 'Loading your stores…', 'global-fsms-commerce-bridge' ); ?></div></div>
		</div>
		<?php
		return ob_get_clean();
	}

	public function stores() {
		return $this->dashboard();
	}

	public function security() {
		if ( ! is_user_logged_in() ) return $this->login();
		ob_start(); ?>
		<div class="gfcb-shell"><div class="gfcb-card"><h2><?php esc_html_e( 'Store security', 'global-fsms-commerce-bridge' ); ?></h2><p><?php esc_html_e( 'Your website password and POS administrator password are separate. Current POS passwords are never displayed or stored by WordPress.', 'global-fsms-commerce-bridge' ); ?></p>
		<div class="gfcb-form" data-gfcb-security><label><?php esc_html_e( 'Store', 'global-fsms-commerce-bridge' ); ?><select data-gfcb-security-store><option value=""><?php esc_html_e( 'Loading stores…', 'global-fsms-commerce-bridge' ); ?></option></select></label><label><?php esc_html_e( 'Current website password', 'global-fsms-commerce-bridge' ); ?><input type="password" autocomplete="current-password" data-gfcb-current-password></label>
		<div class="gfcb-security-actions"><button type="button" class="gfcb-button gfcb-button--secondary" data-gfcb-activation-code><?php esc_html_e( 'Generate activation code', 'global-fsms-commerce-bridge' ); ?></button><button type="button" class="gfcb-button gfcb-button--secondary" data-gfcb-reveal-key><?php esc_html_e( 'Reveal store key', 'global-fsms-commerce-bridge' ); ?></button><button type="button" class="gfcb-button gfcb-button--secondary" data-gfcb-rotate-key><?php esc_html_e( 'Rotate store key', 'global-fsms-commerce-bridge' ); ?></button><button type="button" class="gfcb-button gfcb-button--secondary" data-gfcb-password-link><?php esc_html_e( 'Email password setup link', 'global-fsms-commerce-bridge' ); ?></button><button type="button" class="gfcb-button gfcb-button--danger" data-gfcb-logout-all><?php esc_html_e( 'Sign out all POS sessions', 'global-fsms-commerce-bridge' ); ?></button></div>
		<hr><h3><?php esc_html_e( 'Change POS administrator password', 'global-fsms-commerce-bridge' ); ?></h3><div class="gfcb-grid gfcb-grid--2"><label><?php esc_html_e( 'New POS password', 'global-fsms-commerce-bridge' ); ?><input type="password" minlength="12" autocomplete="new-password" data-gfcb-new-pos-password></label><label><?php esc_html_e( 'Confirm POS password', 'global-fsms-commerce-bridge' ); ?><input type="password" minlength="12" autocomplete="new-password" data-gfcb-confirm-pos-password></label></div><button type="button" class="gfcb-button" data-gfcb-reset-pos-password><?php esc_html_e( 'Change POS password', 'global-fsms-commerce-bridge' ); ?></button><div class="gfcb-form-message" aria-live="polite"></div></div></div></div>
		<?php return ob_get_clean();
	}

	public function store_setup() {
		if ( ! is_user_logged_in() ) return $this->login();
		$plans = array();
		foreach ( GFCB_WooCommerce::mappings() as $product_id => $mapping ) { if ( in_array( isset( $mapping['type'] ) ? $mapping['type'] : '', array( 'plan', 'additional_store' ), true ) && function_exists( 'wc_get_product' ) ) { $product = wc_get_product( $product_id ); if ( $product ) $plans[ $product_id ] = $product->get_name() . ' — ' . wp_strip_all_tags( $product->get_price_html() ); } }
		ob_start(); ?>
		<div class="gfcb-shell"><div class="gfcb-card gfcb-card--form"><h2><?php esc_html_e( 'Add a paid store', 'global-fsms-commerce-bridge' ); ?></h2><p><?php esc_html_e( 'Your store is provisioned only after WooCommerce confirms payment.', 'global-fsms-commerce-bridge' ); ?></p><form class="gfcb-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="gfcb_store_checkout"><?php wp_nonce_field( 'gfcb_store_checkout' ); ?><label><?php esc_html_e( 'Plan', 'global-fsms-commerce-bridge' ); ?><select name="product_id" required><option value=""><?php esc_html_e( 'Select a plan', 'global-fsms-commerce-bridge' ); ?></option><?php foreach ( $plans as $id => $label ) : ?><option value="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></label><div class="gfcb-grid gfcb-grid--2"><label><?php esc_html_e( 'Store name', 'global-fsms-commerce-bridge' ); ?><input name="store_name" required></label><label><?php esc_html_e( 'Trading name', 'global-fsms-commerce-bridge' ); ?><input name="trading_name"></label><label><?php esc_html_e( 'Business category', 'global-fsms-commerce-bridge' ); ?><input name="business_category"></label><label><?php esc_html_e( 'Country code', 'global-fsms-commerce-bridge' ); ?><input name="country" value="SA" maxlength="2" required></label><label><?php esc_html_e( 'Currency', 'global-fsms-commerce-bridge' ); ?><input name="currency" value="SAR" maxlength="3" required></label><label><?php esc_html_e( 'Time zone', 'global-fsms-commerce-bridge' ); ?><input name="timezone" value="Asia/Riyadh" required></label><label><?php esc_html_e( 'Contact email', 'global-fsms-commerce-bridge' ); ?><input type="email" name="contact_email" value="<?php echo esc_attr( wp_get_current_user()->user_email ); ?>" required></label><label><?php esc_html_e( 'Contact phone', 'global-fsms-commerce-bridge' ); ?><input name="contact_phone" value="<?php echo esc_attr( get_user_meta( get_current_user_id(), 'gfcb_phone_e164', true ) ); ?>" required></label></div><button class="gfcb-button" type="submit" <?php disabled( ! $plans ); ?>><?php esc_html_e( 'Continue to secure checkout', 'global-fsms-commerce-bridge' ); ?></button></form></div></div>
		<?php return ob_get_clean();
	}

	public function trial_activation() {
		if ( ! is_user_logged_in() ) return $this->login();
		ob_start(); ?>
		<div class="gfcb-shell"><div class="gfcb-card gfcb-card--form"><h2><?php esc_html_e( 'Activate your free trial', 'global-fsms-commerce-bridge' ); ?></h2><p><?php esc_html_e( 'One free trial is allowed per verified email and phone identity. The claim remains recorded after account deletion.', 'global-fsms-commerce-bridge' ); ?></p><form class="gfcb-form" data-gfcb-trial><div class="gfcb-grid gfcb-grid--2"><label><?php esc_html_e( 'Store name', 'global-fsms-commerce-bridge' ); ?><input name="store_name" required></label><label><?php esc_html_e( 'Trading name', 'global-fsms-commerce-bridge' ); ?><input name="trading_name"></label><label><?php esc_html_e( 'Business category', 'global-fsms-commerce-bridge' ); ?><input name="business_category"></label><label><?php esc_html_e( 'Country', 'global-fsms-commerce-bridge' ); ?><input name="country" value="SA" required></label><label><?php esc_html_e( 'Currency', 'global-fsms-commerce-bridge' ); ?><input name="currency" value="SAR" required></label><label><?php esc_html_e( 'Time zone', 'global-fsms-commerce-bridge' ); ?><input name="timezone" value="Asia/Riyadh" required></label></div><?php echo $this->turnstile(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><div class="gfcb-form-message" aria-live="polite"></div><button class="gfcb-button" type="submit"><?php esc_html_e( 'Activate one free trial', 'global-fsms-commerce-bridge' ); ?></button></form></div></div>
		<?php return ob_get_clean();
	}

	public function devices() { return '<div class="gfcb-shell"><div class="gfcb-card"><h2>' . esc_html__( 'Devices', 'global-fsms-commerce-bridge' ) . '</h2><div data-gfcb-device-manager>' . esc_html__( 'Loading devices…', 'global-fsms-commerce-bridge' ) . '</div></div></div>'; }
	public function subscription() { ob_start(); ?><div class="gfcb-shell"><div class="gfcb-card"><h2><?php esc_html_e( 'Subscription & Billing', 'global-fsms-commerce-bridge' ); ?></h2><p><?php esc_html_e( 'WooCommerce remains the source of truth for payments, renewals, invoices, and saved payment methods.', 'global-fsms-commerce-bridge' ); ?></p><p><a class="gfcb-button gfcb-button--secondary" href="<?php echo esc_url( wc_get_account_endpoint_url( 'orders' ) ); ?>"><?php esc_html_e( 'View orders', 'global-fsms-commerce-bridge' ); ?></a> <a class="gfcb-button gfcb-button--secondary" href="<?php echo esc_url( wc_get_account_endpoint_url( 'payment-methods' ) ); ?>"><?php esc_html_e( 'Payment methods', 'global-fsms-commerce-bridge' ); ?></a><?php if ( function_exists( 'wcs_get_users_subscriptions' ) ) : ?> <a class="gfcb-button" href="<?php echo esc_url( wc_get_account_endpoint_url( 'subscriptions' ) ); ?>"><?php esc_html_e( 'Manage subscriptions', 'global-fsms-commerce-bridge' ); ?></a><?php endif; ?></p></div></div><?php return ob_get_clean(); }
	public function payment_result() { return '<div class="gfcb-shell"><div class="gfcb-card"><h2>' . esc_html__( 'Payment received', 'global-fsms-commerce-bridge' ) . '</h2><p>' . esc_html__( 'WooCommerce is confirming your payment. Store or device provisioning will appear in your account automatically.', 'global-fsms-commerce-bridge' ) . '</p></div></div>'; }
	public function forgot_password() { ob_start(); if ( function_exists( 'woocommerce_lost_password_form' ) ) woocommerce_lost_password_form(); else echo do_shortcode( '[woocommerce_my_account]' ); return '<div class="gfcb-shell"><div class="gfcb-card gfcb-card--form">' . ob_get_clean() . '</div></div>'; }

	public function support() {
		return '<div class="gfcb-shell"><div class="gfcb-card"><h2>' . esc_html__( 'Help and Support', 'global-fsms-commerce-bridge' ) . '</h2><p>' . esc_html__( 'Contact Global FSMS support for account, billing, or provisioning help. Never send a password or full store key.', 'global-fsms-commerce-bridge' ) . '</p></div></div>';
	}

	private function phone_verification_form() {
		return '<div class="gfcb-form" data-gfcb-phone-verification>' . $this->turnstile() . '<button type="button" class="gfcb-button gfcb-button--secondary" data-gfcb-send-otp>' . esc_html__( 'Send phone verification code', 'global-fsms-commerce-bridge' ) . '</button><label>' . esc_html__( '6-digit code', 'global-fsms-commerce-bridge' ) . '<input inputmode="numeric" maxlength="6" data-gfcb-otp-code></label><button type="button" class="gfcb-button" data-gfcb-verify-otp>' . esc_html__( 'Verify phone', 'global-fsms-commerce-bridge' ) . '</button><div class="gfcb-form-message" aria-live="polite"></div></div>';
	}

	private function turnstile() {
		$key = GFCB_Captcha::site_key();
		if ( ! $key ) return '<div class="gfcb-notice gfcb-notice--warning">' . esc_html__( 'Registration security is not configured. An administrator must configure CAPTCHA.', 'global-fsms-commerce-bridge' ) . '</div>';
		return 'recaptcha' === GFCB_Captcha::provider_key() ? '<div class="gfcb-captcha-note">' . esc_html__( 'Protected by reCAPTCHA', 'global-fsms-commerce-bridge' ) . '</div>' : '<div class="cf-turnstile" data-sitekey="' . esc_attr( $key ) . '"></div>';
	}

	private function page_url( $key ) {
		$pages = get_option( 'gfcb_pages', array() );
		return ! empty( $pages[ $key ] ) ? get_permalink( (int) $pages[ $key ] ) : home_url( '/' );
	}

	private function device_products() {
		$products = array();
		if ( ! function_exists( 'wc_get_product' ) ) return $products;
		foreach ( GFCB_WooCommerce::mappings() as $product_id => $mapping ) {
			if ( ! in_array( isset( $mapping['type'] ) ? $mapping['type'] : '', array( 'additional_device', 'device_pack' ), true ) ) continue;
			$product = wc_get_product( $product_id );
			if ( $product ) $products[] = array( 'id' => (int) $product_id, 'label' => $product->get_name() . ' — ' . wp_strip_all_tags( $product->get_price_html() ), 'devices' => (int) $mapping['devices'] );
		}
		return $products;
	}
}
