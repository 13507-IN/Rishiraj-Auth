(function(global) {
  'use strict';

  var GOOGLE_SVG = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  var EYE_OPEN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_CLOSED_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-4-11-4s4-8 11-8 11 8 11 8-1.5 3-4.5 6.5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  class RishirajAuth {
    constructor(options = {}) {
      this.serverUrl = (options.serverUrl || window.location.origin).replace(/\/$/, '');
      this.tenantId = options.tenantId || '';
      this.environment = options.environment || 'PRODUCTION';
      this.onLogin = options.onLogin || null;
      this.onLogout = options.onLogout || null;
      this.onTokenRefresh = options.onTokenRefresh || null;
      this.onError = options.onError || null;

      // Storage Keys
      this._storageAccessKey = `ra_${this.tenantId}_access`;
      this._storageRefreshKey = `ra_${this.tenantId}_refresh`;
      this._storageUserKey = `ra_${this.tenantId}_user`;

      this._tokens = {
        accessToken: localStorage.getItem(this._storageAccessKey) || null,
        refreshToken: localStorage.getItem(this._storageRefreshKey) || null
      };

      try {
        const storedUser = localStorage.getItem(this._storageUserKey);
        this._user = storedUser ? JSON.parse(storedUser) : null;
      } catch(e) {
        this._user = null;
      }

      this._refreshTimer = null;
      this._modalElement = null;

      // Auto start token validation or refresh if tokens exist
      if (this._tokens.accessToken) {
        this._startAutoRefresh();
      }
    }

    // --- Core Auth Methods ---

    async register(email, password) {
      try {
        const payload = { email, password, tenantId: this.tenantId };
        const data = await this._request('POST', '/auth/register', payload, false);
        return data;
      } catch (err) {
        this._handleError(err);
        throw err;
      }
    }

    async login(email, password) {
      try {
        const payload = { email, password };
        const data = await this._request('POST', '/auth/login', payload, false);
        
        this._tokens = data.tokens || {};
        this._user = data.user || null;

        localStorage.setItem(this._storageAccessKey, this._tokens.accessToken || '');
        localStorage.setItem(this._storageRefreshKey, this._tokens.refreshToken || '');
        localStorage.setItem(this._storageUserKey, JSON.stringify(this._user));

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

        this._tokens = data || {};
        localStorage.setItem(this._storageAccessKey, this._tokens.accessToken || '');
        localStorage.setItem(this._storageRefreshKey, this._tokens.refreshToken || '');

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
        localStorage.setItem(this._storageUserKey, JSON.stringify(this._user));
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
      const url = `${this.serverUrl}/auth/google?tenantId=${encodeURIComponent(this.tenantId)}&redirect=true`;
      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        url,
        'rishiraj_auth_google',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      return new Promise((resolve, reject) => {
        const handleMessage = (event) => {
          if (event.origin !== this.serverUrl) return;
          if (event.data && event.data.type === 'oauth-success') {
            window.removeEventListener('message', handleMessage);

            this._tokens = {
              accessToken: event.data.accessToken,
              refreshToken: event.data.refreshToken
            };

            localStorage.setItem(this._storageAccessKey, this._tokens.accessToken || '');
            localStorage.setItem(this._storageRefreshKey, this._tokens.refreshToken || '');

            this.getProfile()
              .then(user => {
                if (this.onLogin) this.onLogin(user, this._tokens);
                this._startAutoRefresh();
                resolve({ user, tokens: this._tokens });
              })
              .catch(err => {
                reject(err);
              });
          }
        };

        window.addEventListener('message', handleMessage);

        const checkClosed = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            reject(new Error('Google login popup closed by user'));
          }
        }, 1000);
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
      localStorage.removeItem(this._storageAccessKey);
      localStorage.removeItem(this._storageRefreshKey);
      localStorage.removeItem(this._storageUserKey);
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

      const showMessage = (msg, isError = true, isHtml = false) => {
        msgDiv.className = `ra-message ra-show ${isError ? 'error' : 'success'}`;
        if (isHtml) {
          msgDiv.innerHTML = msg;
        } else {
          msgDiv.textContent = msg;
        }
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
        <button class="ra-btn-google" id="ra-btn-google-login" type="button">
          ${GOOGLE_SVG}
          <span>Continue with Google</span>
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
            <input class="ra-input" id="ra-register-password" type="password" placeholder="Minimum 8 characters" required />
            <button class="ra-toggle-pw" type="button">${EYE_CLOSED_SVG}</button>
          </div>
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
            <input class="ra-input" id="ra-reset-password" type="password" placeholder="Minimum 8 characters" />
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
      footer.innerHTML = `
        <span class="ra-footer-text">Secured by</span>
        <a class="ra-footer-brand" href="${this.serverUrl}" target="_blank">Rishiraj Auth</a>
      `;
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
        const password = loginPanel.querySelector('#ra-login-password').value.trim();

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
        const password = registerPanel.querySelector('#ra-register-password').value.trim();

        if (!email || !password) {
          showMessage('Email and password are required.');
          return;
        }
        if (password.length < 8) {
          showMessage('Password must be at least 8 characters.');
          return;
        }

        setBtnLoading(registerBtn, true, 'Sign Up');
        try {
          const res = await this.register(email, password);
          let successText = 'Registration successful! Please verify your email.';
          if (res.previewUrl) {
            successText += `<br><a href="${res.previewUrl}" target="_blank" style="color:#ffb86b; text-decoration:underline; font-weight:600; display:inline-block; margin-top:4px;">📬 Click here to Open Test Email (Ethereal)</a>`;
            showMessage(successText, false, true);
          } else {
            showMessage(successText, false);
          }
          // Wait longer if preview URL is available so developer can click it
          setTimeout(() => {
            tabs.querySelector('[data-panel="login"]').click();
            modal.querySelector('#ra-login-email').value = email;
            if (res.previewUrl) {
              showMessage(`Verification email sent.<br><a href="${res.previewUrl}" target="_blank" style="color:#ffb86b; text-decoration:underline; font-weight:600; display:inline-block; margin-top:4px;">📬 Click here to Open Test Email (Ethereal)</a>`, false, true);
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

      // 3. Google OAuth Submit
      const googleBtn = loginPanel.querySelector('#ra-btn-google-login');
      googleBtn.addEventListener('click', async () => {
        clearMessage();
        try {
          await this.googleLogin();
          showMessage('Login successful!', false);
          setTimeout(() => closeHandler(), 800);
        } catch (err) {
          showMessage(err.message || 'Google OAuth failed.');
        }
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
          let msgText = 'Reset token has been sent!';
          if (res.previewUrl) {
            msgText += `<br><a href="${res.previewUrl}" target="_blank" style="color:#ffb86b; text-decoration:underline; font-weight:600; display:inline-block; margin-top:4px;">📬 Click here to Open Reset Email (Ethereal)</a>`;
            showMessage(msgText, false, true);
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
        const newPassword = forgotPanel.querySelector('#ra-reset-password').value.trim();

        if (!token || !newPassword) {
          showMessage('Token and new password are required.');
          return;
        }
        if (newPassword.length < 8) {
          showMessage('Password must be at least 8 characters.');
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
