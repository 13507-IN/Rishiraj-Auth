(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const tenantId = params.get('workspace') || '';
  const auth = new RishirajAuth({ tenantId });
  let mode = 'login', invited = Boolean(params.get('invite')), available = [], busy = false, blocked = false;
  const modes = {
    login: ['Welcome back.', 'Sign in to make yourself at home.', 'Sign in →'],
    register: ['A fresh start.', 'Create your account. We’ll help with the rest.', 'Create account →'],
    verify: ['Check your inbox.', 'Paste the verification code from your email.', 'Verify email →'],
    forgot: ['Let’s get you back in.', 'We’ll email you a password reset code if an account exists.', 'Send reset email →'],
    reset: ['A new password.', 'Use the reset code from your email and choose a strong password.', 'Reset password →']
  };
  function message(text, type = '') {
    $('authMessage').textContent = text; $('authMessage').className = `notice ${type}`; $('authMessage').hidden = false;
  }
  function switchMode(next) {
    if (!Object.hasOwn(modes, next) || busy) return;
    mode = next;
    const [title, subtitle, action] = modes[mode];
    $('authTitle').textContent = title; $('authSubtitle').textContent = subtitle; $('submitAuth').textContent = action;
    $('authMessage').hidden = true;
    $('emailField').hidden = ['verify', 'reset'].includes(mode);
    $('email').required = !$('emailField').hidden;
    $('passwordField').hidden = ['verify', 'forgot'].includes(mode);
    $('password').required = !$('passwordField').hidden;
    $('password').minLength = ['register', 'reset'].includes(mode) ? 12 : 1;
    $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('passwordHint').hidden = !['register', 'reset'].includes(mode);
    $('workspaceField').hidden = mode !== 'register' || invited || Boolean(tenantId);
    $('workspace').required = !$('workspaceField').hidden;
    $('inviteField').hidden = mode !== 'register' || (!invited && !tenantId);
    $('invite').required = !$('inviteField').hidden;
    $('tokenField').hidden = !['verify', 'reset'].includes(mode);
    $('token').required = !$('tokenField').hidden;
    $('helperActions').hidden = mode !== 'login';
    $('socialSection').hidden = mode !== 'login' || !available.length;
    $('inviteToggle').hidden = mode !== 'register' || Boolean(tenantId);
    $('inviteToggle').textContent = invited ? 'Create a new workspace instead' : 'Have an invitation instead?';
    $('backToLogin').hidden = ['login', 'register'].includes(mode);
    $('authTabs').hidden = !['login', 'register'].includes(mode);
    $('recoveryActions').hidden = !['forgot', 'verify'].includes(mode);
    $('resendVerification').hidden = mode !== 'verify';
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
      if (button.closest('.auth-tabs')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
  }
  async function request(path, body) {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.errors?.[0]?.message || data.message || 'Something went wrong. Please try again.');
    return data;
  }
  function finish(data) {
    sessionStorage.setItem('accessToken', data.tokens.accessToken);
    sessionStorage.setItem('refreshToken', data.tokens.refreshToken);
    sessionStorage.setItem('tenantId', data.user.tenantId);
    location.assign('/studio.html');
  }
  async function social(provider, button) {
    if (busy || blocked) return;
    busy = true; button.disabled = true;
    try { finish(await auth.providerLogin(provider)); }
    catch (error) { message(error.message, 'error'); }
    finally { busy = false; button.disabled = false; }
  }
  $('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || blocked) return;
    busy = true; $('submitAuth').disabled = true; $('submitAuth').textContent = 'One moment…';
    const email = $('email').value.trim(), password = $('password').value;
    try {
      if (['register', 'reset', 'login'].includes(mode) && new TextEncoder().encode(password).length > 72) throw new Error('Your password must be at most 72 UTF-8 bytes. Some characters use more than one byte.');
      if (mode === 'login') finish(await auth.login(email, password));
      else if (mode === 'register') {
        const payload = { email, password, ...((invited || tenantId) ? { inviteToken: $('invite').value.trim() } : { tenantName: $('workspace').value.trim() }) };
        const data = await request('/auth/register', payload);
        busy = false; switchMode('verify');
        if (data.verificationToken) $('token').value = data.verificationToken;
        message(data.verificationToken ? 'Local development: your verification code is filled in. Select Verify email to continue.' : 'Account created. Open your email and paste the verification code here.', 'success');
      } else if (mode === 'verify') {
        await auth.verifyEmail($('token').value.trim());
        $('token').value = ''; busy = false; switchMode('login'); message('Email verified. You can sign in now.', 'success');
      } else if (mode === 'forgot') {
        const data = await auth.forgotPassword(email);
        busy = false; switchMode('reset');
        if (data.resetToken) $('token').value = data.resetToken;
        message(data.message || 'Check your email for your reset code.');
      } else if (mode === 'reset') {
        await auth.resetPassword($('token').value.trim(), password);
        $('token').value = ''; $('password').value = '';
        busy = false; switchMode('login'); message('Password updated. Sign in with your new password.', 'success');
      }
    } catch (error) { message(error.message, 'error'); }
    finally { busy = false; $('submitAuth').disabled = blocked; $('submitAuth').textContent = modes[mode][2]; }
  });
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  $('inviteToggle').addEventListener('click', () => { invited = !invited; switchMode('register'); });
  $('togglePassword').addEventListener('click', () => {
    const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password';
    $('togglePassword').textContent = show ? 'Hide' : 'Show'; $('togglePassword').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  $('resendVerification').addEventListener('click', async () => {
    if (!$('email').value || !$('email').checkValidity()) {
      message('Enter your email on the sign-in tab first, then return here to resend verification.'); return;
    }
    $('resendVerification').disabled = true;
    try {
      const data = await auth.resendVerification($('email').value.trim());
      if (data.verificationToken) $('token').value = data.verificationToken;
      message(data.message || 'Check your email for a new code.');
    } catch (error) { message(error.message, 'error'); }
    finally { $('resendVerification').disabled = false; }
  });
  async function init() {
    // Do not allow sign-in through a missing/unpublished branded page.
    $('submitAuth').disabled = true;
    try {
      const response = await fetch(tenantId ? `/workspace/pages/${encodeURIComponent(tenantId)}` : '/auth/providers');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load sign-in.');
      if (data.page) {
        const page = data.page;
        document.body.dataset.accent = page.accent;
        $('authLayout').classList.toggle('centered', page.layout === 'centered');
        $('storyBrand').textContent = page.brandName; $('cardBrand').textContent = page.brandName;
        $('storyHeadline').textContent = page.headline; $('storyDescription').textContent = page.description;
        modes.login[0] = page.headline; modes.login[1] = page.description;
        document.title = `Sign in · ${page.brandName}`;
      }
      available = data.providers.filter((p) => p.configured);
      for (const provider of available) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'button full';
        button.textContent = `Continue with ${provider.name}`;
        button.addEventListener('click', () => social(provider.id, button));
        $('providerButtons').append(button);
      }
      $('invite').value = params.get('invite') || '';
      switchMode(params.get('mode') === 'register' || invited ? 'register' : 'login');
    } catch (error) {
      blocked = true; $('authForm').hidden = true; $('authTabs').hidden = true;
      $('helperActions').hidden = true; $('socialSection').hidden = true;
      message(`${error.message} Ask the workspace owner for an updated sign-in link.`, 'error');
    } finally { $('submitAuth').disabled = blocked; }
  }
  init();
})();
