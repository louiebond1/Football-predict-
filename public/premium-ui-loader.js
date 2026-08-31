// KickPot premium UI loader.
// Kept separate from app.js to avoid touching application logic while the redesign is reviewed.
(function () {
  if (document.querySelector('link[data-kickpot-premium-ui]')) return;
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/premium-ui.css?v=20260831-1';
  link.setAttribute('data-kickpot-premium-ui', 'true');
  document.head.appendChild(link);
})();
