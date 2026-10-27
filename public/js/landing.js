/* Landing page */

// Old links pointed at the form on the home page (e.g. /#assess-form); it now lives at /assess.
// Checked on load and on hash changes (following such a link while already on "/").
function redirectOldFormLinks() {
  if (['#assess-form', '#results', '#steps'].includes(location.hash)) location.replace(`/assess${location.hash}`);
}
redirectOldFormLinks();
window.addEventListener('hashchange', redirectOldFormLinks);

renderChrome('home');

// Live counts for the trust strip (the numbers in the HTML are the fallback)
Promise.all([API.get('/api/offences'), API.get('/api/provisions'), API.get('/api/meta')])
  .then(([offences, provisions, meta]) => {
    document.getElementById('t-offences').textContent = offences.length;
    document.getElementById('t-provisions').textContent = provisions.length;
    document.getElementById('t-rules').textContent = meta.rulesCount;
  })
  .catch(() => { /* keep the static numbers */ });

// Portal cards adapt when someone is already logged in
const user = API.sessions.user.user;
if (user) {
  document.getElementById('user-portal-text').textContent = `You're logged in as ${user.name}.`;
  document.getElementById('user-portal-actions').innerHTML =
    '<a class="btn btn-primary" href="/assess">Start an assessment</a><a class="btn btn-ghost" href="/history">My assessments</a>';
}
if (API.sessions.admin.user?.role === 'admin') {
  document.getElementById('admin-portal-actions').innerHTML = '<a class="btn btn-accent" href="/admin">Go to admin dashboard</a>';
}
