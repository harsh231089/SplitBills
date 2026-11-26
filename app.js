(function () {
  const STORAGE_KEY = 'tabby-local-v1';
  const colors = ['#d7e8d8', '#f4d5c9', '#f5e1b5', '#d7e5ed', '#e6d9e8', '#dce6c5'];
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const id = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const daysAgo = days => { const date = new Date(); date.setDate(date.getDate() - days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const money = (amount, group) => new Intl.NumberFormat(undefined, { style: 'currency', currency: group.currency }).format(amount / 100);
  const dateLabel = date => { const parsed = new Date(date + 'T12:00:00'); return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

  function sampleData() {
    const people = ['Alex Morgan', 'Sam Taylor', 'Jordan Lee'].map(name => ({ id: id(), name }));
    return { selected: 'sample', groups: [{ id: 'sample', name: 'Weekend getaway', currency: 'USD', people, expenses: [
      { id: id(), description: 'Dinner at the corner', amount: 8640, paidBy: people[0].id, participants: people.map(person => person.id), date: daysAgo(1) },
      { id: id(), description: 'Groceries & snacks', amount: 4275, paidBy: people[1].id, participants: people.map(person => person.id), date: daysAgo(2) },
      { id: id(), description: 'Coffee run', amount: 1875, paidBy: people[2].id, participants: people.map(person => person.id), date: daysAgo(3) }
    ], settlements: [] }] };
  }

  let state;
  let storageReadFailed = false;
  let storageWriteFailed = false;
  let isNewData = false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    isNewData = stored === null;
    state = isNewData ? sampleData() : JSON.parse(stored);
    if (!Array.isArray(state.groups)) throw new Error('Invalid data');
  } catch (error) {
    state = { selected: null, groups: [] };
    storageReadFailed = true;
    console.error('Could not load saved data:', error);
  }
  let toastTimer;
  const modal = document.getElementById('modal');
  const content = document.getElementById('content');
  const currentGroup = () => state.groups.find(group => group.id === state.selected);
  const personName = (group, personId) => group.people.find(person => person.id === personId)?.name || 'Unknown';
  const avatar = (person, group) => `<span class="avatar" style="background:${colors[group.people.findIndex(item => item.id === person.id) % colors.length]}" title="${escape(person.name)}">${escape(initials(person.name))}</span>`;

  function save() {
    if (storageReadFailed) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageWriteFailed = false;
      return true;
    } catch (error) {
      storageWriteFailed = true;
      return false;
    }
  }
  function notify(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
  }
  function openModal(title, eyebrow, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-eyebrow').textContent = eyebrow;
    document.getElementById('modal-body').innerHTML = body;
    modal.showModal();
  }
  function closeModal() { if (modal.open) modal.close(); }
  function render() {
    const storageWarning = document.getElementById('storage-warning');
    storageWarning.hidden = !storageReadFailed && !storageWriteFailed;
    storageWarning.innerHTML = storageReadFailed
      ? 'Saved data could not be read. No changes will be made to it. Check your browser storage settings and reload.'
      : 'Changes could not be saved. Keep this page open and check your browser storage settings. <button class="text-button" data-action="retry-save">Retry saving</button>';
    document.querySelector('.local-pill').innerHTML = `<span></span>${storageReadFailed || storageWriteFailed ? 'Storage unavailable' : 'Saved locally'}`;
    document.querySelectorAll('[data-action="new-group"], .top-add').forEach(button => { button.disabled = storageReadFailed; });
    if (storageReadFailed) {
      document.getElementById('breadcrumb-group').textContent = 'Unavailable';
      content.innerHTML = '<div class="empty-main"><h1>Unable to load your data</h1><p>Your saved data has not been replaced.</p></div>';
      return;
    }
    if (!currentGroup() && state.groups.length) state.selected = state.groups[0].id;
    const group = currentGroup();
    document.getElementById('breadcrumb-group').textContent = group ? group.name : 'Overview';
    document.getElementById('group-nav').innerHTML = state.groups.map((item, index) => `<button class="group-link ${item.id === state.selected ? 'selected' : ''}" data-action="select-group" data-id="${escape(item.id)}"><span class="group-icon" style="background:${colors[index % colors.length]}">${escape(initials(item.name))}</span><span>${escape(item.name)}</span></button>`).join('');
    if (!group) {
      content.innerHTML = `<div class="empty-main"><div class="eyebrow">A LITTLE LESS MATH, A LOT MORE LIFE</div><h1>Make room for good times.</h1><p>Create a group to start sharing expenses.</p><button class="button button-dark" data-action="new-group">${icon('plus')} Create a group</button></div>`;
      return;
    }
    const amounts = SplitModel.balances(group);
    const debts = SplitModel.debts(group);
    const total = group.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const outstanding = debts.reduce((sum, debt) => sum + debt.amount, 0);
    const activity = [...group.expenses.map(expense => ({ ...expense, kind: 'expense' })), ...group.settlements.map(settlement => ({ ...settlement, kind: 'settlement' }))].sort((first, second) => second.date.localeCompare(first.date));
    const rows = activity.map(item => {
      const isExpense = item.kind === 'expense';
      const title = isExpense ? item.description : 'Payment recorded';
      const details = isExpense ? `${personName(group, item.paidBy)} paid · split ${item.participants.length} ways` : `${personName(group, item.from)} paid ${personName(group, item.to)}`;
      return `<div class="expense-row"><div class="expense-icon">${icon(isExpense ? 'receipt' : 'check')}</div><div class="expense-info"><div class="expense-name">${escape(title)}</div><div class="expense-meta">${escape(details)} · ${escape(dateLabel(item.date))}</div></div><div class="expense-amount">${money(item.amount, group)}<small>${isExpense ? 'expense' : 'settlement'}</small></div>${isExpense ? `<button class="icon-button delete-button" data-action="edit-expense" data-id="${escape(item.id)}" aria-label="Edit ${escape(title)}" title="Edit expense">${icon('more')}</button>` : ''}<button class="icon-button delete-button" data-action="delete-${item.kind}" data-id="${escape(item.id)}" aria-label="Delete ${escape(title)}" title="Delete ${isExpense ? 'expense' : 'payment'}">${icon('trash')}</button></div>`;
    }).join('');
    const balanceRows = group.people.map(person => `<div class="balance-row">${avatar(person, group)}<div class="balance-person">${escape(person.name)}<small>${amounts[person.id] > 0 ? 'is owed' : amounts[person.id] < 0 ? 'owes' : 'all settled up'}</small></div><div class="balance-amount ${amounts[person.id] < 0 ? 'negative' : ''}">${amounts[person.id] === 0 ? 'Settled' : money(Math.abs(amounts[person.id]), group)}</div></div>`).join('');
    const suggestion = debts[0];
    content.innerHTML = `<div class="page-heading"><div><div class="eyebrow">YOUR SHARED SPACE</div><h1>Good to see you.</h1><p>Here's where things stand with your group.</p></div><div class="heading-actions"><button class="button button-outline" data-action="manage-group">${icon('users')} Manage group</button><button class="button button-outline" data-action="new-group">${icon('plus')} New group</button></div></div>
      <section class="group-hero"><div class="hero-copy"><div class="hero-kicker">GROUP OVERVIEW</div><h2>${escape(group.name)}</h2><p>Shared moments, sorted expenses.</p></div><div class="hero-art" aria-hidden="true"><span>✳</span></div><div class="hero-side"><div class="avatar-stack">${group.people.slice(0, 5).map(person => avatar(person, group)).join('')}</div><span class="people-count">${group.people.length} ${group.people.length === 1 ? 'person' : 'people'} in this group</span></div></section>
      <section class="stats" aria-label="Group summary"><div class="stat"><div class="stat-top">Total expenses <span class="stat-icon">${icon('receipt')}</span></div><div class="stat-value">${money(total, group)}</div><div class="stat-caption">across ${group.expenses.length} ${group.expenses.length === 1 ? 'expense' : 'expenses'}</div></div><div class="stat"><div class="stat-top">Outstanding <span class="stat-icon coral">${icon('wallet')}</span></div><div class="stat-value">${money(outstanding, group)}</div><div class="stat-caption">left to settle</div></div><div class="stat"><div class="stat-top">Group members <span class="stat-icon yellow">${icon('users')}</span></div><div class="stat-value">${String(group.people.length).padStart(2, '0')}</div><div class="stat-caption">sharing together</div></div></section>
      <div class="dashboard-grid"><section><div class="section-title"><div><h2>Activity history</h2><p>The little things add up.</p></div><button class="text-button" data-action="add-expense">Add expense ${icon('plus')}</button></div><div class="panel">${rows || '<div class="empty"><strong>Nothing here yet</strong>Add an expense to get things started.</div>'}${activity.length ? `<div class="panel-footer">${activity.length} ${activity.length === 1 ? 'entry' : 'entries'} in this group</div>` : ''}</div></section>
      <div><section><div class="section-title"><div><h2>Group balances</h2><p>Who's up, who's down.</p></div></div><div class="panel balance-panel">${balanceRows}</div></section><section class="settle-section"><div class="section-title"><div><h2>Time to settle?</h2><p>Keep things nice and simple.</p></div></div><div class="settle-card"><div class="settle-icon">${icon('check')}</div><div class="settle-copy"><strong>${suggestion ? `${escape(personName(group, suggestion.from))} owes ${escape(personName(group, suggestion.to))}` : 'Everyone is all settled up'}</strong><p>${suggestion ? `${money(suggestion.amount, group)} suggested payment` : 'No outstanding balances right now.'}</p></div>${suggestion ? '<button class="button" data-action="settle">Record payment</button>' : ''}</div></section></div></div>`;
  }

  function groupForm() {
    openModal('Create a group', 'GOOD TIMES START HERE', `<form id="group-form" class="form-grid"><div class="field"><label for="group-name">Group name</label><input id="group-name" name="name" placeholder="e.g. Weekend getaway" maxlength="60" required autofocus></div><div class="field"><label for="group-people">People</label><input id="group-people" name="people" placeholder="e.g. Alex, Sam, Jordan" required><p class="field-note">Separate names with commas. Include yourself, too.</p></div><div class="field"><label for="group-currency">Currency</label><select id="group-currency" name="currency"><option value="USD">USD - US Dollar</option><option value="EUR">EUR - Euro</option><option value="GBP">GBP - British Pound</option><option value="INR">INR - Indian Rupee</option><option value="CAD">CAD - Canadian Dollar</option><option value="AUD">AUD - Australian Dollar</option></select></div><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button class="button button-dark">Create group</button></div></form>`);
  }
  function manageGroup() {
    const group = currentGroup();
    if (!group) return groupForm();
    openModal('Manage group', 'YOUR PEOPLE', `<form id="people-form" class="form-grid"><div class="field"><label>Members</label><div class="check-list">${group.people.map(person => `<span class="check-item">${escape(person.name)}</span>`).join('')}</div></div><div class="field"><label for="new-people">Add people</label><input id="new-people" name="people" placeholder="Names, separated by commas" required><p class="field-note">New people won't be added to past expenses.</p></div><p class="form-error" role="alert"></p><div class="modal-actions"><button class="button button-dark">Add people</button></div></form><div class="group-settings"><span class="field-label">Delete this group and its history</span><button class="text-button danger-link" data-action="delete-group">${icon('trash')} Delete group</button></div>`);
  }
  function expenseForm(expenseId) {
    const group = currentGroup();
    if (!group) return groupForm();
    const expense = group.expenses.find(item => item.id === expenseId);
    openModal(expense ? 'Edit expense' : 'Add an expense', 'SHARE THE LITTLE THINGS', `<form id="expense-form" class="form-grid" data-id="${escape(expense?.id || '')}"><div class="field"><label for="description">What was it for?</label><input id="description" name="description" placeholder="e.g. Dinner together" maxlength="100" value="${escape(expense?.description || '')}" required autofocus></div><div class="form-row"><div class="field"><label for="amount">Amount (${escape(group.currency)})</label><input id="amount" name="amount" type="number" min="0.01" max="100000000" step="0.01" value="${expense ? (expense.amount / 100).toFixed(2) : ''}" placeholder="0.00" required></div><div class="field"><label for="date">Date</label><input id="date" name="date" type="date" value="${escape(expense?.date || today())}" required></div></div><div class="field"><label for="paid-by">Paid by</label><select id="paid-by" name="paidBy">${group.people.map(person => `<option value="${escape(person.id)}" ${expense?.paidBy === person.id ? 'selected' : ''}>${escape(person.name)}</option>`).join('')}</select></div><div class="field"><span class="field-label">Split equally between</span><div class="check-list">${group.people.map(person => `<label class="check-item"><input type="checkbox" name="participants" value="${escape(person.id)}" ${!expense || expense.participants.includes(person.id) ? 'checked' : ''}> ${escape(person.name)}</label>`).join('')}</div><p class="field-note">Any extra cents are distributed in member order.</p></div><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button class="button button-dark">${expense ? 'Save changes' : 'Add expense'}</button></div></form>`);
  }
  function settlementForm() {
    const group = currentGroup();
    if (!group) return groupForm();
    const suggestion = SplitModel.debts(group)[0];
    if (!suggestion) return;
    openModal('Record a payment', 'ALMOST ALL SQUARE', `<form id="settlement-form" class="form-grid"><div class="form-row"><div class="field"><label for="from">Paid by</label><select name="from" id="from">${group.people.map(person => `<option value="${escape(person.id)}" ${person.id === suggestion.from ? 'selected' : ''}>${escape(person.name)}</option>`).join('')}</select></div><div class="field"><label for="to">Paid to</label><select name="to" id="to">${group.people.map(person => `<option value="${escape(person.id)}" ${person.id === suggestion.to ? 'selected' : ''}>${escape(person.name)}</option>`).join('')}</select></div></div><div class="form-row"><div class="field"><label for="settlement-amount">Amount (${escape(group.currency)})</label><input id="settlement-amount" name="amount" type="number" min="0.01" max="100000000" step="0.01" value="${(suggestion.amount / 100).toFixed(2)}" required></div><div class="field"><label for="settlement-date">Date</label><input id="settlement-date" name="date" type="date" value="${today()}" required></div></div><p class="field-note">This records a payment; it doesn't transfer money.</p><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button class="button button-dark">Record payment</button></div></form>`);
  }
  function parseNames(value) { return value.split(',').map(name => name.trim()).filter(Boolean); }
  function hasDuplicateNames(names) { return new Set(names.map(name => name.toLocaleLowerCase())).size !== names.length; }
  function error(form, message) { form.querySelector('.form-error').textContent = message; }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const group = currentGroup();
    if (action === 'new-group') groupForm();
    else if (action === 'select-group') { state.selected = button.dataset.id; save(); render(); }
    else if (action === 'add-expense') expenseForm();
    else if (action === 'edit-expense') expenseForm(button.dataset.id);
    else if (action === 'manage-group') manageGroup();
    else if (action === 'settle') settlementForm();
    else if (action === 'close-modal') closeModal();
    else if (action === 'retry-save') { const saved = save(); render(); if (saved) notify('Saved.'); }
    else if (action === 'delete-group' && group && confirm(`Delete ${group.name} and all its history?`)) { state.groups = state.groups.filter(item => item.id !== group.id); state.selected = state.groups[0]?.id || null; closeModal(); const saved = save(); render(); if (saved) notify('Group deleted.'); }
    else if ((action === 'delete-expense' || action === 'delete-settlement') && group && confirm(`Delete this ${action === 'delete-expense' ? 'expense' : 'payment'}?`)) { const key = action === 'delete-expense' ? 'expenses' : 'settlements'; group[key] = group[key].filter(item => item.id !== button.dataset.id); const saved = save(); render(); if (saved) notify('Entry deleted.'); }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!['group-form', 'people-form', 'expense-form', 'settlement-form'].includes(form.id)) return;
    event.preventDefault();
    const data = new FormData(form);
    const group = currentGroup();
    if (form.id === 'group-form') {
      const names = parseNames(data.get('people'));
      const name = data.get('name').trim();
      if (!name || !names.length) return error(form, 'Add a group name and at least one person.');
      if (hasDuplicateNames(names)) return error(form, 'Each person needs a unique name.');
      const newGroup = { id: id(), name, currency: data.get('currency'), people: names.map(person => ({ id: id(), name: person })), expenses: [], settlements: [] };
      state.groups.push(newGroup); state.selected = newGroup.id;
    } else if (form.id === 'people-form') {
      const names = parseNames(data.get('people'));
      if (!names.length || hasDuplicateNames([...group.people.map(person => person.name), ...names])) return error(form, 'Enter new, unique names.');
      group.people.push(...names.map(name => ({ id: id(), name })));
    } else {
      const amount = Math.round(Number(data.get('amount')) * 100);
      if (!Number.isSafeInteger(amount) || amount <= 0) return error(form, 'Enter a valid amount greater than zero.');
      if (form.id === 'expense-form') {
        const participants = data.getAll('participants');
        const description = data.get('description').trim();
        if (!description || !participants.length) return error(form, 'Add a description and select at least one person.');
        const expense = { id: form.dataset.id || id(), description, amount, paidBy: data.get('paidBy'), participants, date: data.get('date') };
        const index = group.expenses.findIndex(item => item.id === expense.id);
        if (index >= 0) group.expenses[index] = expense; else group.expenses.push(expense);
      } else {
        if (data.get('from') === data.get('to')) return error(form, 'Choose two different people.');
        group.settlements.push({ id: id(), from: data.get('from'), to: data.get('to'), amount, date: data.get('date') });
      }
    }
    closeModal(); const saved = save(); render(); if (saved) notify(form.id === 'settlement-form' ? 'Payment recorded.' : 'Saved.');
  });
  if (isNewData) save();
  render();
})();