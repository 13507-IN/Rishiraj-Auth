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
const regTenantId = document.getElementById('regTenantId');
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

let cachedTenantId = '';
let cachedVerifyToken = '';
let cachedAccessToken = '';
let cachedApiKey = '';

const setStatusInputs = () => {
  currentTenant.value = cachedTenantId || '';
  currentAccess.value = cachedAccessToken || '';
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
      alert(fallbackMessage);
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    alert('Copy failed. Please copy manually.');
  }
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const maskKey = (last4) => {
  if (!last4) return '****';
  return `**** **** **** ${last4}`;
};

const renderKeys = (keys) => {
  if (!keys || keys.length === 0) {
    keysList.innerHTML = '<p class="muted-note">No API keys found yet.</p>';
    return;
  }

  keysList.innerHTML = keys.map((key) => {
    const services = key.services && key.services.length ? key.services.join(', ') : 'none';
    return `
      <div class="key-card">
        <div>
          <h3>${key.name}</h3>
          <p class="muted-note">Created ${formatDate(key.createdAt)}</p>
        </div>
        <div class="key-meta">
          <span>${maskKey(key.last4)}</span>
          <span>Services: ${services}</span>
        </div>
      </div>
    `;
  }).join('');
};

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

googleLoginButton.addEventListener('click', () => {
  const tenantId = tenantIdInput.value.trim();
  if (!tenantId) {
    result.textContent = 'Tenant ID is required for Google OAuth login.';
    return;
  }

  window.location.href = `/auth/google?tenantId=${encodeURIComponent(tenantId)}&redirect=true`;
});

registerBtn.addEventListener('click', async () => {
  const email = regEmail.value.trim();
  const password = regPassword.value.trim();
  const tenantName = regTenantName.value.trim();
  const tenantId = regTenantId.value.trim();

  if (!email || !password || (!tenantName && !tenantId)) {
    registerResult.textContent = 'Email, password, and tenant name or tenant ID are required.';
    return;
  }

  registerResult.textContent = 'Registering...';

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
        tenantId: tenantId || undefined
      })
    });

    const data = await response.json();

    if (!response.ok) {
      registerResult.textContent = getErrorMessage(data);
      return;
    }

    cachedTenantId = data.user && data.user.tenantId ? data.user.tenantId : '';
    cachedVerifyToken = data.verificationToken || '';
    setStatusInputs();

    registerResult.textContent =
      `Registered successfully.\n` +
      (cachedTenantId ? `Tenant ID:\n${cachedTenantId}\n\n` : '') +
      `Verify email with this token:\n${cachedVerifyToken}`;

    if (cachedTenantId && !tenantId) {
      regTenantId.value = cachedTenantId;
      tenantIdInput.value = cachedTenantId;
    }

    verifyToken.value = cachedVerifyToken;
  } catch (err) {
    registerResult.textContent = 'Network error. Please try again.';
  }
});

verifyBtn.addEventListener('click', async () => {
  const token = verifyToken.value.trim();
  if (!token) {
    verifyResult.textContent = 'Verification token is required.';
    return;
  }

  verifyResult.textContent = 'Verifying...';

  try {
    const response = await fetch('/auth/verify-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (!response.ok) {
      verifyResult.textContent = getErrorMessage(data);
      return;
    }

    verifyResult.textContent = 'Email verified. You can now log in.';
  } catch (err) {
    verifyResult.textContent = 'Network error. Please try again.';
  }
});

loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    loginResult.textContent = 'Email and password are required.';
    return;
  }

  loginResult.textContent = 'Logging in...';

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      loginResult.textContent = getErrorMessage(data);
      return;
    }

    cachedAccessToken = data.tokens ? data.tokens.accessToken : '';
    cachedTenantId = data.user ? data.user.tenantId : cachedTenantId;
    setStatusInputs();

    if (cachedAccessToken) {
      accessTokenInput.value = cachedAccessToken;
    }

    if (cachedTenantId) {
      tenantIdInput.value = cachedTenantId;
    }

    loginResult.textContent =
      `Login successful.\nAccess Token:\n${data.tokens.accessToken}\n\nRefresh Token:\n${data.tokens.refreshToken}`;
  } catch (err) {
    loginResult.textContent = 'Network error. Please try again.';
  }
});

createKeyButton.addEventListener('click', async () => {
  const accessToken = accessTokenInput.value.trim();
  const name = keyNameInput.value.trim();
  const services = getSelectedServices();

  if (!accessToken || !name || services.length === 0) {
    result.textContent = 'Please provide access token, key name, and select at least one service.';
    return;
  }

  result.textContent = 'Creating key...';

  try {
    const response = await fetch('/api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ name, services })
    });

    const data = await response.json();

    if (!response.ok) {
      result.textContent = getErrorMessage(data);
      return;
    }

    cachedApiKey = data.apiKey;
    if (createdApiKey) {
      createdApiKey.value = data.apiKey;
    }
    result.textContent = 'API key created. Copy and store it securely.';
  } catch (err) {
    result.textContent = 'Network error. Please try again.';
  }
});

loadKeysButton.addEventListener('click', async () => {
  const accessToken = accessTokenInput.value.trim();
  if (!accessToken) {
    keysList.innerHTML = '<p class="muted-note">Provide an access token first.</p>';
    return;
  }

  keysList.innerHTML = '<p class="muted-note">Loading keys...</p>';

  try {
    const response = await fetch('/api-keys', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      keysList.innerHTML = `<p class="muted-note">${getErrorMessage(data)}</p>`;
      return;
    }

    renderKeys(data.keys);
  } catch (err) {
    keysList.innerHTML = '<p class="muted-note">Network error. Please try again.</p>';
  }
});

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

setStatusInputs();
