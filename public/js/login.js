renderChrome('login');

// Already logged in as a user? Nothing to do here.
if (API.auth.user) window.location.replace(safeNext('/') || '/');

const msg = document.getElementById('auth-msg');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabs = [...document.querySelectorAll('.tabs button')];

function show(text, type = 'error') {
  msg.textContent = text;
  msg.className = `alert-box ${type}`;
  // Admins who try the user login get a direct link to their portal
  if (/admin portal/i.test(text)) msg.innerHTML = `${esc(text)} <a href="/admin/login">Go to the admin portal →</a>`;
}

function selectTab(name) {
  tabs.forEach((x) => {
    const on = x.dataset.tab === name;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', String(on));
  });
  loginForm.classList.toggle('hidden', name !== 'login');
  registerForm.classList.toggle('hidden', name !== 'register');
  msg.className = 'alert-box hidden';
}
tabs.forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
document.querySelector('[data-switch=register]').addEventListener('click', (e) => { e.preventDefault(); selectTab('register'); });
// /login?mode=register opens the "Create account" tab (used by "Get started" links)
if (new URLSearchParams(location.search).get('mode') === 'register') selectTab('register');

// Live password-rule hint (same rule the server enforces)
const RULES = { len: (p) => p.length >= 8, num: (p) => /\d/.test(p) };
const pwInput = document.getElementById('r-pass');
pwInput.addEventListener('input', () => {
  document.querySelectorAll('#pw-rules li').forEach((li) => li.classList.toggle('ok', RULES[li.dataset.rule](pwInput.value)));
});

function done(res, greeting) {
  API.auth.save(res.token, res.user);
  API.queueToast(`${greeting}, ${res.user.name}`); // shown as a toast on the next page
  const next = safeNext('/');
  window.location.href = next && !next.startsWith('/admin') ? next : '/';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(loginForm));
  if (!body.email || !body.password) return show('Enter your email and password.');
  try { done(await API.post('/api/auth/login', body), 'Welcome back'); } catch (err) { show(err.message); }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(registerForm));
  if (!body.name || !body.email || !body.password) return show('All fields are required.');
  if (!RULES.len(body.password) || !RULES.num(body.password)) return show('Password must be at least 8 characters and include a number.');
  try { done(await API.post('/api/auth/register', body), 'Welcome'); } catch (err) { show(err.message); }
});
