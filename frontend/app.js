// Select DOM elements
const accessTokenInput = document.getElementById('accessToken');
const keyNameInput = document.getElementById('keyName');
const createKeyButton = document.getElementById('createKey');
const result = document.getElementById('result');
const googleLoginButton = document.getElementById('googleLogin');
const tenantIdInput = document.getElementById('tenantId');

const registerBtn = document.getElementById('registerBtn');
const registerResult = document.getElementById('registerResult');
const regEmail = document.getElementById('regEmail');
const regPassword = document.getElementById('regPassword');
const regTenantName = document.getElementById('regTenantName');
const regInviteToken = document.getElementById('regInviteToken');

const verifyBtn = document.getElementById('verifyBtn');
const verifyResult = document.getElementById('verifyResult');
const verifyToken = document.getElementById('verifyToken');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginResult = document.getElementById('loginResult');

const copyTenantIdBtn = document.getElementById('copyTenantId');
const copyVerifyTokenBtn = document.getElementById('copyVerifyToken');
const copyAccessTokenBtn = document.getElementById('copyAccessToken');
const copyApiKeyBtn = document.getElementById('copyApiKey');

const currentTenant = document.getElementById('currentTenant');
const currentAccess = document.getElementById('currentAccess');

const loadKeysButton = document.getElementById('loadKeys');
const keysList = document.getElementById('keysList');
const createdApiKey = document.getElementById('createdApiKey');

// Environment buttons
const envDevBtn = document.getElementById('envDev');
const envProdBtn = document.getElementById('envProd');

// Playground elements
const playgroundKey = document.getElementById('playgroundKey');
const playgroundMethod = document.getElementById('playgroundMethod');
const validateKeyBtn = document.getElementById('validateKeyBtn');
const playgroundResult = document.getElementById('playgroundResult');

// Password Reset elements
const resetEmail = document.getElementById('resetEmail');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const forgotResult = document.getElementById('forgotResult');
const resetToken = document.getElementById('resetToken');
const newPassword = document.getElementById('newPassword');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');
const resetResult = document.getElementById('resetResult');

// App state
try {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
} catch (_error) {
  // Web storage may be disabled; authentication can still run in memory.
}
let cachedTenantId = sessionStorage.getItem('tenantId') || '';
let cachedVerifyToken = '';
let cachedAccessToken = sessionStorage.getItem('accessToken') || '';
let cachedApiKey = '';
let currentEnv = 'DEVELOPMENT'; // default environment

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

// Toast helper
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  // Auto-remove toast after animation completes
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Confirmation modal helper
function confirmAction(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="action-row" style="margin-top:20px; justify-content:flex-end; gap:12px;">
        <button class="ghost btn-sm" id="cancelModalBtn">Cancel</button>
        <button class="primary btn-danger btn-sm" id="confirmModalBtn">Confirm Revocation</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('cancelModalBtn').onclick = () => overlay.remove();
  document.getElementById('confirmModalBtn').onclick = () => {
    onConfirm();
    overlay.remove();
  };
}

const setStatusInputs = () => {
  if (currentTenant) currentTenant.value = cachedTenantId || '';
  if (currentAccess) currentAccess.value = cachedAccessToken || '';
  if (accessTokenInput && !accessTokenInput.value) {
    accessTokenInput.value = cachedAccessToken || '';
  }
  if (tenantIdInput && !tenantIdInput.value) {
    tenantIdInput.value = cachedTenantId || '';
  }
};

const getSelectedServices = () => {
  const checkboxes = Array.from(document.querySelectorAll('.services input[type="checkbox"]'));
  return checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
};

const getErrorMessage = (data) => {
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map((err) => err.message).join(', ');
  }
  return (data && data.message) || 'Request failed.';
};

const copyText = async (text, fallbackMessage) => {
  if (!text) {
    if (fallbackMessage) {
      showToast(fallbackMessage, 'error');
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
  } catch (err) {
    showToast('Copy failed. Please copy manually.', 'error');
  }
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const maskKey = (last4) => {
  if (!last4) return '****';
  return `•••• •••• •••• ${last4}`;
};

const revokeKey = function(keyId) {
  const token = accessTokenInput.value.trim() || cachedAccessToken;
  if (!token) {
    showToast('Please log in or provide an access token first.', 'error');
    return;
  }

  confirmAction(
    'Revoke API Key',
    'Are you sure you want to revoke this API key? This action is permanent and cannot be undone.',
    async () => {
      try {
        const response = await fetch(`/api-keys/${keyId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = await response.json();
        if (!response.ok) {
          showToast(getErrorMessage(data), 'error');
          return;
        }

        showToast('API Key revoked successfully', 'success');
        loadKeys(); // Refresh list
      } catch (err) {
        showToast('Network error revoking key.', 'error');
      }
    }
  );
};

const renderKeys = (keys) => {
  if (!keys || keys.length === 0) {
    keysList.innerHTML = '<p class="muted-note">No API keys found for this environment.</p>';
    return;
  }

  keysList.innerHTML = keys.map((key) => {
    const services = key.services && key.services.length ? key.services.join(', ') : 'none';
    const isRevoked = !!key.revokedAt;
    const statusText = isRevoked ? 'Revoked' : 'Active';
    const statusClass = isRevoked ? 'status-revoked' : 'status-active';
    const envClass = key.environment === 'PRODUCTION' ? 'env-badge-prod' : 'env-badge-dev';
    
    return `
      <div class="key-card" style="margin-bottom:16px; border-left:4px solid ${isRevoked ? 'var(--danger)' : 'var(--success)'};">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div>
            <h3 style="margin:0; font-size:1.1rem; display:inline-flex; align-items:center; gap:8px;">
              ${escapeHtml(key.name)}
              <span class="env-badge ${envClass}">${escapeHtml(key.environment)}</span>
            </h3>
            <p class="muted-note" style="margin:4px 0 0;">Created ${formatDate(key.createdAt)}</p>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="status-badge ${statusClass}">${statusText}</span>
            ${!isRevoked ? `<button class="btn-danger btn-sm" style="padding:4px 10px;" data-key-id="${escapeHtml(key.id)}">Revoke</button>` : ''}
          </div>
        </div>
        <div class="key-meta" style="margin-top:12px; display:flex; justify-content:space-between; color:var(--muted); font-size:0.85rem;">
          <span>${maskKey(key.last4)}</span>
          <span>Services: ${escapeHtml(services)}</span>
        </div>
      </div>
    `;
  }).join('');

  keysList.querySelectorAll('button[data-key-id]').forEach((button) => {
    button.addEventListener('click', () => revokeKey(button.dataset.keyId));
  });
};

// Form toggles
document.querySelectorAll('.toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const targetId = toggle.dataset.toggle;
    const input = document.getElementById(targetId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    toggle.textContent = isHidden ? 'Hide' : 'Show';
  });
});

// Environment Selector Buttons
const updateEnvUI = () => {
  if (currentEnv === 'DEVELOPMENT') {
    envDevBtn.classList.add('active-dev');
    envDevBtn.classList.remove('ghost');
    envProdBtn.classList.remove('active-prod');
    envProdBtn.classList.add('ghost');
  } else {
    envProdBtn.classList.add('active-prod');
    envProdBtn.classList.remove('ghost');
    envDevBtn.classList.remove('active-dev');
    envDevBtn.classList.add('ghost');
  }
};

envDevBtn.addEventListener('click', () => {
  currentEnv = 'DEVELOPMENT';
  updateEnvUI();
  showToast('Switched console environment to DEVELOPMENT', 'info');
  if (accessTokenInput.value.trim() || cachedAccessToken) {
    loadKeys();
  }
});

envProdBtn.addEventListener('click', () => {
  currentEnv = 'PRODUCTION';
  updateEnvUI();
  showToast('Switched console environment to PRODUCTION', 'info');
  if (accessTokenInput.value.trim() || cachedAccessToken) {
    loadKeys();
  }
});

// Google OAuth Login
googleLoginButton.addEventListener('click', () => {
  const tenantId = tenantIdInput.value.trim() || cachedTenantId;
  if (!tenantId) {
    showToast('Tenant ID is required for Google OAuth login.', 'error');
    return;
  }

  // Save tenantId for later
  sessionStorage.setItem('tenantId', tenantId);
  cachedTenantId = tenantId;
  setStatusInputs();
  
  const params = new URLSearchParams({
    tenantId,
    clientOrigin: window.location.origin
  });
  window.location.assign(`/auth/google?${params.toString()}`);
});

// Register
registerBtn.addEventListener('click', async () => {
  const email = regEmail.value.trim();
  const password = regPassword.value;
  const tenantName = regTenantName.value.trim();
  const inviteToken = regInviteToken.value.trim();

  if (!email || !password || password.length < 12 || (!tenantName && !inviteToken) || (tenantName && inviteToken)) {
    showToast('Use a 12-character password and enter either a new workspace name or an invitation token.', 'error');
    registerResult.textContent = 'Use a 12-character password and enter either a new workspace name or an invitation token.';
    return;
  }

  registerResult.textContent = 'Registering...';
  registerBtn.classList.add('loading');

  try {
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        tenantName: tenantName || undefined,
        inviteToken: inviteToken || undefined
      })
    });

    const data = await response.json();
    registerBtn.classList.remove('loading');

    if (!response.ok) {
      const err = getErrorMessage(data);
      registerResult.textContent = err;
      showToast(err, 'error');
      return;
    }

    cachedTenantId = data.user && data.user.tenantId ? data.user.tenantId : '';
    cachedVerifyToken = data.verificationToken || '';
    regInviteToken.value = '';
    sessionStorage.setItem('tenantId', cachedTenantId);
    setStatusInputs();
    showToast('Registered successfully! Verify email to continue.', 'success');

    registerResult.textContent =
      `Registered successfully.\n` +
      (cachedTenantId ? `Tenant ID:\n${cachedTenantId}\n\n` : '') +
      (cachedVerifyToken
        ? `Verify email with this token:\n${cachedVerifyToken}`
        : 'Check your email for the verification token.') +
      (data.previewUrl ? `\n\n📬 Ethereal Test Email:\n${data.previewUrl}` : '');

    if (cachedTenantId && !tenantName) {
      tenantIdInput.value = cachedTenantId;
    }

    verifyToken.value = cachedVerifyToken;
  } catch (err) {
    registerBtn.classList.remove('loading');
    registerResult.textContent = 'Network error. Please try again.';
    showToast('Network error during registration.', 'error');
  }
});

// Verify Email
verifyBtn.addEventListener('click', async () => {
  const token = verifyToken.value.trim();
  if (!token) {
    showToast('Verification token is required.', 'error');
    verifyResult.textContent = 'Verification token is required.';
    return;
  }

  verifyResult.textContent = 'Verifying...';
  verifyBtn.classList.add('loading');

  try {
    const response = await fetch('/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    const data = await response.json();
    verifyBtn.classList.remove('loading');

    if (!response.ok) {
      const err = getErrorMessage(data);
      verifyResult.textContent = err;
      showToast(err, 'error');
      return;
    }

    verifyResult.textContent = 'Email verified. You can now log in.';
    showToast('Email verified successfully! You can now log in.', 'success');
  } catch (err) {
    verifyBtn.classList.remove('loading');
    verifyResult.textContent = 'Network error. Please try again.';
    showToast('Network error verifying email.', 'error');
  }
});

// Login
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    showToast('Email and password are required.', 'error');
    loginResult.textContent = 'Email and password are required.';
    return;
  }

  loginResult.textContent = 'Logging in...';
  loginBtn.classList.add('loading');

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    loginBtn.classList.remove('loading');

    if (!response.ok) {
      const err = getErrorMessage(data);
      loginResult.textContent = err;
      showToast(err, 'error');
      return;
    }

    cachedAccessToken = data.tokens ? data.tokens.accessToken : '';
    cachedTenantId = data.user ? data.user.tenantId : cachedTenantId;
    
    // Tokens remain tab-scoped and are cleared when the browser session ends.
    sessionStorage.setItem('accessToken', cachedAccessToken);
    if (data.tokens && data.tokens.refreshToken) {
      sessionStorage.setItem('refreshToken', data.tokens.refreshToken);
    }
    sessionStorage.setItem('tenantId', cachedTenantId);
    
    setStatusInputs();

    if (cachedAccessToken) {
      accessTokenInput.value = cachedAccessToken;
    }

    if (cachedTenantId) {
      tenantIdInput.value = cachedTenantId;
    }

    loginResult.textContent = 'Login successful. The short-lived access token is available in the protected field. The refresh token stays in this tab session.';
    
    showToast('Login successful!', 'success');
  } catch (err) {
    loginBtn.classList.remove('loading');
    loginResult.textContent = 'Network error. Please try again.';
    showToast('Network error during login.', 'error');
  }
});

// Create API Key
createKeyButton.addEventListener('click', async () => {
  const accessToken = accessTokenInput.value.trim() || cachedAccessToken;
  const name = keyNameInput.value.trim();
  const services = getSelectedServices();

  if (!accessToken || !name || services.length === 0) {
    showToast('Please provide access token, key name, and select at least one service.', 'error');
    result.textContent = 'Please provide access token, key name, and select at least one service.';
    return;
  }

  result.textContent = 'Creating key...';
  createKeyButton.classList.add('loading');

  try {
    const response = await fetch('/api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ name, services, environment: currentEnv })
    });

    const data = await response.json();
    createKeyButton.classList.remove('loading');

    if (!response.ok) {
      const err = getErrorMessage(data);
      result.textContent = err;
      showToast(err, 'error');
      return;
    }

    cachedApiKey = data.apiKey;
    if (createdApiKey) {
      createdApiKey.value = data.apiKey;
    }
    result.textContent = 'API key created. Copy and store it securely.';
    showToast('API key generated successfully!', 'success');
    loadKeys(); // Reload key list
  } catch (err) {
    createKeyButton.classList.remove('loading');
    result.textContent = 'Network error. Please try again.';
    showToast('Network error creating API key.', 'error');
  }
});

// Load Keys
const loadKeys = async () => {
  const accessToken = accessTokenInput.value.trim() || cachedAccessToken;
  if (!accessToken) {
    keysList.innerHTML = '<p class="muted-note">Provide an access token first.</p>';
    return;
  }

  keysList.innerHTML = '<p class="muted-note">Loading keys...</p>';

  try {
    const response = await fetch(`/api-keys?environment=${currentEnv}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      keysList.innerHTML = `<p class="muted-note">${escapeHtml(getErrorMessage(data))}</p>`;
      return;
    }

    renderKeys(data.keys);
  } catch (err) {
    keysList.innerHTML = '<p class="muted-note">Network error. Please try again.</p>';
  }
};

loadKeysButton.addEventListener('click', loadKeys);

// API Key Playground Validator
validateKeyBtn.addEventListener('click', async () => {
  const key = playgroundKey.value.trim();
  const method = playgroundMethod.value;

  if (!key) {
    showToast('Please enter an API key to validate.', 'error');
    return;
  }

  playgroundResult.innerHTML = '<p class="muted-note">Validating key...</p>';
  validateKeyBtn.classList.add('loading');

  try {
    let headers = {
      'Content-Type': 'application/json'
    };
    let body = {};

    if (method === 'bearer') {
      headers['Authorization'] = `Bearer ${key}`;
    } else if (method === 'x-api-key') {
      headers['x-api-key'] = key;
    } else if (method === 'body') {
      body.apiKey = key;
    }

    const response = await fetch('/api-keys/validate', {
      method: 'POST',
      headers,
      body: method === 'body' ? JSON.stringify(body) : JSON.stringify({})
    });

    const data = await response.json();
    validateKeyBtn.classList.remove('loading');

    if (!response.ok) {
      const errMsg = getErrorMessage(data);
      playgroundResult.innerHTML = `
        <div style="background:rgba(255, 107, 107, 0.1); border:1px solid rgba(255, 107, 107, 0.3); border-radius:12px; padding:16px; margin-top:12px;">
          <h4 style="margin:0 0 6px; color:var(--danger); display:flex; align-items:center; gap:8px;">
            ❌ Invalid API Key
          </h4>
          <p style="margin:0; font-size:0.9rem; color:var(--muted);">${escapeHtml(errMsg)}</p>
        </div>
      `;
      showToast('API key is invalid!', 'error');
      return;
    }

    // Success response
    const formattedJson = JSON.stringify(data, null, 2);
    playgroundResult.innerHTML = `
      <div style="background:rgba(126, 224, 129, 0.1); border:1px solid rgba(126, 224, 129, 0.3); border-radius:12px; padding:16px; margin-top:12px;">
        <h4 style="margin:0 0 8px; color:var(--success); display:flex; align-items:center; gap:8px;">
          ✅ Valid API Key
        </h4>
        <div style="font-size:0.85rem; color:var(--text); line-height:1.6;">
          <strong>Tenant ID:</strong> ${escapeHtml(data.tenantId || '-')}<br>
          <strong>Key ID:</strong> ${escapeHtml(data.keyId || '-')}<br>
          <strong>Environment:</strong> <span class="env-badge ${data.environment === 'PRODUCTION' ? 'env-badge-prod' : 'env-badge-dev'}">${escapeHtml(data.environment || 'UNKNOWN')}</span><br>
          <strong>Authorized Services:</strong> ${escapeHtml(data.services ? data.services.join(', ') : 'None')}<br>
        </div>
        <details style="margin-top:12px; font-family:'JetBrains Mono',monospace; font-size:0.75rem;">
          <summary style="cursor:pointer; color:var(--muted);">View Raw JSON Response</summary>
          <pre style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; margin-top:8px; overflow-x:auto; white-space:pre-wrap;">${escapeHtml(formattedJson)}</pre>
        </details>
      </div>
    `;
    showToast('API key is valid!', 'success');
  } catch (err) {
    validateKeyBtn.classList.remove('loading');
    playgroundResult.innerHTML = '<p class="muted-note">Network error. Please try again.</p>';
    showToast('Network error validating API key.', 'error');
  }
});

// Forgot Password Flow
forgotPasswordBtn.addEventListener('click', async () => {
  const email = resetEmail.value.trim();
  if (!email) {
    showToast('Please enter your email address.', 'error');
    return;
  }

  forgotResult.style.display = 'block';
  forgotResult.textContent = 'Sending reset request...';
  forgotPasswordBtn.classList.add('loading');

  try {
    const response = await fetch('/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    forgotPasswordBtn.classList.remove('loading');

    if (!response.ok) {
      const err = getErrorMessage(data);
      forgotResult.textContent = err;
      showToast(err, 'error');
      return;
    }

    forgotResult.textContent = `Reset token generated:\n${data.resetToken || 'Token sent to your email'}` +
      (data.previewUrl ? `\n\n📬 Ethereal Test Email:\n${data.previewUrl}` : '');
    if (data.resetToken) {
      resetToken.value = data.resetToken;
    }
    showToast('Password reset token requested!', 'success');
  } catch (err) {
    forgotPasswordBtn.classList.remove('loading');
    forgotResult.textContent = 'Network error. Please try again.';
    showToast('Network error requesting reset token.', 'error');
  }
});

// Reset Password Completion Flow
resetPasswordBtn.addEventListener('click', async () => {
  const token = resetToken.value.trim();
  const pass = newPassword.value;

  if (!token || !pass) {
    showToast('Reset token and new password are required.', 'error');
    return;
  }
  if (pass.length < 12) {
    showToast('New password must be at least 12 characters long.', 'error');
    return;
  }

  resetResult.style.display = 'block';
  resetResult.textContent = 'Resetting password...';
  resetPasswordBtn.classList.add('loading');

  try {
    const response = await fetch('/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, newPassword: pass })
    });

    const data = await response.json();
    resetPasswordBtn.classList.remove('loading');

    if (!response.ok) {
      const err = getErrorMessage(data);
      resetResult.textContent = err;
      showToast(err, 'error');
      return;
    }

    resetResult.textContent = 'Password reset successfully. You can now login with your new password.';
    showToast('Password reset successfully!', 'success');
  } catch (err) {
    resetPasswordBtn.classList.remove('loading');
    resetResult.textContent = 'Network error. Please try again.';
    showToast('Network error resetting password.', 'error');
  }
});

// Copy buttons
copyTenantIdBtn.addEventListener('click', () => {
  copyText(cachedTenantId, 'Tenant ID not available yet.');
});

copyVerifyTokenBtn.addEventListener('click', () => {
  copyText(cachedVerifyToken, 'Verification token not available yet.');
});

copyAccessTokenBtn.addEventListener('click', () => {
  const token = cachedAccessToken || accessTokenInput.value.trim();
  copyText(token, 'Access token not available yet.');
});

copyApiKeyBtn.addEventListener('click', () => {
  copyText(cachedApiKey, 'API key not available yet.');
});

// Initialize state
setStatusInputs();
updateEnvUI();

const invitationParams = new URLSearchParams(window.location.hash.slice(1));
const invitationToken = invitationParams.get('invite');
if (invitationToken && regInviteToken) {
  regInviteToken.value = invitationToken;
  regEmail.value = invitationParams.get('email') || '';
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  registerResult.style.display = 'block';
  registerResult.textContent = 'Invitation loaded. Create your password to join the workspace.';
}

// Auto-fill login email if we registered
if (localStorage.getItem('registeredEmail')) {
  loginEmail.value = localStorage.getItem('registeredEmail');
}
