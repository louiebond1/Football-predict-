const screen = document.querySelector('#screen');

function polishHistory() {
  const overview = screen.querySelector('.history-overview-final');
  if (!overview || !overview.querySelector('.season-zero-final')) return;
  overview.querySelectorAll('.history-menu-final .nav-row-pro').forEach(button => {
    button.disabled = true;
    button.classList.add('history-locked-v2');
    const meta = button.querySelector('small');
    if (meta) meta.textContent = 'Available after your first settled Gameweek';
  });
}

function polishGroup() {
  const root = screen.querySelector('.group-root-final');
  if (!root) return;

  const subtitle = root.querySelector('.group-head .hero-sub');
  if (subtitle) subtitle.textContent = subtitle.textContent.replace(/\b1 members\b/i, '1 member');

  const memberList = root.querySelector('.member-list-final');
  const paymentList = root.querySelector('.payments-list-final');
  if (memberList && paymentList && memberList.dataset.paymentStatusV2 !== '1') {
    memberList.dataset.paymentStatusV2 = '1';
    const memberRows = [...memberList.querySelectorAll('.member-row-final')];
    const sourceRows = [...paymentList.querySelectorAll('.payment-row')];

    memberRows.forEach((row, index) => {
      const source = sourceRows[index];
      if (!source) return;
      const isPaid = Boolean(source.querySelector('.paid'));
      const isClaimed = /\bClaimed\b/i.test(source.textContent || '');
      const confirm = source.querySelector('.confirm-btn');
      const status = document.createElement(confirm ? 'button' : 'span');
      if (confirm) status.type = 'button';
      status.className = `member-pay-status-v2 ${isPaid ? 'paid-v2' : isClaimed ? 'claimed-v2' : 'unpaid-v2'}${confirm ? ' actionable-v2' : ''}`;
      status.textContent = isPaid ? 'Paid ✓' : isClaimed ? 'Needs approval' : 'Unpaid';
      if (confirm) {
        status.setAttribute('aria-label', `Mark ${row.querySelector('strong')?.textContent || 'member'} as paid`);
        status.addEventListener('click', () => {
          status.disabled = true;
          status.textContent = 'Approving…';
          confirm.click();
        });
      }
      row.append(status);
    });

    const confirmAll = paymentList.querySelector('#confirmAllBtn');
    const pending = sourceRows.filter(row => row.querySelector('.confirm-btn')).length;
    if (confirmAll && pending > 1) {
      const approveAll = document.createElement('button');
      approveAll.type = 'button';
      approveAll.className = 'approve-all-v2';
      approveAll.textContent = `Approve all ${pending}`;
      approveAll.addEventListener('click', () => {
        approveAll.disabled = true;
        approveAll.textContent = 'Approving…';
        confirmAll.click();
      });
      memberList.prepend(approveAll);
    }
  }

  paymentList?.classList.add('payments-status-secondary-v2');

  const labels = [
    ['#bankName', 'Account holder'],
    ['#bankSort', 'Sort code'],
    ['#bankAcc', 'Account number']
  ];
  labels.forEach(([selector, text]) => {
    const input = root.querySelector(selector);
    const field = input?.closest('.scorer-row');
    if (!input || !field || field.querySelector('.bank-field-label-v2')) return;
    const label = document.createElement('label');
    label.className = 'bank-field-label-v2';
    label.htmlFor = input.id;
    label.textContent = text;
    field.prepend(label);
  });
}

function polish() {
  const tab = document.querySelector('.nav-item.active')?.dataset?.tab;
  if (tab === 'history') polishHistory();
  if (tab === 'group') polishGroup();
}

let queued = false;
const queuePolish = () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    polish();
  });
};

const observer = new MutationObserver(queuePolish);
observer.observe(screen, { childList: true, subtree: true });
window.addEventListener('load', queuePolish);
queuePolish();
