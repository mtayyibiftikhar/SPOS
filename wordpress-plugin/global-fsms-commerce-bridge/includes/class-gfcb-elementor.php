<?php

defined( 'ABSPATH' ) || exit;

final class GFCB_Elementor {
	public function register() {
		add_action( 'elementor/elements/categories_registered', array( $this, 'category' ) );
		add_action( 'elementor/widgets/register', array( $this, 'widgets' ) );
	}

	public function category( $manager ) {
		$manager->add_category( 'global-fsms', array( 'title' => __( 'Global FSMS', 'global-fsms-commerce-bridge' ), 'icon' => 'eicon-store' ) );
	}

	public function widgets( $manager ) {
		if ( ! class_exists( '\\Elementor\\Widget_Base' ) || ! class_exists( 'GFCB_Elementor_Portal_Widget' ) ) return;
		$widgets = array(
			array( 'login', 'Global FSMS Login', '[gfcb_login]' ),
			array( 'registration', 'Global FSMS Registration', '[gfcb_registration]' ),
			array( 'password-reset', 'Global FSMS Password Reset', '[gfcb_forgot_password]' ),
			array( 'email-verification', 'Email Verification', '[gfcb_verification]' ),
			array( 'phone-verification', 'Phone Verification', '[gfcb_verification]' ),
			array( 'account-dashboard', 'Account Dashboard', '[gfcb_dashboard]' ),
			array( 'store-list', 'Store List', '[gfcb_dashboard]' ),
			array( 'store-details', 'Store Details', '[gfcb_dashboard]' ),
			array( 'device-manager', 'Device Manager', '[gfcb_dashboard]' ),
			array( 'subscription-summary', 'Subscription Summary', '[gfcb_dashboard]' ),
			array( 'trial-countdown', 'Trial Countdown', '[gfcb_dashboard]' ),
			array( 'billing-actions', 'Billing Actions', '[gfcb_dashboard]' ),
			array( 'account-navigation', 'Account Navigation', '[woocommerce_my_account]' ),
			array( 'alert-centre', 'Alert Centre', '[gfcb_dashboard]' ),
		);
		foreach ( $widgets as $widget ) $manager->register( new GFCB_Elementor_Portal_Widget( $widget[0], $widget[1], $widget[2] ) );
	}
}

if ( class_exists( '\\Elementor\\Widget_Base' ) ) {
	final class GFCB_Elementor_Portal_Widget extends \Elementor\Widget_Base {
		private $widget_name;
		private $widget_title;
		private $shortcode;

		public function __construct( $name = 'portal', $title = 'Global FSMS Portal', $shortcode = '[gfcb_dashboard]', $data = array(), $args = null ) {
			$this->widget_name = 'gfcb-' . sanitize_key( $name ); $this->widget_title = $title; $this->shortcode = $shortcode; parent::__construct( $data, $args );
		}
		public function get_name() { return $this->widget_name; }
		public function get_title() { return __( $this->widget_title, 'global-fsms-commerce-bridge' ); } // phpcs:ignore WordPress.WP.I18n.NonSingularStringLiteralText
		public function get_icon() { return 'eicon-store'; }
		public function get_categories() { return array( 'global-fsms' ); }
		public function get_style_depends() { return array( 'gfcb-portal' ); }
		public function get_script_depends() { return array( 'gfcb-portal' ); }

		protected function register_controls() {
			$this->start_controls_section( 'content', array( 'label' => __( 'Content', 'global-fsms-commerce-bridge' ) ) );
			$this->add_control( 'heading', array( 'label' => __( 'Optional heading', 'global-fsms-commerce-bridge' ), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => '' ) );
			$this->end_controls_section();
			$this->start_controls_section( 'style', array( 'label' => __( 'Portal Style', 'global-fsms-commerce-bridge' ), 'tab' => \Elementor\Controls_Manager::TAB_STYLE ) );
			$this->add_control( 'text_color', array( 'label' => __( 'Text colour', 'global-fsms-commerce-bridge' ), 'type' => \Elementor\Controls_Manager::COLOR, 'selectors' => array( '{{WRAPPER}} .gfcb-shell' => 'color: {{VALUE}}' ) ) );
			$this->add_control( 'card_background', array( 'label' => __( 'Card background', 'global-fsms-commerce-bridge' ), 'type' => \Elementor\Controls_Manager::COLOR, 'selectors' => array( '{{WRAPPER}} .gfcb-card' => 'background-color: {{VALUE}}' ) ) );
			$this->add_control( 'button_color', array( 'label' => __( 'Button colour', 'global-fsms-commerce-bridge' ), 'type' => \Elementor\Controls_Manager::COLOR, 'selectors' => array( '{{WRAPPER}} .gfcb-button' => 'background-color: {{VALUE}}' ) ) );
			$this->add_responsive_control( 'radius', array( 'label' => __( 'Border radius', 'global-fsms-commerce-bridge' ), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array( 'px' => array( 'min' => 0, 'max' => 50 ) ), 'selectors' => array( '{{WRAPPER}} .gfcb-card' => 'border-radius: {{SIZE}}{{UNIT}}' ) ) );
			$this->add_responsive_control( 'spacing', array( 'label' => __( 'Spacing', 'global-fsms-commerce-bridge' ), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array( 'px' => array( 'min' => 0, 'max' => 100 ) ), 'selectors' => array( '{{WRAPPER}} .gfcb-card' => 'padding: {{SIZE}}{{UNIT}}' ) ) );
			$this->end_controls_section();
		}

		protected function render() { $settings = $this->get_settings_for_display(); if ( ! empty( $settings['heading'] ) ) echo '<h2>' . esc_html( $settings['heading'] ) . '</h2>'; echo do_shortcode( $this->shortcode ); }
	}
}

