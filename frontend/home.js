(function () {
  'use strict';

  const copyHeroBtn = document.getElementById('copyHeroCodeBtn');
  if (copyHeroBtn) {
    copyHeroBtn.addEventListener('click', async () => {
      const codeText = `<script src="https://your-auth-server.example/sdk/rishiraj-auth.js"><\/script>
<button id="signIn">Sign in</button>
<script>
  const auth = new RishirajAuth({
    serverUrl: "https://your-auth-server.example",
    tenantId: "your-workspace-id",
    onLogin: async (_user, tokens) => {
      // Send the access token to your own backend.
      // Never log it or store it in localStorage.
    }
  });
  document.getElementById("signIn").addEventListener(
    "click", () => auth.showLoginModal()
  );
<\/script>`;
      try {
        await navigator.clipboard.writeText(codeText);
        copyHeroBtn.textContent = 'Copied!';
        setTimeout(() => { copyHeroBtn.textContent = 'Copy'; }, 2000);
      } catch (_error) {
        copyHeroBtn.textContent = 'Copy unavailable';
      }
    });
  }
})();
