const screen = document.querySelector('#screen');

function removeRivalryFromGroup() {
  if (!screen || !document.querySelector('.nav-item.active[data-tab="group"]')) return;

  screen.querySelectorAll('.rivalry-feature-final, .rivalry-page-final').forEach(el => el.remove());

  screen.querySelectorAll('.card').forEach(card => {
    const title = card.querySelector('.card-title')?.textContent?.trim().toLowerCase() || '';
    if (title.includes('group rivalry') || title === 'rivalry') card.remove();
  });

  screen.querySelectorAll('.member-strip-copy-final span').forEach(el => {
    if (el.textContent?.toLowerCase().includes('rivalry')) {
      el.textContent = 'Invite friends to join the pot';
    }
  });
}

const observer = new MutationObserver(() => queueMicrotask(removeRivalryFromGroup));
observer.observe(screen, { childList: true, subtree: true });
window.addEventListener('load', removeRivalryFromGroup);
queueMicrotask(removeRivalryFromGroup);
