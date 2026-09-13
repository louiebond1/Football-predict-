/* Remove the old Group renderer's global topbar hotfix. It was leaking into other tabs and causing header jumps/glitches. Group-specific chrome is now scoped in group-reference-v1.css. */
(() => {
  const removeLeakedChromeFix = () => {
    document.head.querySelectorAll('style').forEach(style => {
      if ((style.textContent || '').trim() === '.topbar{padding-top:0!important}') style.remove();
    });
  };
  removeLeakedChromeFix();
  requestAnimationFrame(removeLeakedChromeFix);
})();
