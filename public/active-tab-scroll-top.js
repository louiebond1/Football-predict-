(() => {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  let animationFrame = 0;

  function cancelScroll() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function gentleScrollToTop() {
    cancelScroll();
    const start = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (start <= 1) return;
    if (reduceMotion) {
      window.scrollTo(0, 0);
      return;
    }

    // Slightly slower than the browser default so tapping the active tab feels
    // like the page glides home rather than snapping or racing upward.
    const duration = Math.min(620, Math.max(360, 300 + start * 0.08));
    const started = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);

    const step = now => {
      const t = Math.min(1, (now - started) / duration);
      window.scrollTo(0, Math.round(start * (1 - ease(t))));
      if (t < 1) animationFrame = requestAnimationFrame(step);
      else animationFrame = 0;
    };
    animationFrame = requestAnimationFrame(step);
  }

  // Register before same-tab-scroll.js. If the user taps the tab they are
  // already on while part-way down the page, this interaction wins: stay on
  // the current screen/sub-screen and glide to its top. A second tap once
  // already at the top can still perform the normal route-reset behaviour.
  document.addEventListener('click', event => {
    const nav = event.target.closest?.('.bottom-nav .nav-item[data-tab]');
    if (!nav || !nav.classList.contains('active')) return;

    const y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (y < 24) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    gentleScrollToTop();
  }, true);

  // Let direct finger scrolling immediately take control again.
  window.addEventListener('touchstart', cancelScroll, { passive: true });
})();
