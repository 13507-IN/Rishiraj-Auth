(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const names = { welcome: 'Get started', appearance: 'Sign-in page', providers: 'Sign-in methods', database: 'Your database', launch: 'Add to your app' };
  let setup, saved, dirty = false, toastTimer, refreshPromise;
  let accessToken = sessionStorage.getItem('accessToken');
  if (!accessToken) { location.replace('/login.html'); return; }
  const auth = new RishirajAuth();

  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
  }
  function remember(tokens) {
    accessToken = tokens.accessToken;
    sessionStorage.setItem('accessToken', accessToken);
    if (tokens.refreshToken) sessionStorage.setItem('refreshToken', tokens.refreshToken);
  }
  async function refreshSession() {
    const response = await fetch('/auth/refresh-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: sessionStorage.getItem('refreshToken') })
    });
    if (!response.ok) {
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      location.replace('/login.html');
      throw new Error('Your session expired. Please sign in again.');
    }
    const data = await response.json();
    remember(data.tokens || data);
  }
  async function api(path, options = {}, retried = false) {
    const response = await fetch(path, {
      ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...options.headers }
    });
    if (response.status === 401 && !retried) {
      if (!refreshPromise) refreshPromise = refreshSession().finally(() => { refreshPromise = null; });
      await refreshPromise;
      return api(path, options, true);
    }
    const data = await response.json();
    if (!response.ok) {
      if (response.status >= 500) throw new Error('The workspace could not be loaded. Check the server and apply the database migrations before trying again.');
      throw new Error(data.errors?.[0]?.message || data.message || 'Request failed. Please try again.');
    }
    return data;
  }
  function navigate() {
    const view = location.hash.slice(1) || 'welcome';
    const selected = Object.hasOwn(names, view) ? view : 'welcome';
    document.querySelectorAll('[data-view]').forEach((section) => { section.hidden = section.dataset.view !== selected; });
    document.querySelectorAll('.studio-nav a').forEach((link) => {
      const active = link.hash === `#${selected}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('breadcrumb').textContent = names[selected];
    document.title = `${names[selected]} · Rishi Auth`;
  }
  function formPage() {
    const fields = new FormData($('brandForm'));
    return {
      brandName: fields.get('brandName').trim(), headline: fields.get('headline').trim(),
      description: fields.get('description').trim(), accent: fields.get('accent'), layout: fields.get('layout'),
      providers: fields.getAll('provider'), published: fields.has('published')
    };
  }
  function preview() {
    const page = formPage();
    $('previewBrand').textContent = page.brandName || 'Your brand';
    $('previewHeadline').textContent = page.headline || 'Welcome back.';
    $('previewDescription').textContent = page.description;
    $('previewCard').dataset.accent = page.accent;
    $('previewLayout').textContent = page.layout === 'split' ? 'Brand story + sign-in' : 'Centered card';
    $('previewProviders').replaceChildren();
    for (const id of page.providers) {
      const item = document.createElement('div');
      item.className = 'preview-provider';
      item.textContent = `Continue with ${id === 'github' ? 'GitHub' : id[0].toUpperCase() + id.slice(1)}`;
      $('previewProviders').append(item);
    }
    dirty = saved ? JSON.stringify({
      ...page, providers: [...page.providers].sort()
    }) !== JSON.stringify({
      ...saved, providers: [...saved.providers].sort()
    }) : false;
    $('saveState').textContent = dirty ? 'Unsaved changes' : saved?.published ? 'Published' : 'Draft saved';
    $('saveState').classList.toggle('pending', dirty || !saved?.published);
  }
  function fillForm(page) {
    for (const key of ['brandName', 'headline', 'description', 'layout']) $(key).value = page[key];
    document.querySelectorAll('[name=accent]').forEach((el) => { el.checked = el.value === page.accent; });
    document.querySelectorAll('[name=provider]').forEach((el) => { el.checked = page.providers.includes(el.value); });
    $('published').checked = page.published;
    preview();
  }
  function updateLaunch() {
    const pageUrl = new URL(`/login.html?workspace=${setup.workspace.id}`, location.origin).href;
    $('pageUrl').textContent = pageUrl;
    $('openPage').href = pageUrl;
    $('openPage').hidden = !saved.published;
    $('publishNotice').textContent = saved.published ? 'Your page is published. Open it in a private browser window to test a fresh sign-in.' : 'Save and publish your page in the page editor to make this link available.';
    $('copyPage').disabled = !saved.published;
    $('sdkSnippet').textContent = `<button id="signIn">Sign in</button>
<script src="${location.origin}/sdk/rishiraj-auth.js"><\/script>
<script>
  const auth = new RishirajAuth({
    serverUrl: ${JSON.stringify(location.origin)},
    tenantId: ${JSON.stringify(setup.workspace.id)},
    onLogin(user, tokens) {
      // Send tokens.accessToken to YOUR backend in an
      // Authorization: Bearer header. Verify it server-side.
      // Keep tokens in memory; never log them.
    }
  });
  document.getElementById('signIn').addEventListener(
    'click', () => auth.showLoginModal()
  );
  // Or use auth.providerLogin('google'), 'github', 'facebook'.
<\/script>`;
    const completed = 1 + Number(setup.pageConfigured) +
      Number(setup.providers.some((p) => p.configured && p.linked)) +
      Number(saved.published);
    $('setupProgress').style.width = `${completed * 25}%`;
    $('progressText').textContent = `${completed} of 4 milestones · account, page settings, connected sign-in, published page`;
  }
  const instructions = {
    google: [
      'Create or select a Google Cloud project. Configure its OAuth consent screen and audience.',
      'Create an OAuth client with the “Web application” type. Add the callback below as an authorized redirect URI.',
      'Add your test email to the consent screen audience while the app is in testing. Save the credentials below on your server.'
    ],
    github: [
      'Open GitHub Settings → Developer settings → OAuth Apps and register a new OAuth app.',
      'Enter your app name and homepage URL. Use the callback below as the authorization callback URL.',
      'Generate a client secret. Save the client ID and secret on your server.'
    ],
    facebook: [
      'Create an app in Meta for Developers and add the Facebook Login use case for your website.',
      'In Facebook Login settings, enable web login and add the callback below to valid OAuth redirect URIs.',
      'Use an app-role/test account during development. Follow Meta’s current review and publishing requirements before enabling public use.'
    ]
  };
  function element(tag, text, className) {
    const el = document.createElement(tag); el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function renderProviders() {
    const host = $('providerGuides'); host.replaceChildren();
    for (const p of setup.providers) {
      const card = document.createElement('details'); card.className = 'panel provider-card';
      const summary = document.createElement('summary');
      summary.append(element('span', p.id === 'github' ? '⌘' : p.name[0], 'provider-icon'));
      const title = element('span', '', 'provider-title');
      title.append(element('strong', p.name), element('small', p.linked ? 'Your account is connected' : 'Your account is not connected'));
      summary.append(title, element('span', p.configured ? 'Server configured' : 'Setup needed', `badge${p.configured ? '' : ' pending'}`), element('span', '⌄'));
      card.append(summary);
      const ol = document.createElement('ol'); ol.className = 'guide-list';
      instructions[p.id].forEach((text) => ol.append(element('li', text)));
      card.append(ol, element('label', 'Callback URL — copy exactly'));
      const row = element('div', '', 'copy-row');
      const copy = element('button', 'Copy callback', 'button'); copy.type = 'button';
      copy.addEventListener('click', () => copyText(p.callbackURL));
      row.append(element('code', p.callbackURL), copy); card.append(row);
      const prefix = p.id.toUpperCase();
      card.append(element('pre', `${prefix}_CLIENT_ID=your_client_id\n${prefix}_CLIENT_SECRET=your_client_secret\n${prefix}_CALLBACK_URL=${p.callbackURL}`));
      card.append(element('p', 'Save these values in the server .env file, restart Rishi Auth, then choose “Recheck setup”. Configured means credentials are present; a successful test sign-in confirms they work.', 'muted'));
      const actions = element('div', '', 'actions');
      for (const [label, href] of [['Provider console ↗', p.console], ['Official guide ↗', p.docs]]) {
        const link = element('a', label, 'button'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.append(link);
      }
      const connect = element('button', p.linked ? `Test ${p.name} sign-in` : `Connect my ${p.name}`, 'button primary');
      connect.disabled = !p.configured;
      connect.addEventListener('click', async () => {
        connect.disabled = true;
        try {
          const result = await auth.providerLogin(p.id, { link: !p.linked, accessToken });
          if (result.user.tenantId !== setup.workspace.id) throw new Error('This provider belongs to another workspace.');
          remember(result.tokens);
          toast(`${p.name} connected successfully.`);
          await load();
        } catch (error) { toast(error.message); }
        finally { connect.disabled = !p.configured; }
      });
      actions.append(connect); card.append(actions); host.append(card);
    }
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); }
    catch (_) { toast('Clipboard access is unavailable. Select the text and copy it manually.'); }
  }
  async function load() {
    $('pageError').hidden = true;
    try {
      setup = await api('/workspace/setup');
      $('workspaceName').textContent = setup.workspace.name;
      if (!dirty) { saved = setup.page; fillForm(saved); }
      $('ownerNotice').hidden = setup.canManage;
      $('savePage').disabled = !setup.canManage;
      $('databaseStatus').textContent = 'PostgreSQL connected';
      renderProviders(); updateLaunch();
      $('setupContent').hidden = false;
    } catch (error) {
      $('pageError').textContent = error.message;
      $('pageError').hidden = false;
    } finally { $('loading').hidden = true; }
  }
  $('brandForm').addEventListener('input', preview);
  $('brandForm').addEventListener('change', preview);
  $('brandForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!setup.canManage) return;
    const button = $('savePage'); button.disabled = true; button.textContent = 'Saving…';
    try {
      const data = await api('/workspace/page', { method: 'PUT', body: JSON.stringify(formPage()) });
      saved = data.page; setup.page = saved; setup.pageConfigured = true; fillForm(saved); updateLaunch();
      $('saveFeedback').textContent = saved.published ? 'Saved. Your published page is up to date.' : 'Saved as a draft. Your public page is offline.';
      toast('Your changes are saved.');
    } catch (error) { $('saveFeedback').textContent = error.message; toast(error.message); }
    finally { button.disabled = false; button.textContent = 'Save changes'; }
  });
  $('resetPage').addEventListener('click', () => { fillForm(saved); $('saveFeedback').textContent = 'Restored your last saved settings.'; });
  $('refreshSetup').addEventListener('click', async () => { await load(); toast('Setup status refreshed.'); });
  $('copyPage').addEventListener('click', () => copyText($('pageUrl').textContent));
  $('copySdk').addEventListener('click', () => copyText($('sdkSnippet').textContent));
  $('signOut').addEventListener('click', async () => {
    $('signOut').disabled = true;
    try {
      await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: sessionStorage.getItem('refreshToken') }) });
      ['accessToken', 'refreshToken', 'tenantId'].forEach((key) => sessionStorage.removeItem(key));
      dirty = false; location.assign('/login.html');
    } catch (error) { toast(`Could not complete sign-out: ${error.message}`); $('signOut').disabled = false; }
  });
  async function health() {
    try {
      const response = await fetch('/health');
      const data = await response.json();
      $('serverStatus').textContent = data.status === 'ok' ? 'Service online' : 'Service needs attention';
      $('serverStatus').style.color = data.status === 'ok' ? '' : '#a34031';
    } catch (_) { $('serverStatus').textContent = 'Service offline'; $('serverStatus').style.color = '#a34031'; }
  }
  window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('hashchange', navigate);
  navigate(); load(); health();
  setInterval(health, 30000);
})();
