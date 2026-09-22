const STORAGE_KEY = 'vigil-ledger-v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultState() {
  return {
    groups: [
      { id: uid(), name: 'Salary', type: 'revenue' },
      { id: uid(), name: 'Freelance', type: 'revenue' },
      { id: uid(), name: 'Housing', type: 'expense' },
      { id: uid(), name: 'Groceries', type: 'expense' },
      { id: uid(), name: 'Transportation', type: 'expense' },
      { id: uid(), name: 'Utilities', type: 'expense' }
    ],
    transactions: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.groups) && Array.isArray(parsed.transactions)) return parsed;
    }
  } catch (err) {
    // fall through to defaults
  }
  return defaultState();
}

let state = loadState();
let editingGroupId = null;
let txFilter = 'all';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatMoney(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toFixed(2);
}

function groupById(id) {
  return state.groups.find(g => g.id === id) || null;
}

function refreshAll() {
  renderGroups();
  populateGroupSelect();
  renderTransactions();
  updateSummary();
  updateCharts();
}

// --- Account groups ---

function renderGroups() {
  const list = document.getElementById('group-list');
  const empty = document.getElementById('group-empty');
  list.innerHTML = '';
  empty.style.display = state.groups.length ? 'none' : 'block';

  state.groups
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(group => {
      const li = document.createElement('li');
      li.className = 'item';

      if (group.id === editingGroupId) {
        li.innerHTML = `
          <form class="row group-edit-form" data-id="${group.id}">
            <label class="sr-only" for="edit-name-${group.id}">Group name</label>
            <input type="text" id="edit-name-${group.id}" class="edit-group-name" value="${escapeHtml(group.name)}" required>
            <label class="sr-only" for="edit-type-${group.id}">Group type</label>
            <select id="edit-type-${group.id}" class="edit-group-type">
              <option value="revenue" ${group.type === 'revenue' ? 'selected' : ''}>Revenue</option>
              <option value="expense" ${group.type === 'expense' ? 'selected' : ''}>Expense</option>
            </select>
            <button class="btn-add" type="submit">Save</button>
            <button class="ghost-btn" type="button" data-cancel-edit="${group.id}">Cancel</button>
          </form>
        `;
      } else {
        const count = state.transactions.filter(t => t.groupId === group.id).length;
        li.innerHTML = `
          <div class="item-main">
            <div class="item-title">
              <span class="chip ${group.type === 'revenue' ? 'chip-revenue' : 'chip-expense'}">${group.type === 'revenue' ? 'Revenue' : 'Expense'}</span>
              <span class="goal-text">${escapeHtml(group.name)}</span>
              <span class="tx-date">${count} transaction${count === 1 ? '' : 's'}</span>
            </div>
            <div class="item-actions">
              <button class="ghost-btn" type="button" data-edit-group="${group.id}">Edit</button>
              <button class="del" type="button" data-remove-group="${group.id}" aria-label="Remove ${escapeHtml(group.name)}">×</button>
            </div>
          </div>
        `;
      }
      list.appendChild(li);
    });

  list.querySelectorAll('[data-edit-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingGroupId = btn.dataset.editGroup;
      renderGroups();
    });
  });
  list.querySelectorAll('[data-cancel-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingGroupId = null;
      renderGroups();
    });
  });
  list.querySelectorAll('[data-remove-group]').forEach(btn => {
    btn.addEventListener('click', () => removeGroup(btn.dataset.removeGroup));
  });
  list.querySelectorAll('.group-edit-form').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const id = form.dataset.id;
      const name = form.querySelector('.edit-group-name').value.trim();
      const type = form.querySelector('.edit-group-type').value;
      if (!name) return;
      const group = groupById(id);
      if (group) {
        group.name = name;
        group.type = type;
        saveState();
      }
      editingGroupId = null;
      refreshAll();
    });
  });
}

function addGroup(event) {
  event.preventDefault();
  const nameInput = document.getElementById('group-name-input');
  const typeSelect = document.getElementById('group-type-input');
  const name = nameInput.value.trim();
  const type = typeSelect.value;
  if (!name || !type) return;
  state.groups.push({ id: uid(), name, type });
  saveState();
  nameInput.value = '';
  refreshAll();
}

function removeGroup(id) {
  const group = groupById(id);
  if (!group) return;
  const used = state.transactions.some(t => t.groupId === id);
  const message = used
    ? `Remove "${group.name}"? Its existing transactions will show as Uncategorized.`
    : `Remove "${group.name}"?`;
  if (!confirm(message)) return;
  state.groups = state.groups.filter(g => g.id !== id);
  if (editingGroupId === id) editingGroupId = null;
  saveState();
  refreshAll();
}

function populateGroupSelect() {
  const select = document.getElementById('tx-group');
  const current = select.value;
  select.innerHTML = '<option value="">Group</option>';

  ['revenue', 'expense'].forEach(type => {
    const groups = state.groups.filter(g => g.type === type);
    if (!groups.length) return;
    const optgroup = document.createElement('optgroup');
    optgroup.label = type === 'revenue' ? 'Revenue' : 'Expense';
    groups
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        optgroup.appendChild(opt);
      });
    select.appendChild(optgroup);
  });

  if ([...select.options].some(opt => opt.value === current)) select.value = current;
}

// --- Transactions ---

function addTransaction(event) {
  event.preventDefault();
  const descInput = document.getElementById('tx-description');
  const amountInput = document.getElementById('tx-amount');
  const groupSelect = document.getElementById('tx-group');
  const dateInput = document.getElementById('tx-date');

  const group = groupById(groupSelect.value);
  if (!group) {
    groupSelect.focus();
    return;
  }
  const value = Math.abs(parseFloat(amountInput.value));
  if (!value || Number.isNaN(value)) {
    amountInput.focus();
    return;
  }

  state.transactions.push({
    id: uid(),
    description: descInput.value.trim(),
    amount: value,
    type: group.type,
    groupId: group.id,
    date: dateInput.value || new Date().toISOString().slice(0, 10)
  });
  saveState();

  descInput.value = '';
  amountInput.value = '';
  dateInput.valueAsDate = new Date();

  refreshAll();
}

function removeTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  refreshAll();
}

function renderTransactions() {
  const container = document.getElementById('transaction-list');
  const empty = document.getElementById('finance-empty');
  const filtered = state.transactions
    .filter(t => txFilter === 'all' || t.type === txFilter)
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  container.innerHTML = '';
  empty.style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(tx => {
    const group = groupById(tx.groupId);
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="item-main">
        <div class="tx-line">
          <strong>${escapeHtml(tx.description) || '(no description)'}</strong>
          <span class="tx-cat">${group ? escapeHtml(group.name) : 'Uncategorized'}</span>
          <span class="tx-date">${escapeHtml(tx.date || '')}</span>
        </div>
        <div class="item-actions">
          <span class="tx-amount ${tx.type === 'revenue' ? 'income' : 'expense'}">${tx.type === 'revenue' ? '+' : '-'}${formatMoney(tx.amount)}</span>
          <button class="del" type="button" data-remove-tx="${tx.id}" aria-label="Remove transaction">×</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('[data-remove-tx]').forEach(btn => {
    btn.addEventListener('click', () => removeTransaction(btn.dataset.removeTx));
  });
}

function setTxFilter(filter) {
  txFilter = filter;
  document.querySelectorAll('#tx-filter button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderTransactions();
}

// --- Summary & charts ---

function netForMonth(monthKey) {
  return state.transactions
    .filter(t => (t.date || '').slice(0, 7) === monthKey)
    .reduce((sum, t) => sum + (t.type === 'revenue' ? t.amount : -t.amount), 0);
}

function updateSummary() {
  const totalRevenue = state.transactions.filter(t => t.type === 'revenue').reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = state.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const net = totalRevenue - totalExpenses;

  document.getElementById('total-income').textContent = formatMoney(totalRevenue);
  document.getElementById('total-expenses').textContent = formatMoney(totalExpenses);

  const netEl = document.getElementById('net-balance');
  netEl.textContent = formatMoney(net);
  netEl.className = 'value ' + (net >= 0 ? 'good' : 'bad');

  const now = new Date();
  const thisMonthKey = now.toISOString().slice(0, 7);
  const lastMonthKey = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const thisNet = netForMonth(thisMonthKey);
  const lastNet = netForMonth(lastMonthKey);

  let trendText = '0%';
  if (lastNet !== 0) {
    const pct = ((thisNet - lastNet) / Math.abs(lastNet)) * 100;
    trendText = (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
  } else if (thisNet !== 0) {
    trendText = thisNet > 0 ? '+100%' : '-100%';
  }
  document.getElementById('balance-trend').textContent = trendText;

  document.getElementById('readout').textContent = formatMoney(net);
}

let monthlyChart = null;
let groupChart = null;

function lastMonths(count) {
  const months = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString(undefined, { month: 'short' }) });
  }
  return months;
}

function chartBaseOptions() {
  return {
    scales: {
      x: { ticks: { color: '#9aa8b9' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      y: { ticks: { color: '#9aa8b9' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
    },
    plugins: { legend: { labels: { color: '#9aa8b9', font: { size: 11 } } } }
  };
}

function updateCharts() {
  if (typeof Chart === 'undefined') return;

  const months = lastMonths(6);
  const revenueData = months.map(m => state.transactions
    .filter(t => t.type === 'revenue' && (t.date || '').slice(0, 7) === m.key)
    .reduce((sum, t) => sum + t.amount, 0));
  const expenseData = months.map(m => state.transactions
    .filter(t => t.type === 'expense' && (t.date || '').slice(0, 7) === m.key)
    .reduce((sum, t) => sum + t.amount, 0));

  const monthlyCtx = document.getElementById('finance-chart');
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(monthlyCtx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Revenue', data: revenueData, backgroundColor: 'rgba(111, 208, 170, 0.75)' },
        { label: 'Expenses', data: expenseData, backgroundColor: 'rgba(220, 125, 111, 0.75)' }
      ]
    },
    options: chartBaseOptions()
  });

  const palette = ['#acdfff', '#e3b64e', '#dc7d6f', '#6fd0aa', '#a994ff', '#7893ad', '#d8f0ff'];
  const expenseGroups = state.groups.filter(g => g.type === 'expense');
  const groupLabels = [];
  const groupData = [];
  expenseGroups.forEach(g => {
    const total = state.transactions
      .filter(t => t.groupId === g.id && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    if (total > 0) {
      groupLabels.push(g.name);
      groupData.push(total);
    }
  });

  const groupCtx = document.getElementById('category-chart');
  if (groupChart) groupChart.destroy();
  groupChart = new Chart(groupCtx, {
    type: 'doughnut',
    data: {
      labels: groupLabels.length ? groupLabels : ['No expenses yet'],
      datasets: [{
        data: groupLabels.length ? groupData : [1],
        backgroundColor: groupLabels.length ? palette : ['rgba(255,255,255,0.08)']
      }]
    },
    options: {
      plugins: { legend: { labels: { color: '#9aa8b9', font: { size: 11 } } } }
    }
  });
}

// --- Decorative / PWA chrome ---

function setGreeting() {
  const el = document.getElementById('greeting');
  if (!el) return;
  const hour = new Date().getHours();
  el.textContent = hour < 5 ? 'Night watch' : hour < 12 ? 'Morning ledger' : hour < 18 ? 'Afternoon tally' : 'Evening reckoning';
}

function spawnSnow() {
  const container = document.getElementById('snow');
  if (!container) return;
  const count = window.innerWidth < 640 ? 20 : 40;
  for (let i = 0; i < count; i++) {
    const flake = document.createElement('div');
    flake.className = 'flake';
    flake.style.left = Math.random() * 100 + 'vw';
    flake.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
    flake.style.animationDuration = (8 + Math.random() * 10) + 's';
    flake.style.animationDelay = (Math.random() * 10) + 's';
    flake.style.opacity = String(0.3 + Math.random() * 0.5);
    container.appendChild(flake);
  }
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.add('show');
});

function setupInstallButton() {
  const installBtn = document.getElementById('install-app');
  if (!installBtn) return;
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('show');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

function setupClearAll() {
  document.getElementById('clear-all').addEventListener('click', () => {
    if (!confirm('Clear all financial data? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = { groups: [], transactions: [] };
    editingGroupId = null;
    txFilter = 'all';
    refreshAll();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  spawnSnow();
  setupInstallButton();
  setupClearAll();
  registerServiceWorker();

  const dateInput = document.getElementById('tx-date');
  if (dateInput) dateInput.valueAsDate = new Date();

  document.getElementById('group-form').addEventListener('submit', addGroup);
  document.getElementById('tx-form').addEventListener('submit', addTransaction);
  document.querySelectorAll('#tx-filter button').forEach(btn => {
    btn.addEventListener('click', () => setTxFilter(btn.dataset.filter));
  });

  refreshAll();
});
