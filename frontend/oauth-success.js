(function () {
  'use strict';

  const status = document.getElementById('oauthStatus');
  const params = new URLSearchParams(window.location.search);
  const targetOrigin = params.get('targetOrigin');
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const code = fragment.get('code');
  let normalizedTarget = null;

  // Remove the exchange code from browser history before doing any other work.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  const showError = (message) => {
    status.textContent = message;
    if (window.opener && normalizedTarget) {
      window.opener.postMessage({ type: 'oauth-error', error: message }, targetOrigin);
      window.close();
    }
  };

  try {
    normalizedTarget = new URL(targetOrigin).origin;
  } catch (_error) {
    showError('Sign-in could not be completed. Please close this window and try again.');
    return;
  }

  if (!code || normalizedTarget !== targetOrigin) {
    showError('Sign-in could not be completed. Please close this window and try again.');
    return;
  }

  if (window.opener) {
    // The parent validates both this window's origin and its Window reference,
    // then exchanges the short-lived code itself.
    window.opener.postMessage({ type: 'oauth-code', code }, normalizedTarget);
    window.close();
    return;
  }

  if (normalizedTarget !== window.location.origin) {
    showError('Open sign-in from the application that requested it, then try again.');
    return;
  }

  fetch('/auth/oauth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Sign-in failed.');
      sessionStorage.setItem('accessToken', data.tokens.accessToken);
      sessionStorage.setItem('refreshToken', data.tokens.refreshToken);
      sessionStorage.setItem('tenantId', data.user.tenantId);
    window.location.replace('/studio.html');
    })
    .catch(() => {
      showError('Sign-in could not be completed. Please try again.');
    });
})();
