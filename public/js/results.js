/* Renders an assessment result object into HTML (used by the assess page and history page) */
const STATUS_LABEL = {
  eligible: 'Applies', likely: 'Likely relevant', upcoming: 'Upcoming', possible: 'Possibly relevant',
  alert: 'Attention', info: 'For information', not_eligible: 'Not applicable',
};
const OUTLOOK_LABEL = { right: 'Bail as of right', statutory: 'Statutory right may apply', discretionary: 'Discretionary bail', restricted: 'Restricted bail' };

function renderTimeline(f) {
  const d = f.dates;
  if (!d) return '';
  if (d.periodDays) {
    const pct = Math.min(100, Math.round((d.elapsed / d.periodDays) * 100));
    return `<div class="timeline">
      <div class="bar ${pct >= 100 ? 'done' : ''}"><i style="width:${pct}%"></i></div>
      <div class="labels"><span>Remand: ${fmtDate(d.firstRemand)}</span><span>Day ${Math.min(d.elapsed, 9999)} of ${d.periodDays}</span><span>Period ends: ${fmtDate(d.periodEnds)}</span></div>
    </div>`;
  }
  if (d.thresholdDays) {
    const pct = Math.min(100, Math.round((d.served / d.thresholdDays) * 100));
    return `<div class="timeline">
      <div class="bar ${pct >= 100 ? 'done' : ''}"><i style="width:${pct}%"></i></div>
      <div class="labels"><span>Arrest: ${fmtDate(d.from)}</span><span>${d.served} of ~${d.thresholdDays} days</span><span>Eligible ≈ ${fmtDate(d.eligibleFrom)}</span></div>
    </div>`;
  }
  return '';
}

function renderFinding(f) {
  return `<article class="finding s-${esc(f.status)}">
    <div class="finding-head">
      <h3>${esc(f.title)}</h3>
      <span class="badge b-${esc(f.status)}">${esc(STATUS_LABEL[f.status] || f.status)}</span>
    </div>
    <p>${esc(f.explanation)}</p>
    ${renderTimeline(f)}
    ${f.reasons?.length ? `<div class="why"><strong>Why this was flagged</strong><ul>${f.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${f.nextSteps?.length ? `<div class="todo"><strong>What you can do</strong><ul>${f.nextSteps.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    <div class="prov-chips">${(f.provisions || []).map((p) => `<span class="prov-chip" title="${esc(p.title)}">${esc(p.label)}${p.oldSection && p.oldSection !== '—' ? ` <em>(old ${esc(p.oldSection)})</em>` : ''}</span>`).join('')}</div>
  </article>`;
}

function renderResult(r, opts = {}) {
  const s = r.summary;
  const active = r.findings.filter((f) => f.status !== 'not_eligible');
  const inactive = r.findings.filter((f) => f.status === 'not_eligible');
  return `
  <section class="summary o-${esc(s.outlook)}" aria-live="polite">
    <div class="kicker">Assessment summary · ${esc(OUTLOOK_LABEL[s.outlook] || '')} · ${fmtDate(r.assessedOn)}</div>
    <h2>${esc(s.headline)}</h2>
    <dl class="facts">
      <div><dt>Nature</dt><dd>${esc(s.nature)}</dd></div>
      <div><dt>Cognizance</dt><dd>${esc(s.cognizable)}</dd></div>
      <div><dt>Max punishment</dt><dd>${esc(s.maxPunishment)}</dd></div>
      <div><dt>Likely forum</dt><dd>${esc(s.forum)}</dd></div>
    </dl>
  </section>
  <p class="notice disclaimer">${esc(r.disclaimer)}</p>
  ${opts.savedNote ? `<p class="small muted no-print">${opts.savedNote}</p>` : ''}

  <div class="section-title"><h2>Offences assessed</h2></div>
  <div class="table-wrap card" style="padding:0">
    <table>
      <thead><tr><th>Section</th><th>Offence</th><th>Punishment</th><th>Classification</th><th>Triable by</th></tr></thead>
      <tbody>${r.offences.map((o) => `<tr>
        <td><strong>BNS ${esc(o.section)}</strong><br><span class="small muted">IPC ${esc(o.ipc)}</span></td>
        <td>${esc(o.title)}</td><td class="small">${esc(o.punishment)}</td>
        <td><span class="badge ${o.bailable ? 'b-bailable' : 'b-nonbailable'}">${o.bailable ? 'Bailable' : 'Non-bailable'}</span><br><span class="small muted">${o.cognizable ? 'Cognizable' : 'Non-cognizable'}</span></td>
        <td class="small">${esc(o.triableBy)}</td></tr>`).join('')}</tbody>
    </table>
  </div>

  <div class="section-title"><h2>Relevant provisions &amp; reasons</h2><span class="small muted">${active.length} finding(s)</span></div>
  ${active.map(renderFinding).join('') || '<p class="muted">No specific provisions were triggered.</p>'}
  ${inactive.length ? `<details class="card" style="margin-top:8px"><summary><strong>Checked but not applicable (${inactive.length})</strong></summary><div style="margin-top:12px">${inactive.map(renderFinding).join('')}</div></details>` : ''}

  <div class="grid-2" style="margin-top:28px">
    <section class="card list-card rights"><h2>Your legal rights</h2><ul>${r.rights.map((x) => `<li><strong>${esc(x.title)}</strong><span class="small muted">${esc(x.section)}</span><br>${esc(x.plain)}</li>`).join('')}</ul></section>
    <div>
      <section class="card list-card" style="margin-bottom:16px"><h2>Bail conditions to expect</h2><ul>${r.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>
      <section class="card list-card"><h2>Documents to keep ready</h2><ul class="checklist">${r.documents.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></section>
    </div>
  </div>

  <section class="card list-card" style="margin-top:16px"><h2>Next steps</h2><ol>${r.nextSteps.map((n) => `<li>${esc(n)}</li>`).join('')}</ol></section>
  <p class="small muted" style="margin-top:12px">Rules applied: ${r.rulesUsed.map((x) => `${esc(x.key)} v${x.version}`).join(', ')}</p>`;
}
