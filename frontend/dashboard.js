// dashboard.js
(function() {
  'use strict';

  // --- Auth Guard ---
  let accessToken = sessionStorage.getItem('accessToken');
  let refreshToken = sessionStorage.getItem('refreshToken');

  function clearAuthSession() {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('tenantId');
  }

  if (!accessToken) {
    window.location.href = '/console.html';
    return;
  }

  // --- State ---
  let currentEnvironment = 'DEVELOPMENT';
  let userProfile = null;
  let auditPage = 1;
  const auditLimit = 10;
  let activeKeysList = [];

  // --- API Request Helper with Auto-Refresh on 401 ---
  async function apiRequest(method, url, body = null, isRetry = false) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    };

    const options = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (response.status === 401 && !isRetry && refreshToken) {
        // Try token refresh
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          // Retry the request
          return await apiRequest(method, url, body, true);
        }
      }

      let data = {};
      try {
        data = await response.json();
      } catch (e) {}

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (err) {
      console.error(`API Error (${method} ${url}):`, err);
      throw err;
    }
  }

  async function attemptTokenRefresh() {
    try {
      const res = await fetch('/auth/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!res.ok) {
        throw new Error('Refresh token invalid');
      }

      const response = await res.json();
      const data = response.tokens || response;
      accessToken = data.accessToken;
      refreshToken = data.refreshToken || refreshToken;
      sessionStorage.setItem('refreshToken', refreshToken);
      sessionStorage.setItem('accessToken', accessToken);
      return true;
    } catch (err) {
      clearAuthSession();
      window.location.href = '/console.html';
      return false;
    }
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  // --- Confirmation Modal ---
  let confirmResolve = null;

  function showConfirm(title, message) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.style.display = 'flex';

    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }

  function hideConfirm(result) {
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'none';
    if (confirmResolve) {
      confirmResolve(result);
      confirmResolve = null;
    }
  }

  // --- DOM Elements & Navigation ---
  const sidebar = document.getElementById('dashboardSidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const navLinks = document.querySelectorAll('.sidebar-nav a');
  const sections = document.querySelectorAll('.dashboard-section');

  // Toggle mobile sidebar
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Sidebar navigation switching
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      const sectionName = link.dataset.section;
      if (!sectionName) return;

      // Update active states
      navLinks.forEach(l => l.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      link.classList.add('active');
      document.getElementById(`section-${sectionName}`).classList.add('active');

      // Close mobile sidebar on navigate
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }

      // Load section specific data
      loadSectionData(sectionName);
    });
  });

  // Load appropriate data when switching sections
  function loadSectionData(sectionName) {
    switch(sectionName) {
      case 'overview':
        fetchProfile();
        fetchDashboardStats();
        break;
      case 'keys':
        fetchApiKeys();
        break;
      case 'sessions':
        fetchSessions();
        break;
      case 'audit':
        auditPage = 1;
        fetchAuditLogs(true);
        break;
      case 'settings':
        populateSettingsFields();
        break;
    }
  }

  // --- Environment Management ---
  function updateSnippet() {
    if (!userProfile) return;
    const codeEl = document.getElementById('integrationCode');
    const tenantId = userProfile.tenantId || 'your-tenant-id';
    const serverUrl = window.location.origin;

    codeEl.textContent = `<!-- Include Rishiraj-Auth SDK -->
<script src="${serverUrl}/sdk/rishiraj-auth.js"></script>

<script>
  // Initialize SDK
  const auth = new RishirajAuth({
    serverUrl: '${serverUrl}',
    tenantId: '${tenantId}',
    environment: '${currentEnvironment}'
  });

  // Handle successful login
  auth.onLogin = (user, tokens) => {
    // Do not write authentication material to the console.
  };

  // Open the prebuilt beautiful login modal
  document.getElementById('loginBtn').onclick = () => {
    auth.showLoginModal();
  };
</script>`;
  }

  // Environment switching handlers
  // 1. Overview Integration Snippet Env Toggle
  const snippetEnvDev = document.getElementById('snippetEnvDev');
  const snippetEnvProd = document.getElementById('snippetEnvProd');

  if (snippetEnvDev && snippetEnvProd) {
    snippetEnvDev.addEventListener('click', () => {
      currentEnvironment = 'DEVELOPMENT';
      snippetEnvDev.className = 'env-toggle-btn active-dev';
      snippetEnvProd.className = 'env-toggle-btn';
      updateSnippet();
    });

    snippetEnvProd.addEventListener('click', () => {
      currentEnvironment = 'PRODUCTION';
      snippetEnvProd.className = 'env-toggle-btn active-prod';
      snippetEnvDev.className = 'env-toggle-btn';
      updateSnippet();
    });
  }

  // 2. API Keys Table Env Toggle
  const keysEnvDev = document.getElementById('keysEnvDev');
  const keysEnvProd = document.getElementById('keysEnvProd');

  if (keysEnvDev && keysEnvProd) {
    keysEnvDev.addEventListener('click', () => {
      currentEnvironment = 'DEVELOPMENT';
      keysEnvDev.className = 'env-toggle-btn active-dev';
      keysEnvProd.className = 'env-toggle-btn';
      fetchApiKeys();
      updateSnippet();
      // Keep overview toggle synchronized
      if (snippetEnvDev && snippetEnvProd) {
        snippetEnvDev.className = 'env-toggle-btn active-dev';
        snippetEnvProd.className = 'env-toggle-btn';
      }
    });

    keysEnvProd.addEventListener('click', () => {
      currentEnvironment = 'PRODUCTION';
      keysEnvProd.className = 'env-toggle-btn active-prod';
      keysEnvDev.className = 'env-toggle-btn';
      fetchApiKeys();
      updateSnippet();
      // Keep overview toggle synchronized
      if (snippetEnvDev && snippetEnvProd) {
        snippetEnvProd.className = 'env-toggle-btn active-prod';
        snippetEnvDev.className = 'env-toggle-btn';
      }
    });
  }

  // --- Fetch Profile ---
  async function fetchProfile() {
    try {
      const data = await apiRequest('GET', '/user/profile');
      userProfile = data.profile;

      // Populate sidebar
      document.getElementById('sidebarEmail').textContent = userProfile.email;
      const initial = userProfile.name ? userProfile.name.charAt(0).toUpperCase() : userProfile.email.charAt(0).toUpperCase();
      document.getElementById('sidebarAvatar').textContent = initial;
      document.getElementById('sidebarName').textContent = userProfile.name || 'Developer';

      // Populate overview cards
      document.getElementById('profileAvatar').textContent = initial;
      document.getElementById('profileName').textContent = userProfile.name || 'Developer';
      document.getElementById('profileEmail').textContent = userProfile.email;
      document.getElementById('profileTenant').textContent = userProfile.tenantId;
      document.getElementById('profileRole').textContent = userProfile.role;
      document.getElementById('profileVerified').textContent = userProfile.isVerified ? '✅ Yes' : '❌ No';
      const inviteMemberCard = document.getElementById('inviteMemberCard');
      if (inviteMemberCard) inviteMemberCard.hidden = userProfile.role !== 'ADMIN';

      updateSnippet();
    } catch (err) {
      showToast(err.message || 'Failed to fetch user profile.', 'error');
    }
  }

  const createInviteBtn = document.getElementById('createInviteBtn');
  if (createInviteBtn) {
    createInviteBtn.addEventListener('click', async () => {
      const email = document.getElementById('inviteEmailInput').value.trim();
      const result = document.getElementById('inviteResult');
      if (!email || !userProfile?.tenantId) {
        showToast('Enter the invitee email after your profile has loaded.', 'error');
        return;
      }

      createInviteBtn.disabled = true;
      try {
        const data = await apiRequest(
          'POST',
          `/admin/tenants/${encodeURIComponent(userProfile.tenantId)}/invitations`,
          { email }
        );
        result.style.display = 'block';
        result.textContent = `Invitation emailed to ${data.invitation.email}\nExpires: ${new Date(data.invitation.expiresAt).toLocaleString()}.`;
        if (data.previewUrl) {
          try {
            const previewUrl = new URL(data.previewUrl);
            if (previewUrl.protocol === 'https:') {
              result.append(document.createTextNode('\n\nDevelopment email preview: '));
              const previewLink = document.createElement('a');
              previewLink.href = previewUrl.href;
              previewLink.target = '_blank';
              previewLink.rel = 'noopener noreferrer';
              previewLink.textContent = 'Open test email';
              result.appendChild(previewLink);
            }
          } catch (_error) {
            // Ignore unexpected preview links.
          }
        }
        document.getElementById('inviteEmailInput').value = '';
        showToast('Invitation email sent.', 'success');
      } catch (error) {
        showToast(error.message || 'Could not create invitation.', 'error');
      } finally {
        createInviteBtn.disabled = false;
      }
    });
  }

  // --- Fetch Dashboard Stats ---
  async function fetchDashboardStats() {
    try {
      const data = await apiRequest('GET', '/user/dashboard-stats');
      
      // Animate the counters
      animateCounter('stat-total-keys', data.totalKeys || 0);
      animateCounter('stat-active-keys', data.activeKeys || 0);
      animateCounter('stat-total-logins', data.totalLogins || 0);
      animateCounter('stat-failed-logins', data.totalFailedLogins || 0);
    } catch (err) {
      showToast('Failed to fetch usage stats.', 'error');
    }
  }

  function animateCounter(id, targetValue) {
    const el = document.getElementById(id);
    if (!el) return;
    
    let current = 0;
    const duration = 500; // ms
    const stepTime = Math.max(Math.floor(duration / (targetValue || 1)), 15);
    
    const timer = setInterval(() => {
      if (current >= targetValue) {
        el.textContent = targetValue;
        clearInterval(timer);
      } else {
        current += Math.ceil((targetValue - current) / 10) || 1;
        el.textContent = current;
      }
    }, stepTime);
  }

  // --- API Key Fetching ---
  async function fetchApiKeys() {
    const tableBody = document.getElementById('keysTableBody');
    tableBody.innerHTML = `<tr><td colspan="6" class="muted-note" style="text-align: center; padding: 24px;">Loading keys...</td></tr>`;

    try {
      const data = await apiRequest('GET', `/api-keys?environment=${currentEnvironment}`);
      activeKeysList = data.keys || [];

      document.getElementById('activeKeysCount').textContent = activeKeysList.length;

      if (activeKeysList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="muted-note" style="text-align: center; padding: 24px;">No active API keys in ${currentEnvironment.toLowerCase()} mode.</td></tr>`;
        return;
      }

      tableBody.innerHTML = '';
      activeKeysList.forEach(key => {
        const row = document.createElement('tr');
        const envClass = key.environment === 'PRODUCTION' ? 'env-badge-prod' : 'env-badge-dev';
        const isRevoked = !!key.revokedAt;
        const statusClass = isRevoked ? 'status-revoked' : 'status-active';
        const statusText = isRevoked ? 'REVOKED' : 'ACTIVE';
        
        row.innerHTML = `
          <td style="font-weight:600;">${escapeHtml(key.name)}</td>
          <td style="font-family: 'JetBrains Mono', monospace; color: var(--muted);">${escapeHtml(key.keyLast4)}</td>
          <td><span class="env-badge ${envClass}">${escapeHtml(key.environment)}</span></td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${new Date(key.createdAt).toLocaleDateString()}</td>
          <td style="text-align: right;">
            ${isRevoked 
              ? `<span style="font-size:0.8rem; color:var(--muted);">Disabled</span>` 
              : `<button class="btn-danger btn-sm" data-id="${key.id}">Revoke</button>`
            }
          </td>
        `;
        tableBody.appendChild(row);
      });

      // Bind revoke button listeners
      tableBody.querySelectorAll('button.btn-danger').forEach(btn => {
        btn.addEventListener('click', () => {
          const keyId = btn.dataset.id;
          handleRevokeKey(keyId);
        });
      });

    } catch (err) {
      showToast(err.message || 'Failed to fetch API keys.', 'error');
      tableBody.innerHTML = `<tr><td colspan="6" class="muted-note" style="text-align: center; padding: 24px; color:var(--danger);">Error loading keys.</td></tr>`;
    }
  }

  // --- Create API Key ---
  const createKeyBtn = document.getElementById('createKeyBtn');
  if (createKeyBtn) {
    createKeyBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('newKeyName');
      const name = nameInput.value.trim();

      if (!name) {
        showToast('Please enter a name for the API key.', 'error');
        return;
      }

      createKeyBtn.classList.add('loading');
      
      const payload = {
        name,
        services: ['auth', 'user'], // Enabled services
        environment: currentEnvironment
      };

      try {
        const data = await apiRequest('POST', '/api-keys', payload);
        
        nameInput.value = '';
        showToast('API Key generated successfully!', 'success');

        // Display key to developer (crucial as it is hashed on server)
        const resultDiv = document.getElementById('newKeyResult');
        const valueEl = document.getElementById('generatedKeyValue');
        resultDiv.style.display = 'block';
        valueEl.textContent = data.key;

        // Scroll to the result
        resultDiv.scrollIntoView({ behavior: 'smooth' });

        // Refresh table & stats
        fetchApiKeys();
        fetchDashboardStats();
      } catch (err) {
        showToast(err.message || 'Failed to generate API Key.', 'error');
      } finally {
        createKeyBtn.classList.remove('loading');
      }
    });
  }

  // --- Revoke API Key ---
  async function handleRevokeKey(id) {
    const key = activeKeysList.find(k => k.id === id);
    const keyName = key ? key.name : 'this API key';

    const confirmed = await showConfirm(
      'Revoke API Key',
      `Are you sure you want to revoke "${keyName}"? Applications relying on this key in ${currentEnvironment.toLowerCase()} mode will lose access immediately. This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await apiRequest('DELETE', `/api-keys/${id}`);
      showToast('API key successfully revoked.', 'success');
      fetchApiKeys();
      fetchDashboardStats();
    } catch (err) {
      showToast(err.message || 'Failed to revoke API key.', 'error');
    }
  }

  // --- API Key Playground ---
  const validateKeyBtn = document.getElementById('validateKeyBtn');
  const playgroundResult = document.getElementById('playgroundResult');

  if (validateKeyBtn) {
    validateKeyBtn.addEventListener('click', async () => {
      const key = document.getElementById('playgroundKey').value.trim();
      const method = document.getElementById('playgroundMethod').value;

      if (!key) {
        showToast('Please enter an API key to validate', 'error');
        return;
      }

      playgroundResult.innerHTML = '<p class="muted-note">Validating...</p>';

      try {
        const options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        };

        if (method === 'bearer') {
          options.headers['Authorization'] = `Bearer ${key}`;
        } else if (method === 'x-api-key') {
          options.headers['x-api-key'] = key;
        } else {
          options.body = JSON.stringify({ apiKey: key });
        }

        const response = await fetch('/api-keys/validate', options);
        const data = await response.json();

        const isValid = data.valid;
        const badgeClass = isValid ? 'status-active' : 'status-revoked';
        const badgeText = isValid ? '✅ VALID API KEY' : '❌ INVALID / REVOKED';

        playgroundResult.innerHTML = `
          <div class="card" style="margin: 0; padding: 20px; border-color: ${isValid ? 'rgba(126, 224, 129, 0.2)' : 'rgba(255, 107, 107, 0.2)'};">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
              <span class="status-badge ${badgeClass}" style="font-size:0.9rem; padding:6px 14px;">${badgeText}</span>
            </div>
            <pre class="result" style="margin: 0; max-height: 200px; overflow: auto;"><code>${escapeHtml(JSON.stringify(data, null, 2))}</code></pre>
          </div>
        `;
      } catch (err) {
        playgroundResult.innerHTML = '<p class="muted-note" style="color:var(--danger);">Network validation error.</p>';
      }
    });
  }

  // --- Fetch Sessions ---
  async function fetchSessions() {
    const container = document.getElementById('sessionsListContainer');
    container.innerHTML = `<div class="muted-note" style="text-align: center; padding: 24px;">Loading sessions...</div>`;

    try {
      const data = await apiRequest('GET', '/user/sessions');
      const sessions = data || [];

      if (sessions.length === 0) {
        container.innerHTML = `<div class="muted-note" style="text-align: center; padding: 24px;">No active sessions found.</div>`;
        return;
      }

      container.innerHTML = '';
      sessions.forEach(session => {
        const card = document.createElement('div');
        card.className = 'session-card';
        
        // Mark current session
        const isCurrent = sessionStorage.getItem('refreshToken') === session.id;
        const currentLabel = isCurrent ? ` <span class="env-badge env-badge-dev" style="margin-left:8px;">Current Session</span>` : '';

        card.innerHTML = `
          <div class="session-info">
            <span class="session-device">${escapeHtml(session.deviceId || 'Unknown Device')}${currentLabel}</span>
            <span class="session-time">
              Login: ${new Date(session.createdAt).toLocaleString()} | Expires: ${new Date(session.expiresAt).toLocaleDateString()}
            </span>
          </div>
          <button class="btn-danger btn-sm" data-id="${session.id}">Log out Device</button>
        `;
        container.appendChild(card);
      });

      // Bind session revocation buttons
      container.querySelectorAll('button.btn-danger').forEach(btn => {
        btn.addEventListener('click', () => {
          const sessionId = btn.dataset.id;
          handleRevokeSession(sessionId);
        });
      });

    } catch (err) {
      showToast(err.message || 'Failed to fetch sessions.', 'error');
      container.innerHTML = `<div class="muted-note" style="text-align: center; padding: 24px; color:var(--danger);">Error loading sessions.</div>`;
    }
  }

  // --- Revoke Session ---
  async function handleRevokeSession(sessionId) {
    const isCurrent = sessionStorage.getItem('refreshToken') === sessionId;
    let message = 'Are you sure you want to end this login session? This device will be forced to log in again.';
    
    if (isCurrent) {
      message = 'Are you sure you want to end your CURRENT session? You will be logged out and redirected to the login page immediately.';
    }

    const confirmed = await showConfirm('End Session', message);
    if (!confirmed) return;

    try {
      await apiRequest('DELETE', `/user/sessions/${sessionId}`);
      showToast('Session ended successfully.', 'success');
      
      if (isCurrent) {
        clearAuthSession();
        window.location.href = '/console.html';
      } else {
        fetchSessions();
      }
    } catch (err) {
      showToast(err.message || 'Failed to end session.', 'error');
    }
  }

  // --- Fetch Audit Logs ---
  const auditBody = document.getElementById('auditTableBody');
  const loadMoreBtn = document.getElementById('loadMoreAuditBtn');

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      auditPage++;
      fetchAuditLogs(false);
    });
  }

  async function fetchAuditLogs(isFresh = true) {
    if (isFresh) {
      auditBody.innerHTML = `<tr><td colspan="4" class="muted-note" style="text-align: center; padding: 24px;">Loading logs...</td></tr>`;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }

    try {
      const data = await apiRequest('GET', `/user/audit-logs?page=${auditPage}&limit=${auditLimit}`);
      const logs = data.logs || [];
      const totalPages = data.totalPages || 1;

      if (isFresh && logs.length === 0) {
        auditBody.innerHTML = `<tr><td colspan="4" class="muted-note" style="text-align: center; padding: 24px;">No audit events found.</td></tr>`;
        return;
      }

      if (isFresh) {
        auditBody.innerHTML = '';
      }

      logs.forEach(log => {
        const row = document.createElement('tr');
        
        let actionClass = 'action-badge';
        if (log.action === 'LOGIN') actionClass += ' action-badge-login';
        else if (log.action === 'LOGOUT') actionClass += ' action-badge-logout';
        else if (log.action === 'FAILED_LOGIN') actionClass += ' action-badge-failed';
        else if (log.action?.includes('CREATE')) actionClass += ' action-badge-create';
        else if (log.action?.includes('REVOKE')) actionClass += ' action-badge-revoke';

        const envBadge = log.environment
          ? `<span class="env-badge ${log.environment === 'PRODUCTION' ? 'env-badge-prod' : 'env-badge-dev'}">${escapeHtml(log.environment)}</span>`
          : '<span style="color:var(--muted); font-size:0.75rem;">Global</span>';

        row.innerHTML = `
          <td><span class="${actionClass}">${escapeHtml(log.action)}</span></td>
          <td style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(log.ip || '127.0.0.1')}</td>
          <td>${envBadge}</td>
          <td style="color:var(--muted); font-size:0.8rem;">${new Date(log.createdAt).toLocaleString()}</td>
        `;
        auditBody.appendChild(row);
      });

      // Show/hide load more button
      if (loadMoreBtn) {
        if (auditPage < totalPages) {
          loadMoreBtn.style.display = 'inline-block';
        } else {
          loadMoreBtn.style.display = 'none';
        }
      }

    } catch (err) {
      showToast('Failed to fetch audit logs.', 'error');
      if (isFresh) {
        auditBody.innerHTML = `<tr><td colspan="4" class="muted-note" style="text-align: center; padding: 24px; color:var(--danger);">Error loading audit events.</td></tr>`;
      }
    }
  }

  // --- Settings Management ---
  function populateSettingsFields() {
    if (!userProfile) return;
    const nameInput = document.getElementById('profileNameInput');
    if (nameInput) {
      nameInput.value = userProfile.name || '';
    }
  }

  // Profile Update Submit
  const updateProfileBtn = document.getElementById('updateProfileBtn');
  if (updateProfileBtn) {
    updateProfileBtn.addEventListener('click', async () => {
      const name = document.getElementById('profileNameInput').value.trim();
      
      if (!name) {
        showToast('Profile name cannot be empty.', 'error');
        return;
      }

      updateProfileBtn.classList.add('loading');
      try {
        await apiRequest('PATCH', '/user/profile', { name });
        showToast('Profile updated successfully!', 'success');
        
        // Refresh local cache and UI
        await fetchProfile();
      } catch (err) {
        showToast(err.message || 'Failed to update profile.', 'error');
      } finally {
        updateProfileBtn.classList.remove('loading');
      }
    });
  }

  // Change Password Submit
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
      const oldPasswordEl = document.getElementById('oldPasswordInput');
      const newPasswordEl = document.getElementById('newPasswordInput');
      
      const oldPassword = oldPasswordEl.value.trim();
      const newPassword = newPasswordEl.value.trim();

      if (!oldPassword || !newPassword) {
        showToast('Current and new password are required.', 'error');
        return;
      }
      if (newPassword.length < 12) {
        showToast('New password must be at least 12 characters long.', 'error');
        return;
      }

      changePasswordBtn.classList.add('loading');
      try {
        await apiRequest('POST', '/user/change-password', { oldPassword, newPassword });
        showToast('Password changed successfully. Logging out active sessions...', 'success');
        
        oldPasswordEl.value = '';
        newPasswordEl.value = '';
        
        // Silently re-authenticate or logout
        setTimeout(() => {
          clearAuthSession();
          window.location.href = '/console.html';
        }, 1500);
      } catch (err) {
        showToast(err.message || 'Failed to change password.', 'error');
      } finally {
        changePasswordBtn.classList.remove('loading');
      }
    });
  }

  // --- Copy to Clipboard Utilities ---
  function setupClipboard(btnId, codeId, successMsg) {
    const btn = document.getElementById(btnId);
    const codeEl = document.getElementById(codeId);
    if (!btn || !codeEl) return;

    btn.addEventListener('click', () => {
      const text = codeEl.textContent;
      navigator.clipboard.writeText(text)
        .then(() => {
          showToast(successMsg, 'success');
          const oldText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.disabled = true;
          setTimeout(() => {
            btn.textContent = oldText;
            btn.disabled = false;
          }, 1500);
        })
        .catch(() => {
          showToast('Failed to copy to clipboard', 'error');
        });
    });
  }

  setupClipboard('copySnippetBtn', 'integrationCode', 'Snippet copied!');
  setupClipboard('copyNewKeyBtn', 'generatedKeyValue', 'API Key copied!');

  // --- Global Confirmation Modal Handlers ---
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmYesBtn = document.getElementById('confirmYesBtn');

  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', () => hideConfirm(false));
  }
  if (confirmYesBtn) {
    confirmYesBtn.addEventListener('click', () => hideConfirm(true));
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- App Initialization ---
  async function init() {
    loadSectionData('overview');
  }

  init();

})();
