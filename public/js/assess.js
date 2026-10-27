/* Case Information Form -> POST /api/assess -> render results */
renderChrome('assess');

const form = document.getElementById('assess-form');
const panels = [...document.querySelectorAll('.step-panel')];
const stepItems = [...document.querySelectorAll('#steps li')];
const progressBar = document.querySelector('.progress');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const backBtn = document.getElementById('back-btn');
const nextBtn = document.getElementById('next-btn');
const submitBtn = document.getElementById('submit-btn');
const errorBox = document.getElementById('form-error');
const resultsEl = document.getElementById('results');

let offences = [];
const selected = new Set();
let step = 0;
let maxStep = 0; // furthest step reached so far

// ---------- Offence picker ----------
async function loadOffences() {
  try {
    offences = await API.get('/api/offences');
    renderOffenceList();
  } catch (e) {
    document.getElementById('offence-list').innerHTML = `<p class="empty">Could not load offences: ${esc(e.message)}</p>`;
  }
}

function renderOffenceList() {
  const q = document.getElementById('offence-search').value.trim().toLowerCase();
  const filter = document.getElementById('offence-filter').value;
  const list = offences.filter((o) => {
    if (filter === 'bailable' && !o.bailable) return false;
    if (filter === 'nonbailable' && o.bailable) return false;
    if (!q) return true;
    return [o.section, o.ipc, o.title, o.category].join(' ').toLowerCase().includes(q);
  });
  const groups = {};
  list.forEach((o) => { (groups[o.category || 'Other'] ||= []).push(o); });
  const html = Object.entries(groups).map(([cat, items]) => `
    <div class="offence-group"><h4>${esc(cat)}</h4>
      ${items.map((o) => `
        <label class="offence-item">
          <input type="checkbox" value="${esc(o.section)}" ${selected.has(o.section) ? 'checked' : ''}>
          <span><span class="sec">BNS ${esc(o.section)}</span> — ${esc(o.title)}
            <span class="meta">IPC ${esc(o.ipc)} · ${esc(o.punishment)}</span></span>
          <span class="badge ${o.bailable ? 'b-bailable' : 'b-nonbailable'}">${o.bailable ? 'Bailable' : 'Non-bailable'}</span>
        </label>`).join('')}
    </div>`).join('');
  document.getElementById('offence-list').innerHTML = html || '<p class="empty">No offences match your search.</p>';
}

function renderChips() {
  const chips = [...selected].map((s) => {
    const o = offences.find((x) => x.section === s);
    return `<span class="chip">BNS ${esc(s)}${o ? ` · ${esc(o.title.length > 28 ? o.title.slice(0, 26) + '…' : o.title)}` : ''}<button type="button" data-remove="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></span>`;
  });
  document.getElementById('selected-chips').innerHTML = chips.join('') || '<span class="small muted">No offences selected yet.</span>';
}

document.getElementById('offence-list').addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return;
  e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value);
  renderChips();
});
document.getElementById('selected-chips').addEventListener('click', (e) => {
  const s = e.target.dataset.remove;
  if (!s) return;
  selected.delete(s);
  renderChips();
  renderOffenceList();
});
document.getElementById('offence-search').addEventListener('input', renderOffenceList);
document.getElementById('offence-filter').addEventListener('change', renderOffenceList);

// ---------- Conditional fields ----------
function custodyStatus() { return form.querySelector('input[name=custodyStatus]:checked').value; }
function updateConditional() {
  const cs = custodyStatus();
  const stage = form.investigationStage.value;
  form.querySelectorAll('[data-show]').forEach((el) => el.classList.toggle('hidden', !el.dataset.show.split(' ').includes(cs)));
  form.querySelectorAll('[data-stage]').forEach((el) => el.classList.toggle('hidden', !el.dataset.stage.split(' ').includes(stage)));
  const arrested = cs !== 'not_arrested';
  document.getElementById('arrest-questions').classList.toggle('hidden', !arrested);
  document.getElementById('arrest-skip').classList.toggle('hidden', arrested);
}
form.addEventListener('change', (e) => { if (['custodyStatus', 'investigationStage'].includes(e.target.name)) updateConditional(); });

// ---------- Stepper ----------
function showError(msg) { errorBox.textContent = msg; errorBox.classList.toggle('hidden', !msg); }
function validateStep(i) {
  if (i === 0 && !selected.size) return 'Select at least one offence to continue.';
  if (i === 1) {
    const today = new Date().toISOString().slice(0, 10);
    for (const name of ['arrestDate', 'firstRemandDate', 'evidenceStartDate']) {
      const v = form[name].value;
      if (v && v > today) return 'Dates cannot be in the future.';
    }
    if (form.arrestDate.value && form.firstRemandDate.value && form.firstRemandDate.value < form.arrestDate.value) return 'The remand date cannot be before the arrest date.';
  }
  if (i === 2 && form.age.value && (form.age.value < 7 || form.age.value > 120)) return 'Enter a valid age.';
  return '';
}
/** Progress = share of steps completed (100% once results are shown). */
function setProgress(pct) {
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', String(pct));
  progressLabel.textContent = pct === 100 ? 'Assessment complete · 100%' : `Step ${step + 1} of ${panels.length} · ${pct}% complete`;
}

function goTo(i) {
  step = i;
  maxStep = Math.max(maxStep, i);
  panels.forEach((p, idx) => p.classList.toggle('active', idx === i));
  stepItems.forEach((li, idx) => {
    const btn = li.querySelector('button');
    li.classList.toggle('active', idx === i);
    li.classList.toggle('done', idx < maxStep && idx !== i);
    btn.disabled = idx > maxStep || idx === i; // only steps already reached are clickable
    if (idx === i) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
  });
  backBtn.disabled = i === 0;
  nextBtn.classList.toggle('hidden', i === panels.length - 1);
  submitBtn.classList.toggle('hidden', i !== panels.length - 1);
  showError('');
  setProgress(Math.round((i / panels.length) * 100));
  form.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}
nextBtn.addEventListener('click', () => {
  const err = validateStep(step);
  if (err) return showError(err);
  goTo(step + 1);
});
backBtn.addEventListener('click', () => goTo(step - 1));

// Clicking a reached step in the step bar. Jumping forward re-checks the steps in between.
document.getElementById('steps').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-goto]');
  if (!btn || btn.disabled) return;
  const target = Number(btn.dataset.goto);
  for (let i = step; i < target; i++) {
    const err = validateStep(i);
    if (err) { goTo(i); return showError(err); }
  }
  goTo(target);
});

// ---------- Submit ----------
function collect() {
  const fd = new FormData(form);
  const data = {
    offences: [...selected],
    custodyStatus: custodyStatus(),
    investigationStage: form.investigationStage.value,
    arrestDate: fd.get('arrestDate') || null,
    firstRemandDate: fd.get('firstRemandDate') || null,
    evidenceStartDate: fd.get('evidenceStartDate') || null,
    age: fd.get('age') || null,
    gender: fd.get('gender') || null,
    priorConviction: fd.get('priorConviction'),
    specialLaws: fd.getAll('specialLaws'),
    producedWithin24h: fd.get('producedWithin24h'),
    informedGrounds: fd.get('informedGrounds'),
    relativeInformed: fd.get('relativeInformed'),
  };
  ['apprehendsArrest', 'noticeReceived', 'defaultBailApplied', 'unableToFurnishBail', 'firstTimeOffender', 'sickOrInfirm', 'otherPendingCases', 'hasLawyer']
    .forEach((k) => { data[k] = form[k].checked; });
  // If the person was never convicted, there can be no prior convictions
  if (data.priorConviction !== 'none') data.firstTimeOffender = false;
  if (data.custodyStatus !== 'in_custody') data.investigationStage = 'investigation';
  return data;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  for (let i = 0; i < panels.length; i++) {
    const err = validateStep(i);
    if (err) { goTo(i); return showError(err); }
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Assessing…';
  try {
    const result = await API.post('/api/assess', collect());
    const savedNote = result.savedId
      ? 'Saved to <a href="/history">My assessments</a>.'
      : (API.auth.user ? '' : '<a href="/login?next=/assess">Log in</a> to save assessments to your history.');
    resultsEl.innerHTML = renderResult(result, { savedNote }) + `
      <div class="result-actions">
        <button type="button" class="btn btn-primary" id="print-btn">Print / Save as PDF</button>
        <button type="button" class="btn btn-ghost" id="edit-btn">Edit details</button>
        <button type="button" class="btn btn-ghost" id="new-btn">New assessment</button>
      </div>`;
    resultsEl.classList.remove('hidden');
    setProgress(100);
    resultsEl.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('print-btn').addEventListener('click', () => window.print());
    document.getElementById('edit-btn').addEventListener('click', () => { goTo(0); });
    document.getElementById('new-btn').addEventListener('click', () => {
      form.reset(); selected.clear(); renderChips(); renderOffenceList(); updateConditional();
      resultsEl.classList.add('hidden'); maxStep = 0; goTo(0);
    });
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get assessment';
  }
});

updateConditional();
renderChips();
loadOffences();
