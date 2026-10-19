(function(global) {
  'use strict';

  var GOOGLE_SVG = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  var EYE_OPEN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_CLOSED_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-4-11-4s4-8 11-8 11 8 11 8-1.5 3-4.5 6.5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  class RishirajAuth {
    constructor(options = {}) {
      const serverUrl = new URL(options.serverUrl || window.location.origin, window.location.href);
      if (!['http:', 'https:'].includes(serverUrl.protocol) || serverUrl.username || serverUrl.password) {
        throw new Error('serverUrl must be an HTTP(S) URL without embedded credentials.');
      }
      this.serverUrl = serverUrl.href.replace(/\/$/, '');
      this.tenantId = options.tenantId || '';
      this.environment = options.environment || 'PRODUCTION';
      this.onLogin = options.onLogin || null;
      this.onLogout = options.onLogout || null;
      this.onTokenRefresh = options.onTokenRefresh || null;
      this.onError = options.onError || null;

      // Migrate away from the previous persistent token storage.
      this._storageAccessKey = `ra_${this.tenantId}_access`;
      this._storageRefreshKey = `ra_${this.tenantId}_refresh`;
      this._storageUserKey = `ra_${this.tenantId}_user`;
      [this._storageAccessKey, this._storageRefreshKey, this._storageUserKey].forEach((key) => {
        try { localStorage.removeItem(key); } catch (_error) {}
      });

      // Tokens are memory-only in SDK integrations; applications should not
      // persist bearer or refresh tokens in web storage.
      this._tokens = { accessToken: null, refreshToken: null };
      this._user = null;

      this._refreshTimer = null;
      this._modalElement = null;

    }

    // --- Core Auth Methods ---

    async register(email, password, inviteToken) {
      try {
        const payload = { email, password, inviteToken };
        const data = await this._request('POST', '/auth/register', payload, false);
        return data;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    async login(email, password) {
      try {
        const payload = { email, password, ...(this.tenantId ? { tenantId: this.tenantId } : {}) };
        const data = await this._request('POST', '/auth/login', payload, false);
        
        this._tokens = data.tokens || {};
        this._user = data.user || null;

        if (this.onLogin) {
          this.onLogin(this._user, this._tokens);
        }

        this._startAutoRefresh();
        return data;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    async logout() {
      try {
        const payload = { refreshToken: this._tokens?.refreshToken };
        await this._request('POST', '/auth/logout', payload, true);
      } catch (err) {
        // Continue even if server request fails to ensure local logout
        this._handleError(err);
      } finally {
        this._clearLocalState();
        if (this.onLogout) {
          this.onLogout();
        }
      }
    }

    async refreshToken() {
      try {
        if (!this._tokens?.refreshToken) {
          throw new Error('No refresh token available');
        }

        const payload = { refreshToken: this._tokens.refreshToken };
        const data = await this._request('POST', '/auth/refresh-token', payload, false);

        this._tokens = data.tokens || data || {};

        if (this.onTokenRefresh) {
          this.onTokenRefresh(this._tokens);
        }

        this._startAutoRefresh();
        return this._tokens;
      } catch (err) {
        this._handleError(err);
        this.logout();
        throw err;
      }
    }

    async getProfile() {
      try {
        const data = await this._request('GET', '/user/profile', null, true);
        this._user = data.profile || null;
        return this._user;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    async forgotPassword(email) {
      try {
        const data = await this._request('POST', '/auth/forgot-password', { email }, false);
        return data;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    async resetPassword(token, newPassword) {
      try {
        const data = await this._request('POST', '/auth/reset-password', { token, newPassword }, false);
        return data;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    async verifyEmail(token) {
      try {
        const data = await this._request('POST', '/auth/verify-email', { token }, false);
        return data;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    async resendVerification(email) {
      try {
        const data = await this._request('POST', '/auth/resend-verification', { email }, false);
        return data;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    googleLogin() {
      return this.providerLogin('google');
    }

    githubLogin() { return this.providerLogin('github'); }
    facebookLogin() { return this.providerLogin('facebook'); }

    providerLogin(provider, options = {}) {
      if (!['google', 'github', 'facebook'].includes(provider)) return Promise.reject(new Error('Unsupported sign-in provider.'));
      const query = new URLSearchParams({ clientOrigin: window.location.origin });
      if (this.tenantId) query.set('tenantId', this.tenantId);
      const url = `${this.serverUrl}/auth/${provider}?${query.toString()}`;
      const serverOrigin = new URL(this.serverUrl).origin;
      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        'about:blank',
        'rishiraj_auth_social',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      if (!popup) return Promise.reject(new Error('Allow popups for this site, then try again.'));

      return new Promise((resolve, reject) => {
        let processing = false;
        const popupOpenedAt = Date.now();
        const cleanup = () => {
          window.removeEventListener('message', handleMessage);
          clearInterval(checkClosed);
        };
        const handleMessage = async (event) => {
          if (event.origin !== serverOrigin || event.source !== popup || processing) return;
          if (event.data?.type === 'oauth-error') {
            processing = true;
            cleanup();
            reject(new Error(event.data.error || 'Social sign-in failed.'));
            return;
          }
          if (event.data?.type !== 'oauth-code' || typeof event.data.code !== 'string') return;

          processing = true;
          cleanup();
          try {
            const result = await this._request(
              'POST',
              '/auth/oauth/exchange',
              { code: event.data.code },
              false
            );
            this._tokens = result.tokens || {};
            this._user = result.user || null;
            if (this.onLogin) this.onLogin(this._user, this._tokens);
            this._startAutoRefresh();
            resolve({ user: this._user, tokens: this._tokens });
          } catch (error) {
            reject(error);
          }
        };

        const checkClosed = setInterval(() => {
          if (popup.closed) {
            cleanup();
            reject(new Error('Sign-in window was closed. You can try again.'));
            return;
          }

          // OAuth errors are redirected back to this server without a
          // postMessage payload; recognize that same-origin terminal page so
          // the SDK promise does not remain pending indefinitely.
          try {
            const popupUrl = new URL(popup.location.href);
            if (
              popupUrl.origin === serverOrigin &&
              (
                popupUrl.pathname === '/oauth-failed' ||
                (popupUrl.pathname.startsWith('/auth/') && Date.now() - popupOpenedAt > 15000)
              )
            ) {
              processing = true;
              cleanup();
              popup.close();
              reject(new Error('Sign-in could not be completed. Check provider setup and try again.'));
            }
          } catch (_error) {
            // The popup is on Google's cross-origin pages during sign-in.
          }
        }, 500);
        window.addEventListener('message', handleMessage);
        const beginProviderLogin = async () => {
          const availability = await fetch(`${this.serverUrl}/auth/providers`, { mode: 'cors' });
          const availabilityData = await availability.json().catch(() => ({}));
          if (!availability.ok) throw new Error(availabilityData.message || 'Could not check sign-in setup.');
          const selectedProvider = availabilityData.providers?.find((item) => item.id === provider);
          if (!selectedProvider?.configured) {
            throw new Error(`${provider[0].toUpperCase() + provider.slice(1)} sign-in has not been set up yet. Ask the workspace owner to finish the provider setup.`);
          }
          if (options.link) {
            if (typeof options.accessToken !== 'string' || !options.accessToken) {
              throw new Error('Sign in again before connecting a provider.');
            }
            const response = await fetch(`${this.serverUrl}/auth/providers/${provider}/link`, {
              method: 'POST',
              credentials: 'include',
              headers: { Authorization: `Bearer ${options.accessToken}` }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.message || 'Could not connect this account.');
            }
            if (popup.closed) throw new Error('Connection window was closed.');
            if (typeof data.url !== 'string') throw new Error('The server returned an invalid connection URL.');
            popup.location.href = new URL(data.url, this.serverUrl).href;
          } else {
            if (popup.closed) throw new Error('Sign-in window was closed.');
            popup.location.href = url;
          }
        };
        beginProviderLogin().catch((error) => {
          processing = true;
          cleanup();
          if (!popup.closed) popup.close();
          reject(error);
        });
      });
    }

    // --- Auto Refresh ---

    _startAutoRefresh() {
      this._stopAutoRefresh();
      // Access token is usually valid for 15 mins, let's refresh at 13 mins (13 * 60 * 1000 ms)
      this._refreshTimer = setInterval(() => {
        this.refreshToken().catch(err => console.error('Token refresh failed:', err));
      }, 13 * 60 * 1000);
    }

    _stopAutoRefresh() {
      if (this._refreshTimer) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
      }
    }

    _clearLocalState() {
      this._stopAutoRefresh();
      this._tokens = null;
      this._user = null;
    }

    // --- Helpers ---

    async _request(method, path, body, useAuth) {
      const url = `${this.serverUrl}${path}`;
      const headers = {
        'Content-Type': 'application/json'
      };

      if (useAuth && this._tokens?.accessToken) {
        headers['Authorization'] = `Bearer ${this._tokens.accessToken}`;
      }

      const options = {
        method,
        headers,
        mode: 'cors'
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        // Empty response or non-json
      }

      if (!response.ok) {
        const error = new Error(data.message || 'Request failed');
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    }

    _handleError(error) {
      if (this.onError) {
        this.onError(error);
      }
    }

    // --- Getters ---

    get user() { return this._user; }
    get tokens() { return this._tokens; }
    get isAuthenticated() { return !!this._tokens?.accessToken; }

    // --- Pre-built UI: Login/Register Modal ---

    showLoginModal() {
      if (this._modalElement) return;

      // Inject Modal CSS
      let linkId = 'ra-modal-styles';
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `${this.serverUrl}/sdk/rishiraj-auth-modal.css`;
        document.head.appendChild(link);
      }

      // Backdrop overlay
      const overlay = document.createElement('div');
      overlay.className = 'ra-overlay';
      this._modalElement = overlay;

      // Modal container
      const modal = document.createElement('div');
      modal.className = 'ra-modal';
      overlay.appendChild(modal);

      // Header
      const header = document.createElement('div');
      header.className = 'ra-modal-header';
      header.innerHTML = `
        <h3 class="ra-modal-title">Rishiraj <span class="ra-title-accent">Auth</span></h3>
        <button class="ra-close" type="button">&times;</button>
      `;
      modal.appendChild(header);

      // Tabs
      const tabs = document.createElement('div');
      tabs.className = 'ra-tabs';
      tabs.innerHTML = `
        <button class="ra-tab active" data-panel="login">Sign In</button>
        <button class="ra-tab" data-panel="register">Sign Up</button>
      `;
      modal.appendChild(tabs);

      // Form
      const form = document.createElement('div');
      form.className = 'ra-form';
      modal.appendChild(form);

      // Messages div
      const msgDiv = document.createElement('div');
      msgDiv.className = 'ra-message';
      form.appendChild(msgDiv);

      const showMessage = (msg, isError = true) => {
        msgDiv.className = `ra-message ra-show ${isError ? 'error' : 'success'}`;
        msgDiv.textContent = msg;
      };

      const showMessageWithLink = (message, url, label) => {
        showMessage(message, false);
        let link;
        try {
          link = new URL(url);
        } catch (_error) {
          return;
        }
        if (link.protocol !== 'https:') return;
        msgDiv.appendChild(document.createElement('br'));
        const anchor = document.createElement('a');
        anchor.href = link.href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = label;
        msgDiv.appendChild(anchor);
      };

      const clearMessage = () => {
        msgDiv.className = 'ra-message';
        msgDiv.textContent = '';
      };

      // 1. Login Panel
      const loginPanel = document.createElement('div');
      loginPanel.className = 'ra-form-panel ra-active';
      loginPanel.id = 'ra-panel-login';
      loginPanel.innerHTML = `
        <div class="ra-field">
          <label class="ra-label">Email</label>
          <input class="ra-input" id="ra-login-email" type="email" placeholder="you@example.com" required />
        </div>
        <div class="ra-field" style="margin-bottom: 8px;">
          <label class="ra-label">Password</label>
          <div class="ra-input-wrap">
            <input class="ra-input" id="ra-login-password" type="password" placeholder="••••••••" required />
            <button class="ra-toggle-pw" type="button">${EYE_CLOSED_SVG}</button>
          </div>
        </div>
        <div class="ra-forgot-row">
          <button class="ra-btn-link" id="ra-link-forgot" type="button">Forgot Password?</button>
        </div>
        <button class="ra-btn-primary" id="ra-btn-login-submit" type="button">Sign In</button>
        <div class="ra-divider">or</div>
        <button class="ra-btn-social" data-ra-provider="google" type="button">
          ${GOOGLE_SVG}
          <span>Continue with Google</span>
        </button>
        <button class="ra-btn-social" data-ra-provider="github" type="button">
          <span class="ra-social-glyph" aria-hidden="true">⌘</span>
          <span>Continue with GitHub</span>
        </button>
        <button class="ra-btn-social" data-ra-provider="facebook" type="button">
          <span class="ra-social-glyph" aria-hidden="true">f</span>
          <span>Continue with Facebook</span>
        </button>
      `;
      form.appendChild(loginPanel);

      // 2. Register Panel
      const registerPanel = document.createElement('div');
      registerPanel.className = 'ra-form-panel';
      registerPanel.id = 'ra-panel-register';
      registerPanel.innerHTML = `
        <div class="ra-field">
          <label class="ra-label">Email</label>
          <input class="ra-input" id="ra-register-email" type="email" placeholder="you@example.com" required />
        </div>
        <div class="ra-field">
          <label class="ra-label">Password</label>
          <div class="ra-input-wrap">
            <input class="ra-input" id="ra-register-password" type="password" placeholder="At least 12 characters" required />
            <button class="ra-toggle-pw" type="button">${EYE_CLOSED_SVG}</button>
          </div>
        </div>
        <div class="ra-field">
          <label class="ra-label">Workspace invitation</label>
          <input class="ra-input" id="ra-register-invite-token" type="password" placeholder="One-time invitation token" required />
        </div>
        <button class="ra-btn-primary" id="ra-btn-register-submit" type="button">Sign Up</button>
      `;
      form.appendChild(registerPanel);

      // 3. Forgot Password Panel
      const forgotPanel = document.createElement('div');
      forgotPanel.className = 'ra-form-panel';
      forgotPanel.id = 'ra-panel-forgot';
      forgotPanel.innerHTML = `
        <div class="ra-field">
          <label class="ra-label">Email Address</label>
          <input class="ra-input" id="ra-forgot-email" type="email" placeholder="you@example.com" required />
        </div>
        <button class="ra-btn-primary" id="ra-btn-forgot-submit" type="button" style="margin-bottom: 16px;">Send Reset Token</button>
        <div class="ra-field" style="margin-top: 12px;">
          <label class="ra-label">Reset Token</label>
          <input class="ra-input" id="ra-reset-token" type="text" placeholder="Paste your reset token" />
        </div>
        <div class="ra-field">
          <label class="ra-label">New Password</label>
          <div class="ra-input-wrap">
            <input class="ra-input" id="ra-reset-password" type="password" placeholder="At least 12 characters" />
            <button class="ra-toggle-pw" type="button">${EYE_CLOSED_SVG}</button>
          </div>
        </div>
        <button class="ra-btn-primary" id="ra-btn-reset-submit" type="button" style="margin-bottom: 16px;">Reset Password</button>
        <div style="text-align: center;">
          <button class="ra-btn-link" id="ra-link-back-login" type="button">Back to Sign In</button>
        </div>
      `;
      form.appendChild(forgotPanel);

      // Footer branding
      const footer = document.createElement('div');
      footer.className = 'ra-footer';
      const footerText = document.createElement('span');
      footerText.className = 'ra-footer-text';
      footerText.textContent = 'Secured by';
      const footerLink = document.createElement('a');
      footerLink.className = 'ra-footer-brand';
      footerLink.href = this.serverUrl;
      footerLink.target = '_blank';
      footerLink.rel = 'noopener noreferrer';
      footerLink.textContent = 'Rishiraj Auth';
      footer.append(footerText, footerLink);
      modal.appendChild(footer);

      // Append overlay to body
      document.body.appendChild(overlay);

      // Force reflow and show modal
      setTimeout(() => overlay.classList.add('ra-visible'), 10);

      // Prevent scrolling
      document.body.style.overflow = 'hidden';

      // --- Bind DOM Listeners ---

      const closeBtn = header.querySelector('.ra-close');
      const closeHandler = () => this.hideLoginModal();
      closeBtn.addEventListener('click', closeHandler);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeHandler();
      });

      // Password toggle visibility
      modal.querySelectorAll('.ra-toggle-pw').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = btn.parentNode.querySelector('input');
          if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = EYE_OPEN_SVG;
          } else {
            input.type = 'password';
            btn.innerHTML = EYE_CLOSED_SVG;
          }
        });
      });

      // Tabs switching
      const tabBtns = tabs.querySelectorAll('.ra-tab');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          clearMessage();
          tabBtns.forEach(b => b.classList.remove('active'));
          modal.querySelectorAll('.ra-form-panel').forEach(p => p.classList.remove('ra-active'));

          btn.classList.add('active');
          const panelId = `ra-panel-${btn.dataset.panel}`;
          modal.querySelector(`#${panelId}`).classList.add('ra-active');
        });
      });

      // Switch to forgot password panel
      loginPanel.querySelector('#ra-link-forgot').addEventListener('click', () => {
        clearMessage();
        loginPanel.classList.remove('ra-active');
        forgotPanel.classList.add('ra-active');
      });

      // Back to login from forgot
      forgotPanel.querySelector('#ra-link-back-login').addEventListener('click', () => {
        clearMessage();
        forgotPanel.classList.remove('ra-active');
        loginPanel.classList.add('ra-active');
      });

      // Set button loading helper
      const setBtnLoading = (btn, isLoading, originalText) => {
        btn.disabled = isLoading;
        if (isLoading) {
          btn.innerHTML = `<span class="ra-loading"></span>Loading...`;
        } else {
          btn.innerHTML = originalText;
        }
      };

      // Submit Actions
      // 1. Login Submit
      const loginBtn = loginPanel.querySelector('#ra-btn-login-submit');
      loginBtn.addEventListener('click', async () => {
        clearMessage();
        const email = loginPanel.querySelector('#ra-login-email').value.trim();
        const password = loginPanel.querySelector('#ra-login-password').value;

        if (!email || !password) {
          showMessage('Email and password are required.');
          return;
        }

        setBtnLoading(loginBtn, true, 'Sign In');
        try {
          await this.login(email, password);
          showMessage('Login successful!', false);
          setTimeout(() => closeHandler(), 800);
        } catch (err) {
          showMessage(err.message || 'Login failed.');
        } finally {
          setBtnLoading(loginBtn, false, 'Sign In');
        }
      });

      // 2. Register Submit
      const registerBtn = registerPanel.querySelector('#ra-btn-register-submit');
      registerBtn.addEventListener('click', async () => {
        clearMessage();
        const email = registerPanel.querySelector('#ra-register-email').value.trim();
        const password = registerPanel.querySelector('#ra-register-password').value;
        const inviteToken = registerPanel.querySelector('#ra-register-invite-token').value.trim();

        if (!email || !password || !inviteToken) {
          showMessage('Email, password, and workspace invitation are required.');
          return;
        }
        if (password.length < 12) {
          showMessage('Password must be at least 12 characters.');
          return;
        }

        setBtnLoading(registerBtn, true, 'Sign Up');
        try {
          const res = await this.register(email, password, inviteToken);
          registerPanel.querySelector('#ra-register-invite-token').value = '';
          const successText = 'Registration successful! Please verify your email.';
          if (res.previewUrl) {
            showMessageWithLink(successText, res.previewUrl, '📬 Open test email');
          } else {
            showMessage(successText, false);
          }
          // Wait longer if preview URL is available so developer can click it
          setTimeout(() => {
            tabs.querySelector('[data-panel="login"]').click();
            modal.querySelector('#ra-login-email').value = email;
            if (res.previewUrl) {
              showMessageWithLink('Verification email sent.', res.previewUrl, '📬 Open test email');
            } else {
              showMessage('Verification link sent. Please verify and sign in.', false);
            }
          }, res.previewUrl ? 6000 : 2000);
        } catch (err) {
          showMessage(err.message || 'Registration failed.');
        } finally {
          setBtnLoading(registerBtn, false, 'Sign Up');
        }
      });

      // 3. Social sign-in options
      loginPanel.querySelectorAll('[data-ra-provider]').forEach((providerBtn) => {
        providerBtn.addEventListener('click', async () => {
          clearMessage();
          const provider = providerBtn.dataset.raProvider;
          const providerName = provider[0].toUpperCase() + provider.slice(1);
          setBtnLoading(providerBtn, true, `Continue with ${providerName}`);
          try {
            await this.providerLogin(provider);
            showMessage('Sign-in successful!', false);
            setTimeout(() => closeHandler(), 800);
          } catch (err) {
            showMessage(err.message || `${providerName} sign-in failed.`);
          } finally {
            setBtnLoading(providerBtn, false, `Continue with ${providerName}`);
          }
        });
      });

      // 4. Send Forgot Token Submit
      const forgotBtn = forgotPanel.querySelector('#ra-btn-forgot-submit');
      forgotBtn.addEventListener('click', async () => {
        clearMessage();
        const email = forgotPanel.querySelector('#ra-forgot-email').value.trim();

        if (!email) {
          showMessage('Email is required.');
          return;
        }

        setBtnLoading(forgotBtn, true, 'Send Reset Token');
        try {
          const res = await this.forgotPassword(email);
          const msgText = 'If the account exists, a reset email has been sent.';
          if (res.previewUrl) {
            showMessageWithLink(msgText, res.previewUrl, '📬 Open test email');
          } else {
            showMessage(msgText, false);
          }
          if (res.resetToken) {
            forgotPanel.querySelector('#ra-reset-token').value = res.resetToken;
          }
        } catch (err) {
          showMessage(err.message || 'Request failed.');
        } finally {
          setBtnLoading(forgotBtn, false, 'Send Reset Token');
        }
      });

      // 5. Reset Password Submit
      const resetBtn = forgotPanel.querySelector('#ra-btn-reset-submit');
      resetBtn.addEventListener('click', async () => {
        clearMessage();
        const token = forgotPanel.querySelector('#ra-reset-token').value.trim();
        const newPassword = forgotPanel.querySelector('#ra-reset-password').value;

        if (!token || !newPassword) {
          showMessage('Token and new password are required.');
          return;
        }
        if (newPassword.length < 12) {
          showMessage('Password must be at least 12 characters.');
          return;
        }

        setBtnLoading(resetBtn, true, 'Reset Password');
        try {
          await this.resetPassword(token, newPassword);
          showMessage('Password reset successfully!', false);
          setTimeout(() => {
            forgotPanel.querySelector('#ra-link-back-login').click();
          }, 1500);
        } catch (err) {
          showMessage(err.message || 'Password reset failed.');
        } finally {
          setBtnLoading(resetBtn, false, 'Reset Password');
        }
      });
    }

    hideLoginModal() {
      if (!this._modalElement) return;

      const overlay = this._modalElement;
      overlay.classList.remove('ra-visible');

      // Restore body scrolling
      document.body.style.overflow = '';

      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        this._modalElement = null;
      }, 300);
    }

    showLogoutButton(targetElement) {
      if (!targetElement) return;

      const btn = document.createElement('button');
      btn.className = 'ra-btn-logout';
      btn.type = 'button';
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      `;

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await this.logout();
        } catch (err) {
          console.error('Logout failed:', err);
        } finally {
          btn.disabled = false;
        }
      });

      targetElement.appendChild(btn);
    }
  }

  // UMD export
  if (typeof module === 'object' && module.exports) {
    module.exports = RishirajAuth;
  } else {
    global.RishirajAuth = RishirajAuth;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
