renderChrome('library');

const TYPE_LABEL = { bail: 'Bail provision', right: 'Right', condition: 'Condition', special: 'Special law' };
let provisions = [];

function render() {
  const q = document.getElementById('lib-search').value.trim().toLowerCase();
  const t = document.getElementById('lib-type').value;
  const list = provisions.filter((p) => (!t || p.type === t) &&
    (!q || [p.act, p.section, p.oldSection, p.title, p.summary, p.plain].join(' ').toLowerCase().includes(q)));
  document.getElementById('lib-list').innerHTML = list.map((p) => `
    <div class="lib-item">
      <div class="finding-head"><h3>${esc(p.title)}</h3><span class="badge b-info">${esc(TYPE_LABEL[p.type] || p.type)}</span></div>
      <p class="small"><strong>${esc(p.act)} s.${esc(p.section)}</strong>${p.oldSection && p.oldSection !== '—' ? ` <span class="muted">· earlier ${esc(p.oldSection)}</span>` : ''}</p>
      <p>${esc(p.summary)}</p>
      <p class="muted small"><strong>In simple words:</strong> ${esc(p.plain)}</p>
    </div>`).join('') || '<p class="empty">No provisions match.</p>';
}

API.get('/api/provisions').then((data) => { provisions = data; render(); })
  .catch((e) => { document.getElementById('lib-list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; });
document.getElementById('lib-search').addEventListener('input', render);
document.getElementById('lib-type').addEventListener('change', render);
