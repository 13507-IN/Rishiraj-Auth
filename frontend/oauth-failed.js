(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const message = params.get('message') || 'Sign-in did not finish. Please try again.';
  document.getElementById('oauthError').textContent = message;
  history.replaceState(null, '', location.pathname);
  try {
    const target = new URL(params.get('targetOrigin')).origin;
    if (['http:', 'https:'].includes(new URL(target).protocol) && window.opener) {
      window.opener.postMessage({ type: 'oauth-error', error: message }, target);
    }
  } catch (_) {}
})();
