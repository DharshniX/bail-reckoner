// The section comes from the URL: /admin -> dashboard, /admin/rules -> rules, ...
const SECTION = location.pathname.split('/')[2] || 'dashboard';
renderChrome(SECTION);

const msgEl = document.getElementById('admin-msg');
function flash(text, type = 'success') {
  msgEl.textContent = text;
  msgEl.className = `alert-box ${type}`;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => msgEl.classList.add('hidden'), 4000);
}
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) flash(okMsg); } catch (e) { flash(e.message, 'error'); }
}

// ---------- Dashboard ----------
const statCards = (items) => items.map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
const topOffencesTable = (list) => (list.length ? `<table>
    <thead><tr><th>Section</th><th>Offence</th><th>Assessments</th></tr></thead>
    <tbody>${list.map((o) => `<tr><td><strong>BNS ${esc(o.section)}</strong></td><td>${esc(o.title)}</td><td>${esc(o.count)}</td></tr>`).join('')}</tbody>
  </table>` : '<p class="empty">No saved assessments yet.</p>');

async function loadDashboard() {
  const [s, ruleList] = await Promise.all([API.get('/api/admin/stats'), API.get('/api/admin/rules')]);
  document.getElementById('stats').innerHTML = statCards([
    ['Offences', s.offences], ['Provisions', s.provisions], ['Rules', s.rules], ['Pending changes', s.pending],
    ['Users', s.users], ['Assessments today', s.assessmentsToday], ['Assessments run', s.assessments],
  ]);
  document.getElementById('dash-top-offences').innerHTML = topOffencesTable(s.topOffences);
  const pending = ruleList.filter((r) => r.pending);
  document.getElementById('dash-pending').innerHTML = pending.length
    ? `<ul>${pending.map((r) => `<li><a href="/admin/rules">${esc(r.name)}</a> <span class="small muted">— proposed by ${esc(r.pending.proposedBy)} on ${fmtDate(r.pending.proposedAt)}</span></li>`).join('')}</ul>`
    : '<p class="empty">No changes waiting for verification.</p>';
}

// ---------- Rules ----------
let rules = [];
async function loadRules() {
  rules = await API.get('/api/admin/rules');
  document.getElementById('rules-panel').innerHTML = rules.map((r) => `
    <div class="rule-card ${r.pending ? 'has-pending' : ''}" data-key="${esc(r.key)}">
      <div class="rule-head">
        <div>
          <h3>${esc(r.name)}</h3>
          <div class="small muted">${esc(r.key)} · v${r.version} · ${r.enabled ? 'Enabled' : 'Disabled'}${r.verifiedBy ? ` · last verified by ${esc(r.verifiedBy)} on ${fmtDate(r.verifiedAt)}` : ''}</div>
        </div>
        <span class="badge ${r.enabled ? 'b-eligible' : 'b-info'}">${r.enabled ? 'Live' : 'Off'}</span>
      </div>
      <p style="margin-top:8px">${esc(r.description)}</p>
      <p class="small"><strong>Provisions:</strong> ${r.provisionCodes.map(esc).join(', ')}</p>
      <details>
        <summary class="small"><strong>Propose a change</strong></summary>
        <div style="margin-top:10px">
          <div class="field"><label>Parameters (JSON)</label><textarea data-f="params">${esc(JSON.stringify(r.params, null, 2))}</textarea></div>
          <div class="field"><label>Description</label><input type="text" data-f="description" value="${esc(r.description)}"></div>
          <label class="check"><input type="checkbox" data-f="enabled" ${r.enabled ? 'checked' : ''}> Rule enabled</label>
          <div class="field"><label>Reason for change<span class="hint">e.g. amendment, court ruling</span></label><input type="text" data-f="note"></div>
          <button type="button" class="btn btn-primary btn-sm" data-act="propose">Save as pending</button>
        </div>
      </details>
      ${r.pending ? `
        <div class="pending-box">
          <strong>Pending change</strong> proposed by ${esc(r.pending.proposedBy)} on ${fmtDate(r.pending.proposedAt)}${r.pending.note ? ` — “${esc(r.pending.note)}”` : ''}
          <div class="grid-2"><div><span class="small muted">Current params</span><pre>${esc(JSON.stringify(r.params, null, 2))}</pre></div>
          <div><span class="small muted">Proposed params</span><pre>${esc(JSON.stringify(r.pending.params, null, 2))}</pre></div></div>
          ${r.pending.enabled !== r.enabled ? `<p class="small">Enabled: ${r.enabled} → <strong>${r.pending.enabled}</strong></p>` : ''}
          <div class="row-actions"><button type="button" class="btn btn-accent btn-sm" data-act="verify">Verify &amp; publish</button><button type="button" class="btn btn-ghost btn-sm" data-act="discard">Discard</button></div>
        </div>` : ''}
    </div>`).join('');
}

document.getElementById('rules-panel').addEventListener('click', (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  const card = e.target.closest('.rule-card');
  const key = card.dataset.key;
  if (act === 'propose') {
    let params;
    try { params = JSON.parse(card.querySelector('[data-f=params]').value); } catch { return flash('Parameters must be valid JSON.', 'error'); }
    run(async () => {
      await API.put(`/api/admin/rules/${key}`, {
        params,
        description: card.querySelector('[data-f=description]').value,
        enabled: card.querySelector('[data-f=enabled]').checked,
        note: card.querySelector('[data-f=note]').value,
      });
      await loadRules();
    }, 'Change saved as pending. Verify it to publish.');
  }
  if (act === 'verify') run(async () => { await API.post(`/api/admin/rules/${key}/verify`); await loadRules(); }, 'Rule verified and published.');
  if (act === 'discard') run(async () => { await API.post(`/api/admin/rules/${key}/discard`); await loadRules(); }, 'Pending change discarded.');
});

// ---------- Offences ----------
let offenceRows = [];
const oForm = document.getElementById('offence-form');
async function loadOffences() {
  offenceRows = await API.get('/api/admin/offences');
  document.getElementById('offence-table').innerHTML = `<table>
    <thead><tr><th>Section</th><th>Title</th><th>Max</th><th>Class</th><th>Triable by</th><th></th></tr></thead>
    <tbody>${offenceRows.map((o) => `<tr>
      <td><strong>${esc(o.section)}</strong><br><span class="small muted">IPC ${esc(o.ipc)}</span></td>
      <td>${esc(o.title)}${o.active ? '' : ' <span class="badge b-info">inactive</span>'}</td>
      <td class="small">${o.death ? 'Death' : o.maxLife ? 'Life' : o.maxYears != null ? `${+(+o.maxYears).toFixed(2)} yrs` : '—'}</td>
      <td><span class="badge ${o.bailable ? 'b-bailable' : 'b-nonbailable'}">${o.bailable ? 'B' : 'NB'}</span> <span class="small muted">${o.cognizable ? 'Cog.' : 'Non-cog.'}</span></td>
      <td class="small">${esc(o.triableBy)}</td>
      <td><div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-edit="${o._id}">Edit</button><button type="button" class="btn btn-danger btn-sm" data-del="${o._id}">Delete</button></div></td>
    </tr>`).join('')}</tbody></table>`;
}
function fillForm(form, data) {
  [...form.elements].forEach((el) => {
    if (!el.name) return;
    const v = data[el.name];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  });
}
function readForm(form) {
  const out = {};
  [...form.elements].forEach((el) => {
    if (!el.name) return;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value.trim();
  });
  return out;
}
document.getElementById('offence-add').addEventListener('click', () => {
  fillForm(oForm, { active: true, triableBy: 'Any Magistrate' });
  document.getElementById('offence-form-title').textContent = 'Add offence';
  oForm.classList.remove('hidden'); oForm.scrollIntoView({ behavior: 'smooth' });
});
document.getElementById('offence-cancel').addEventListener('click', () => oForm.classList.add('hidden'));
document.getElementById('offence-table').addEventListener('click', (e) => {
  const { edit, del } = e.target.dataset;
  if (edit) {
    fillForm(oForm, offenceRows.find((o) => o._id === edit));
    document.getElementById('offence-form-title').textContent = 'Edit offence';
    oForm.classList.remove('hidden'); oForm.scrollIntoView({ behavior: 'smooth' });
  }
  if (del && confirm('Delete this offence? Existing saved assessments are not affected.')) {
    run(async () => { await API.del(`/api/admin/offences/${del}`); await loadOffences(); }, 'Offence deleted.');
  }
});
oForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = readForm(oForm);
  const id = data._id; delete data._id;
  if (!data.section || !data.title) return flash('Section and title are required.', 'error');
  run(async () => {
    if (id) await API.put(`/api/admin/offences/${id}`, data); else await API.post('/api/admin/offences', data);
    oForm.classList.add('hidden');
    await loadOffences();
  }, 'Offence saved.');
});

// ---------- Provisions ----------
let provisionRows = [];
const pForm = document.getElementById('provision-form');
async function loadProvisions() {
  provisionRows = await API.get('/api/admin/provisions');
  document.getElementById('provision-list').innerHTML = provisionRows.map((p) => `
    <div class="lib-item">
      <div class="finding-head"><h3>${esc(p.title)}</h3><button type="button" class="btn btn-ghost btn-sm" data-edit="${p._id}">Edit</button></div>
      <p class="small"><strong>${esc(p.code)}</strong> · ${esc(p.act)} s.${esc(p.section)} · <span class="muted">${esc(p.type)}</span></p>
      <p class="small muted">${esc(p.summary)}</p>
    </div>`).join('');
}
document.getElementById('provision-add').addEventListener('click', () => {
  fillForm(pForm, { type: 'bail', act: 'BNSS, 2023' });
  pForm.code.readOnly = false;
  document.getElementById('provision-form-title').textContent = 'Add provision';
  pForm.classList.remove('hidden'); pForm.scrollIntoView({ behavior: 'smooth' });
});
document.getElementById('provision-cancel').addEventListener('click', () => pForm.classList.add('hidden'));
document.getElementById('provision-list').addEventListener('click', (e) => {
  const id = e.target.dataset.edit;
  if (!id) return;
  fillForm(pForm, provisionRows.find((p) => p._id === id));
  pForm.code.readOnly = true;
  document.getElementById('provision-form-title').textContent = 'Edit provision';
  pForm.classList.remove('hidden'); pForm.scrollIntoView({ behavior: 'smooth' });
});
pForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = readForm(pForm);
  const id = data._id; delete data._id;
  if (!data.code || !data.title) return flash('Code and title are required.', 'error');
  run(async () => {
    if (id) await API.put(`/api/admin/provisions/${id}`, data); else await API.post('/api/admin/provisions', data);
    pForm.classList.add('hidden');
    await loadProvisions();
  }, 'Provision saved.');
});

// ---------- Change log ----------
async function loadLog() {
  const rows = await API.get('/api/admin/changelog');
  document.getElementById('log-table').innerHTML = rows.length ? `<table>
    <thead><tr><th>When</th><th>Type</th><th>Action</th><th>Details</th><th>By</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="small">${new Date(r.createdAt).toLocaleString('en-IN')}</td><td>${esc(r.entity)}</td><td><span class="badge b-info">${esc(r.action)}</span></td><td>${esc(r.summary)}</td><td class="small">${esc(r.by)}</td></tr>`).join('')}</tbody>
  </table>` : '<p class="empty">No changes recorded yet.</p>';
}

// ---------- Users ----------
let userRows = [];
const createForm = document.getElementById('admin-create-form');
const resetForm = document.getElementById('reset-form');

function statusBadge(u) {
  if (!u.active) return '<span class="badge b-nonbailable">Deactivated</span>';
  if (u.locked) return '<span class="badge b-upcoming">Locked</span>';
  return '<span class="badge b-eligible">Active</span>';
}

async function loadUserStats() {
  const s = await API.get('/api/admin/stats');
  document.getElementById('user-stats').innerHTML = statCards([
    ['Total users', s.users], ['Admins', s.admins], ['Assessments today', s.assessmentsToday], ['Assessments run', s.assessments],
  ]);
  document.getElementById('users-top-offences').innerHTML = topOffencesTable(s.topOffences);
}

async function loadUsers() {
  const q = document.getElementById('user-search').value.trim();
  userRows = await API.get(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const me = API.auth.user?.id;
  document.getElementById('user-table').innerHTML = userRows.length ? `<table>
    <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Assessments</th><th>Last login</th><th>Joined</th><th></th></tr></thead>
    <tbody>${userRows.map((u) => `<tr>
      <td><strong>${esc(u.name)}</strong>${u.id === me ? ' <span class="small muted">(you)</span>' : ''}<br><span class="small muted">${esc(u.email)}</span></td>
      <td><span class="badge ${u.role === 'admin' ? 'b-statutory' : 'b-info'}">${esc(u.role)}</span></td>
      <td>${statusBadge(u)}</td>
      <td>${esc(u.assessments)}</td>
      <td class="small">${u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</td>
      <td class="small">${fmtDate(u.createdAt)}</td>
      <td><div class="row-actions">
        ${u.id === me ? '' : `<button type="button" class="btn ${u.active ? 'btn-danger' : 'btn-ghost'} btn-sm" data-toggle="${esc(u.id)}">${u.active ? 'Deactivate' : 'Reactivate'}</button>`}
        <button type="button" class="btn btn-ghost btn-sm" data-reset="${esc(u.id)}">Reset password</button>
      </div></td>
    </tr>`).join('')}</tbody></table>` : '<p class="empty">No users match.</p>';
}

// Search as you type (waits until typing pauses)
document.getElementById('user-search').addEventListener('input', () => {
  clearTimeout(loadUsers.t);
  loadUsers.t = setTimeout(() => loadUsers().catch((e) => flash(e.message, 'error')), 250);
});

document.getElementById('user-table').addEventListener('click', (e) => {
  const { toggle, reset } = e.target.dataset;
  const u = userRows.find((x) => x.id === (toggle || reset));
  if (!u) return;
  if (toggle) {
    const verb = u.active ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${verb} ${u.email}?${u.active ? ' They will be logged out and cannot log in until reactivated.' : ''}`)) return;
    run(async () => {
      await API.patch(`/api/admin/users/${u.id}/status`, { active: !u.active });
      await loadUsers();
    }, `${u.email} ${u.active ? 'deactivated' : 'reactivated'}.`);
  }
  if (reset) {
    resetForm.reset();
    resetForm.elements.id.value = u.id;
    document.getElementById('reset-title').textContent = `Reset password for ${u.email}`;
    createForm.classList.add('hidden');
    resetForm.classList.remove('hidden'); resetForm.scrollIntoView({ behavior: 'smooth' });
  }
});

resetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = resetForm.elements.id.value;
  const password = document.getElementById('rp-pass').value;
  if (password.length < 8 || !/\d/.test(password)) return flash('Password must be at least 8 characters and include a number.', 'error');
  run(async () => {
    await API.post(`/api/admin/users/${id}/reset-password`, { password });
    resetForm.classList.add('hidden');
    await loadUsers();
  }, 'Password reset. The user\'s existing sessions have been ended.');
});
document.getElementById('reset-cancel').addEventListener('click', () => resetForm.classList.add('hidden'));

document.getElementById('admin-create').addEventListener('click', () => {
  createForm.reset();
  resetForm.classList.add('hidden');
  createForm.classList.remove('hidden'); createForm.scrollIntoView({ behavior: 'smooth' });
});
document.getElementById('admin-create-cancel').addEventListener('click', () => createForm.classList.add('hidden'));
createForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(createForm));
  if (!data.name || !data.email || !data.password) return flash('Name, email and password are required.', 'error');
  if (data.password.length < 8 || !/\d/.test(data.password)) return flash('Password must be at least 8 characters and include a number.', 'error');
  run(async () => {
    await API.post('/api/admin/users', data);
    createForm.classList.add('hidden');
    await Promise.all([loadUsers(), loadUserStats()]);
  }, `Admin account created for ${data.email}.`);
});

// ---------- Start ----------
const loaders = {
  dashboard: loadDashboard,
  rules: loadRules,
  offences: loadOffences,
  provisions: loadProvisions,
  users: () => Promise.all([loadUserStats(), loadUsers()]),
  changelog: loadLog,
};
// Only admins get past this point; everyone else is sent to /admin/login
if (API.requireLogin() && loaders[SECTION]) {
  document.querySelector(`[data-panel="${SECTION}"]`).classList.remove('hidden');
  loaders[SECTION]().catch((e) => flash(e.message, 'error'));
}
