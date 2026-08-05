(function () {
  "use strict";

  const config = window.gfcbPortal || {};

  async function request(path, options) {
    const response = await fetch(config.root + path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(config.nonce ? { "X-WP-Nonce": config.nonce } : {}),
      },
      ...options,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || "The request could not be completed. Please try again.");
    }
    return body;
  }

  function setMessage(scope, message, type) {
    const target = scope.querySelector(".gfcb-form-message");
    if (!target) return;
    target.textContent = message;
    target.className = "gfcb-form-message gfcb-form-message--" + type;
  }


  async function captchaToken(scope, action) {
    if (config.captchaProvider === "recaptcha" && window.grecaptcha) {
      return new Promise((resolve, reject) => {
        window.grecaptcha.ready(() => {
          window.grecaptcha.execute(config.turnstileKey, { action }).then(resolve).catch(reject);
        });
      });
    }
		const input = scope.querySelector('[name="cf-turnstile-response"]');
		return input ? input.value : "";
  }

  const registration = document.querySelector('[data-gfcb-form="register"]');
  if (registration) {
    registration.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!registration.reportValidity()) return;
      const button = registration.querySelector('button[type="submit"]');
      button.disabled = true;
      setMessage(registration, "Creating your secure account…", "info");
      const form = new FormData(registration);
      const payload = Object.fromEntries(form.entries());
      payload.accept_terms = form.has("accept_terms");
      payload.accept_privacy = form.has("accept_privacy");
      payload.marketing_consent = form.has("marketing_consent");
			payload.captcha_token = await captchaToken(registration, "registration");
      try {
        await request("auth/register", { method: "POST", body: JSON.stringify(payload) });
        window.location.assign(config.verificationUrl);
      } catch (error) {
        setMessage(registration, error.message, "error");
        if (window.turnstile) window.turnstile.reset();
        button.disabled = false;
      }
    });
  }

  const emailState = document.querySelector("[data-gfcb-email-token]");
  if (emailState) {
    request("auth/verify-email", {
      method: "POST",
      body: JSON.stringify({
        user_id: emailState.dataset.gfcbUserId,
        token: emailState.dataset.gfcbEmailToken,
      }),
    })
      .then(() => {
        emailState.textContent = "Email verified. You can continue to phone verification.";
        emailState.classList.add("gfcb-notice", "gfcb-notice--success");
      })
      .catch((error) => {
        emailState.textContent = error.message;
        emailState.classList.add("gfcb-notice", "gfcb-notice--error");
      });
  }

  const phone = document.querySelector("[data-gfcb-phone-verification]");
  if (phone) {
    const send = phone.querySelector("[data-gfcb-send-otp]");
    const verify = phone.querySelector("[data-gfcb-verify-otp]");
    send.addEventListener("click", async () => {
      send.disabled = true;
      try {
        await request("auth/request-phone-otp", {
          method: "POST",
						body: JSON.stringify({ captcha_token: await captchaToken(phone, "phone_otp") }),
        });
        setMessage(phone, "Verification code sent. It expires in five minutes.", "success");
      } catch (error) {
        setMessage(phone, error.message, "error");
        send.disabled = false;
      }
    });
    verify.addEventListener("click", async () => {
      verify.disabled = true;
      try {
        await request("auth/verify-phone-otp", {
          method: "POST",
          body: JSON.stringify({ code: phone.querySelector("[data-gfcb-otp-code]").value }),
        });
        setMessage(phone, "Phone verified. Your account is now ready.", "success");
      } catch (error) {
        setMessage(phone, error.message, "error");
        verify.disabled = false;
      }
    });
  }

  const storesRoot = document.querySelector("[data-gfcb-stores]");
  if (storesRoot) {
    request("me/stores", { method: "GET" })
      .then(({ stores }) => {
        storesRoot.textContent = "";
        const summary = document.querySelector("[data-gfcb-summary]");
        if (summary) {
          summary.textContent = "";
          const active = stores.filter((store) => ["active", "trialing"].includes(store.status)).length;
          const locked = stores.filter((store) => ["locked", "suspended", "expired"].includes(store.status)).length;
          const used = stores.reduce((total, store) => total + Number(store.active_devices || 0), 0);
          const allowed = stores.reduce((total, store) => total + Number(store.device_limit || 0), 0);
          [["Active stores", active], ["Locked stores", locked], ["Device usage", `${used} of ${allowed}`]].forEach(([label, value]) => {
            const card = document.createElement("div"); card.className = "gfcb-card";
            const caption = document.createElement("span"); caption.textContent = label;
            const strong = document.createElement("strong"); strong.textContent = value;
            card.append(caption, strong); summary.appendChild(card);
          });
        }
        if (!stores.length) {
          const empty = document.createElement("div");
          empty.className = "gfcb-card gfcb-empty";
          empty.innerHTML = "<strong>No POS stores yet</strong><p>Complete verification before starting your first store.</p>";
          storesRoot.appendChild(empty);
          return;
        }
        stores.forEach((store) => {
          const card = document.createElement("article");
          card.className = "gfcb-card gfcb-store";
          const title = document.createElement("h3");
          title.textContent = store.store_name;
          const status = document.createElement("span");
          status.className = "gfcb-status";
          status.textContent = String(store.status || "unknown").replaceAll("_", " ");
          const details = document.createElement("p");
          const end = store.ends_at ? new Date(`${String(store.ends_at).replace(" ", "T")}Z`) : null;
          const days = end && Number.isFinite(end.getTime()) ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
          details.textContent = `${store.plan_key || "Plan pending"} · ${store.active_devices || 0} of ${store.device_limit} devices${days === null ? "" : days > 1 ? ` · ${days} days remaining` : days === 1 ? " · Ends tomorrow" : days === 0 ? " · Ends today" : " · Expired"}`;
          const actions = document.createElement("div"); actions.className = "gfcb-dashboard-actions";
          [["Manage security", config.securityUrl], ["Devices", config.devicesUrl], ["Billing", config.billingUrl]].forEach(([label, href]) => { const link = document.createElement("a"); link.className = "gfcb-button gfcb-button--secondary"; link.textContent = label; link.href = href; actions.appendChild(link); });
          if (store.open_pos_url) { const open = document.createElement("a"); open.className = "gfcb-button"; open.textContent = "Open POS"; open.href = store.open_pos_url; open.rel = "noopener"; actions.appendChild(open); }
          card.append(title, status, details, actions);
          storesRoot.appendChild(card);
        });
      })
      .catch((error) => {
        storesRoot.innerHTML = "";
        const notice = document.createElement("div");
        notice.className = "gfcb-notice gfcb-notice--error";
        notice.textContent = error.message;
        storesRoot.appendChild(notice);
      });
  }

  const trialForm = document.querySelector("[data-gfcb-trial]");
  if (trialForm) {
    trialForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!trialForm.reportValidity()) return;
      const button = trialForm.querySelector('button[type="submit"]');
      button.disabled = true;
      const payload = Object.fromEntries(new FormData(trialForm).entries());
      try {
        payload.captcha_token = await captchaToken(trialForm, "trial_activation");
        await request("me/trial/activate", { method: "POST", body: JSON.stringify(payload) });
        setMessage(trialForm, "Your trial is reserved and the store is being provisioned.", "success");
        setTimeout(() => window.location.assign(config.accountUrl), 900);
      } catch (error) {
        setMessage(trialForm, error.message, "error");
        if (window.turnstile) window.turnstile.reset();
        button.disabled = false;
      }
    });
  }

  const security = document.querySelector("[data-gfcb-security]");
  if (security) {
    const storeSelect = security.querySelector("[data-gfcb-security-store]");
    request("me/stores", { method: "GET" }).then(({ stores }) => {
      storeSelect.textContent = "";
      stores.filter((store) => store.provisioning_status === "completed").forEach((store) => {
        const option = document.createElement("option"); option.value = store.uuid; option.textContent = store.store_name; storeSelect.appendChild(option);
      });
      if (config.posSetupStore && Array.from(storeSelect.options).some((option) => option.value === config.posSetupStore)) storeSelect.value = config.posSetupStore;
      if (!storeSelect.options.length) { const option = document.createElement("option"); option.textContent = "No provisioned stores"; storeSelect.appendChild(option); }
    });
    const password = () => security.querySelector("[data-gfcb-current-password]").value;
    const action = async (suffix, payload = {}) => request(`me/stores/${storeSelect.value}/${suffix}`, { method: "POST", body: JSON.stringify({ current_password: password(), ...payload }) });
    security.querySelector("[data-gfcb-activation-code]").addEventListener("click", async () => { try { const result = await action("activation-code"); setMessage(security, `One-time activation code: ${result.code} (expires ${result.expires_at})`, "success"); } catch (error) { setMessage(security, error.message, "error"); } });
    security.querySelector("[data-gfcb-reveal-key]").addEventListener("click", async () => { try { const result = await action("reveal-key"); setMessage(security, `Store key: ${result.store_key}`, "success"); } catch (error) { setMessage(security, error.message, "error"); } });
    security.querySelector("[data-gfcb-rotate-key]").addEventListener("click", async () => { if (!window.confirm("Rotate this store key? Existing copies will stop working.")) return; try { const result = await action("rotate-key"); setMessage(security, `Key rotated: ${result.masked_key}`, "success"); } catch (error) { setMessage(security, error.message, "error"); } });
    security.querySelector("[data-gfcb-password-link]").addEventListener("click", async () => { try { await action("password-setup-link"); setMessage(security, "A one-time password setup link was sent to your account email.", "success"); } catch (error) { setMessage(security, error.message, "error"); } });
    security.querySelector("[data-gfcb-logout-all]").addEventListener("click", async () => { if (!window.confirm("Sign out every POS session for this store?")) return; try { await action("logout-all"); setMessage(security, "All POS sessions were revoked.", "success"); } catch (error) { setMessage(security, error.message, "error"); } });
    security.querySelector("[data-gfcb-reset-pos-password]").addEventListener("click", async () => { try { await action("password-reset", { setup_token: config.posSetupToken || "", new_pos_password: security.querySelector("[data-gfcb-new-pos-password]").value, confirm_pos_password: security.querySelector("[data-gfcb-confirm-pos-password]").value }); setMessage(security, "POS administrator password changed and existing sessions were revoked.", "success"); } catch (error) { setMessage(security, error.message, "error"); } });
    if (config.posSetupToken) setMessage(security, "Secure setup link accepted. Enter and confirm a new POS administrator password.", "info");
  }

  const deviceManager = document.querySelector("[data-gfcb-device-manager]");
  if (deviceManager) {
    request("me/stores", { method: "GET" }).then(async ({ stores }) => {
      deviceManager.textContent = "";
      for (const store of stores) {
        const section = document.createElement("section"); section.className = "gfcb-device-store";
        const heading = document.createElement("h3"); heading.textContent = `${store.store_name} — allowance ${store.device_limit}`; section.appendChild(heading);
        const data = await request(`me/stores/${store.uuid}/devices`, { method: "GET" });
        if (!data.devices.length) { const empty = document.createElement("p"); empty.textContent = "No activated devices."; section.appendChild(empty); }
        data.devices.forEach((device) => { const row = document.createElement("div"); row.className = "gfcb-device-row"; const label = document.createElement("span"); label.textContent = `${device.device_name} · ${device.platform || "Unknown platform"} · ${device.status}`; row.appendChild(label); if (device.status !== "revoked") { const button = document.createElement("button"); button.className = "gfcb-button gfcb-button--danger"; button.textContent = "Revoke"; button.addEventListener("click", async () => { if (!window.confirm("Revoke this device?")) return; await request(`me/stores/${store.uuid}/devices/${device.uuid}/revoke`, { method: "POST", body: "{}" }); row.remove(); }); row.appendChild(button); } section.appendChild(row); });
        if (config.deviceProducts && config.deviceProducts.length) { const form = document.createElement("form"); form.method = "post"; form.action = config.adminPostUrl; form.className = "gfcb-device-purchase"; [["action","gfcb_device_checkout"],["_wpnonce",config.deviceCheckoutNonce],["store_uuid",store.uuid]].forEach(([name,value]) => { const input=document.createElement("input"); input.type="hidden"; input.name=name; input.value=value; form.appendChild(input); }); const select=document.createElement("select"); select.name="product_id"; config.deviceProducts.forEach((product)=>{const option=document.createElement("option");option.value=product.id;option.textContent=product.label;select.appendChild(option);}); const quantity=document.createElement("input");quantity.name="quantity";quantity.type="number";quantity.min="1";quantity.max="100";quantity.value="1";const submit=document.createElement("button");submit.className="gfcb-button";submit.textContent="Add devices";form.append(select,quantity,submit);section.appendChild(form); }
        deviceManager.appendChild(section);
      }
    }).catch((error) => { deviceManager.textContent = error.message; });
  }
})();
