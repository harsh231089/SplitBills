(function () {
  const STORAGE_KEY = 'tabby-local-v1';
  const cloud = window.supabase?.createClient('https://dfcdekpaaijqsagbqweu.supabase.co', 'sb_publishable_NPpBDQwHpKXvl1FvGd8-Lw_pQ7UiPTb');
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

  let state = { selected: null, groups: [] };
  let legacyData = null;
  let session = null;
  let cloudReady = false;
  let cloudLoadFailed = false;
  let busy = false;
  let cloudError = '';
  let savedGroups = new Map();
  let storageWriteFailed = false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.groups)) legacyData = parsed;
    }
  } catch (error) {
    console.error('Could not read the local backup:', error);
  }
  let toastTimer;
  const modal = document.getElementById('modal');
  const content = document.getElementById('content');
  const currentGroup = () => state.groups.find(group => group.id === state.selected);
  const personName = (group, personId) => group.people.find(person => person.id === personId)?.name || 'Unknown';
  const avatar = (person, group) => `<span class="avatar" style="background:${colors[group.people.findIndex(item => item.id === person.id) % colors.length]}" title="${escape(person.name)}">${escape(initials(person.name))}</span>`;

  async function save() {
    if (!session || busy) return false;
    busy = true;
    render();
    try {
      for (const [groupId, previous] of savedGroups) {
        if (state.groups.some(group => group.id === groupId)) continue;
        const { data, error } = await cloud.from('bill_groups').delete().eq('id', groupId).eq('version', previous.version).select('id');
        if (error) throw error;
        if (!data.length) throw new Error('This group changed or you cannot delete it.');
        savedGroups.delete(groupId);
      }
      for (const group of state.groups) {
        const serialized = JSON.stringify(group);
        const previous = savedGroups.get(group.id);
        if (!previous) {
          const { data, error } = await cloud.from('bill_groups').insert({ id: group.id, owner_id: session.user.id, data: group }).select('version, owner_id').single();
          if (error) throw error;
          savedGroups.set(group.id, { serialized, version: data.version, owner: data.owner_id });
        } else if (previous.serialized !== serialized) {
          const { data, error } = await cloud.rpc('save_bill_group', { group_key: group.id, group_data: group, expected_version: previous.version });
          if (error) throw error;
          savedGroups.set(group.id, { serialized, version: data, owner: previous.owner });
        }
      }
      storageWriteFailed = false;
      cloudError = '';
      return true;
    } catch (error) {
      storageWriteFailed = true;
      cloudError = error.message || 'Could not save your changes.';
      return false;
    } finally {
      busy = false;
    }
  }
  async function loadCloud() {
    busy = true;
    render();
    const { data, error } = await cloud.from('bill_groups').select('id, data, version, owner_id').order('created_at');
    busy = false;
    cloudReady = true;
    if (error) {
      cloudLoadFailed = true;
      cloudError = error.message;
      storageWriteFailed = true;
    } else {
      const selected = state.selected;
      state = { selected, groups: data.map(row => row.data) };
      savedGroups = new Map(data.map(row => [row.id, { serialized: JSON.stringify(row.data), version: row.version, owner: row.owner_id }]));
      cloudError = '';
      cloudLoadFailed = false;
      storageWriteFailed = false;
    }
    render();
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
    storageWarning.hidden = !storageWriteFailed;
    storageWarning.innerHTML = storageWriteFailed ? `${escape(cloudError)} ${cloudLoadFailed ? 'Your cloud data could not be loaded.' : 'Your changes are not saved. Export a copy before refreshing if needed.'} ${cloudLoadFailed ? '' : '<button class="text-button" data-action="retry-save">Retry saving</button><button class="text-button" data-action="export-draft">Export draft</button>'} <button class="text-button" data-action="refresh">Refresh</button>` : '';
    document.querySelector('.local-pill').innerHTML = `<span></span>${storageWriteFailed ? 'Not saved' : busy ? 'Syncing' : session ? 'Saved to cloud' : 'Signed out'}`;
    document.querySelectorAll('[data-action="refresh"], [data-action="sign-out"]').forEach(button => { button.hidden = !session; button.disabled = busy; });
    document.querySelector('.top-add').hidden = !session;
    document.querySelectorAll('[data-action="new-group"], .top-add').forEach(button => { button.disabled = !session || busy || storageWriteFailed; });
    if (!cloudReady || !session) {
      document.getElementById('breadcrumb-group').textContent = 'Overview';
      document.getElementById('group-nav').innerHTML = '';
      if (!cloudReady) content.innerHTML = '<div class="empty-main"><h1>Connecting...</h1></div>';
      else if (!cloud) content.innerHTML = '<div class="empty-main"><h1>Unable to connect</h1><p>The sign-in service could not be loaded. Check your connection and reload.</p></div>';
      else content.innerHTML = `<div class="auth-view"><div class="eyebrow">YOUR SHARED SPACE</div><h1>Sign in to Tabby</h1><form id="auth-form" class="form-grid"><div class="field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="current-password" minlength="6" required></div><p class="form-error" role="alert"></p><div class="auth-actions"><button class="button button-dark" name="auth-action" value="signin">Sign in</button><button class="button button-outline" name="auth-action" value="signup">Create account</button></div></form></div>`;
      return;
    }
    if (cloudLoadFailed) { content.innerHTML = '<div class="empty-main"><h1>Unable to load your groups</h1><p>Try refreshing when your connection is available.</p></div>'; return; }
    if (!currentGroup() && state.groups.length) state.selected = state.groups[0].id;
    const group = currentGroup();
    document.getElementById('breadcrumb-group').textContent = group ? group.name : 'Overview';
    document.getElementById('group-nav').innerHTML = state.groups.map((item, index) => `<button class="group-link ${item.id === state.selected ? 'selected' : ''}" data-action="select-group" data-id="${escape(item.id)}"><span class="group-icon" style="background:${colors[index % colors.length]}">${escape(initials(item.name))}</span><span>${escape(item.name)}</span></button>`).join('');
    if (!group) {
      content.innerHTML = `<div class="empty-main"><div class="eyebrow">A LITTLE LESS MATH, A LOT MORE LIFE</div><h1>Make room for good times.</h1><p>Create a group to start sharing expenses.</p><button class="button button-dark" data-action="new-group" ${busy || storageWriteFailed ? 'disabled' : ''}>${icon('plus')} Create a group</button>${legacyData?.groups.length ? '<button class="button button-outline import-button" data-action="import-local">Import local groups</button>' : ''}</div>`;
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
    content.innerHTML = `<div class="page-heading"><div><div class="eyebrow">YOUR SHARED SPACE</div><h1>Good to see you.</h1><p>Here's where things stand with your group.</p></div><div class="heading-actions">${legacyData?.groups.length ? '<button class="button button-outline" data-action="import-local">Import local groups</button>' : ''}<button class="button button-outline" data-action="manage-group">${icon('users')} Manage group</button><button class="button button-outline" data-action="new-group">${icon('plus')} New group</button></div></div>
      <section class="group-hero"><div class="hero-copy"><div class="hero-kicker">GROUP OVERVIEW</div><h2>${escape(group.name)}</h2><p>Shared moments, sorted expenses.</p></div><div class="hero-art" aria-hidden="true"><span>✳</span></div><div class="hero-side"><div class="avatar-stack">${group.people.slice(0, 5).map(person => avatar(person, group)).join('')}</div><span class="people-count">${group.people.length} ${group.people.length === 1 ? 'person' : 'people'} in this group</span></div></section>
      <section class="stats" aria-label="Group summary"><div class="stat"><div class="stat-top">Total expenses <span class="stat-icon">${icon('receipt')}</span></div><div class="stat-value">${money(total, group)}</div><div class="stat-caption">across ${group.expenses.length} ${group.expenses.length === 1 ? 'expense' : 'expenses'}</div></div><div class="stat"><div class="stat-top">Outstanding <span class="stat-icon coral">${icon('wallet')}</span></div><div class="stat-value">${money(outstanding, group)}</div><div class="stat-caption">left to settle</div></div><div class="stat"><div class="stat-top">Group members <span class="stat-icon yellow">${icon('users')}</span></div><div class="stat-value">${String(group.people.length).padStart(2, '0')}</div><div class="stat-caption">sharing together</div></div></section>
      <div class="dashboard-grid"><section><div class="section-title"><div><h2>Activity history</h2><p>The little things add up.</p></div><button class="text-button" data-action="add-expense">Add expense ${icon('plus')}</button></div><div class="panel">${rows || '<div class="empty"><strong>Nothing here yet</strong>Add an expense to get things started.</div>'}${activity.length ? `<div class="panel-footer">${activity.length} ${activity.length === 1 ? 'entry' : 'entries'} in this group</div>` : ''}</div></section>
      <div><section><div class="section-title"><div><h2>Group balances</h2><p>Who's up, who's down.</p></div></div><div class="panel balance-panel">${balanceRows}</div></section><section class="settle-section"><div class="section-title"><div><h2>Time to settle?</h2><p>Keep things nice and simple.</p></div></div><div class="settle-card"><div class="settle-icon">${icon('check')}</div><div class="settle-copy"><strong>${suggestion ? `${escape(personName(group, suggestion.from))} owes ${escape(personName(group, suggestion.to))}` : 'Everyone is all settled up'}</strong><p>${suggestion ? `${money(suggestion.amount, group)} suggested payment` : 'No outstanding balances right now.'}</p></div>${suggestion ? '<button class="button" data-action="settle">Record payment</button>' : ''}</div></section></div></div>`;
    if (busy || storageWriteFailed) content.querySelectorAll('button').forEach(button => { button.disabled = true; });
  }

  function groupForm() {
    openModal('Create a group', 'GOOD TIMES START HERE', `<form id="group-form" class="form-grid"><div class="field"><label for="group-name">Group name</label><input id="group-name" name="name" placeholder="e.g. Weekend getaway" maxlength="60" required autofocus></div><div class="field"><label for="group-people">People</label><input id="group-people" name="people" placeholder="e.g. Alex, Sam, Jordan" required><p class="field-note">Separate names with commas. Include yourself, too.</p></div><div class="field"><label for="group-currency">Currency</label><select id="group-currency" name="currency"><option value="USD">USD - US Dollar</option><option value="EUR">EUR - Euro</option><option value="GBP">GBP - British Pound</option><option value="INR">INR - Indian Rupee</option><option value="CAD">CAD - Canadian Dollar</option><option value="AUD">AUD - Australian Dollar</option></select></div><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button class="button button-dark">Create group</button></div></form>`);
  }
  async function manageGroup() {
    const group = currentGroup();
    if (!group) return groupForm();
    const owner = savedGroups.get(group.id)?.owner === session.user.id;
    const { data: members, error: memberError } = await cloud.from('bill_group_members').select('email').eq('group_id', group.id).order('email');
    if (memberError) return notify('Could not load group access.');
    if (currentGroup()?.id !== group.id) return;
    const access = members.map(member => `<div class="access-row"><span>${escape(member.email)}</span>${owner ? `<button class="icon-button" data-action="revoke-access" data-email="${escape(member.email)}" title="Remove access" aria-label="Remove access for ${escape(member.email)}">${icon('trash')}</button>` : ''}</div>`).join('');
    openModal('Manage group', 'YOUR PEOPLE', `<form id="people-form" class="form-grid"><div class="field"><label>Expense participants</label><div class="check-list">${group.people.map(person => `<span class="check-item">${escape(person.name)}</span>`).join('')}</div></div><div class="field"><label for="new-people">Add people</label><input id="new-people" name="people" placeholder="Names, separated by commas" required><p class="field-note">New people won't be added to past expenses.</p></div><p class="form-error" role="alert"></p><div class="modal-actions"><button class="button button-dark">Add people</button></div></form><div class="group-settings"><span class="field-label">People with access</span>${access || '<p class="field-note">Only the group owner has access.</p>'}${owner ? `<form id="invite-form" class="form-grid"><div class="field"><label for="invite-email">Share with email</label><input id="invite-email" name="email" type="email" required><p class="field-note">The member must create an account with this email. No invitation email is sent.</p></div><p class="form-error" role="alert"></p><button class="button button-outline">Grant access</button></form><div class="group-settings"><button class="text-button danger-link" data-action="delete-group">${icon('trash')} Delete group</button></div>` : ''}</div>`);
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

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const group = currentGroup();
    if (busy) return;
    if (storageWriteFailed && !['retry-save', 'refresh', 'export-draft', 'sign-out'].includes(action)) return;
    if (action === 'new-group') groupForm();
    else if (action === 'select-group') { state.selected = button.dataset.id; render(); }
    else if (action === 'add-expense') expenseForm();
    else if (action === 'edit-expense') expenseForm(button.dataset.id);
    else if (action === 'manage-group') await manageGroup();
    else if (action === 'settle') settlementForm();
    else if (action === 'close-modal') closeModal();
    else if (action === 'retry-save') { const saved = await save(); render(); if (saved) notify('Saved.'); }
    else if (action === 'refresh') { if (storageWriteFailed && !cloudLoadFailed && !confirm('Unsaved changes will be lost. Export a draft first if needed. Refresh anyway?')) return; closeModal(); await loadCloud(); }
    else if (action === 'sign-out') { if (storageWriteFailed && !cloudLoadFailed && !confirm('Unsaved changes will be lost. Export a draft first if needed. Sign out anyway?')) return; const { error: signOutError } = await cloud.auth.signOut(); if (signOutError) return notify('Could not sign out.'); session = null; state = { selected: null, groups: [] }; savedGroups.clear(); storageWriteFailed = false; closeModal(); render(); }
    else if (action === 'export-draft') { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); link.download = 'tabby-unsaved-draft.json'; link.click(); URL.revokeObjectURL(link.href); }
    else if (action === 'import-local' && legacyData?.groups.length && confirm('Import the groups stored in this browser? Importing again creates duplicates.')) { const imported = legacyData.groups.map(item => ({ ...structuredClone(item), id: id() })); state.groups.push(...imported); state.selected = imported[0].id; const saved = await save(); if (saved) { legacyData = null; notify('Local groups imported.'); } render(); }
    else if (action === 'revoke-access' && group && confirm(`Remove access for ${button.dataset.email}?`)) { const { error: revokeError } = await cloud.from('bill_group_members').delete().eq('group_id', group.id).eq('email', button.dataset.email); if (revokeError) notify('Could not remove access.'); else { notify('Access removed.'); await manageGroup(); } }
    else if (action === 'delete-group' && group && confirm(`Delete ${group.name} and all its history?`)) { state.groups = state.groups.filter(item => item.id !== group.id); state.selected = state.groups[0]?.id || null; closeModal(); const saved = await save(); render(); if (saved) notify('Group deleted.'); }
    else if ((action === 'delete-expense' || action === 'delete-settlement') && group && confirm(`Delete this ${action === 'delete-expense' ? 'expense' : 'payment'}?`)) { const key = action === 'delete-expense' ? 'expenses' : 'settlements'; group[key] = group[key].filter(item => item.id !== button.dataset.id); const saved = await save(); render(); if (saved) notify('Entry deleted.'); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!['auth-form', 'invite-form', 'group-form', 'people-form', 'expense-form', 'settlement-form'].includes(form.id)) return;
    event.preventDefault();
    if (busy || (storageWriteFailed && form.id !== 'auth-form')) return;
    const data = new FormData(form);
    const group = currentGroup();
    if (form.id === 'auth-form') {
      const email = String(data.get('email')).trim();
      const password = String(data.get('password'));
      form.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try {
        const result = event.submitter?.value === 'signup'
          ? await cloud.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
          : await cloud.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (!result.data.session) { error(form, 'Check your email to confirm your account, then sign in.'); return; }
        session = result.data.session;
        await loadCloud();
      } catch (authError) { error(form, authError.message || 'Sign-in failed.'); }
      finally { form.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
      return;
    }
    if (form.id === 'invite-form') {
      const email = String(data.get('email')).trim().toLowerCase();
      const { error: inviteError } = await cloud.from('bill_group_members').insert({ group_id: group.id, email });
      if (inviteError) return error(form, inviteError.message);
      notify('Access granted.');
      await manageGroup();
      return;
    }
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
    closeModal(); const saved = await save(); render(); if (saved) notify(form.id === 'settlement-form' ? 'Payment recorded.' : 'Saved.');
  });
  window.addEventListener('beforeunload', event => { if (storageWriteFailed && !cloudLoadFailed) { event.preventDefault(); event.returnValue = ''; } });
  async function initialize() {
    if (cloud) {
      const { data, error: sessionError } = await cloud.auth.getSession();
      session = data?.session || null;
      if (sessionError) console.error('Could not restore the session:', sessionError);
      cloud.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { session = null; state = { selected: null, groups: [] }; savedGroups.clear(); storageWriteFailed = false; closeModal(); render(); } });
    }
    cloudReady = true;
    if (session) await loadCloud(); else render();
  }
  render();
  initialize();
})();