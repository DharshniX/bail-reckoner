renderChrome('history');

const listEl = document.getElementById('history-list');
const listView = document.getElementById('list-view');
const detailView = document.getElementById('detail-view');

async function loadList() {
  try {
    const items = await API.get('/api/assessments');
    if (!items.length) {
      listEl.innerHTML = '<div class="empty card">No saved assessments yet. <a href="/assess">Run your first assessment</a>.</div>';
      return;
    }
    listEl.innerHTML = items.map((a) => `
      <div class="history-item">
        <div>
          <h3>${esc(a.title)}</h3>
          <div class="small muted">${fmtDate(a.createdAt)} · ${esc(a.headline || '')}</div>
        </div>
        <div class="row-actions">
          <span class="badge b-${esc(a.outlook)}">${esc(OUTLOOK_LABEL[a.outlook] || a.outlook || '')}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-open="${esc(a.id)}">View</button>
          <button type="button" class="btn btn-danger btn-sm" data-del="${esc(a.id)}">Delete</button>
        </div>
      </div>`).join('');
  } catch (e) {
    listEl.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

listEl.addEventListener('click', async (e) => {
  const open = e.target.dataset.open;
  const del = e.target.dataset.del;
  if (open) {
    const a = await API.get(`/api/assessments/${open}`);
    document.getElementById('detail').innerHTML = renderResult(a.result);
    listView.classList.add('hidden');
    detailView.classList.remove('hidden');
    window.scrollTo(0, 0);
  }
  if (del && confirm('Delete this assessment?')) {
    await API.del(`/api/assessments/${del}`);
    loadList();
  }
});
document.getElementById('back-list').addEventListener('click', () => { detailView.classList.add('hidden'); listView.classList.remove('hidden'); });
document.getElementById('print-btn').addEventListener('click', () => window.print());

if (API.requireLogin()) loadList(); // redirects to /login when not logged in
