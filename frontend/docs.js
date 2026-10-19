(function () {
  'use strict';

  if (window.location.origin && window.location.origin !== 'null' && window.location.protocol !== 'file:') {
    const currentOrigin = window.location.origin;
    document.querySelectorAll('pre code, pre.result').forEach((element) => {
      element.textContent = element.textContent.replaceAll('https://your-auth-server.com', currentOrigin);
    });
  }

  const searchInput = document.getElementById('docSearch');
  const sideNavLinks = document.querySelectorAll('.side-nav a');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      const query = event.target.value.toLowerCase();
      sideNavLinks.forEach((link) => {
        const text = link.textContent.toLowerCase();
        link.parentElement.style.display = text.includes(query) ? 'block' : 'none';
      });
    });
  }

  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach((section) => {
      if (window.pageYOffset >= section.offsetTop - 140) {
        current = section.getAttribute('id');
      }
    });
    sideNavLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
    });
  });
})();
