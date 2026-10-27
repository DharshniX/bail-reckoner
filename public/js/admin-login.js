renderChrome('admin-login');

// Already signed in as admin? Go straight to the dashboard.
if (API.auth.isAdmin()) window.location.replace(safeNext('/admin') || '/admin');

const msg = document.getElementById('auth-msg');
const form = document.getElementById('admin-login-form');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  if (!body.email || !body.password) {
    msg.textContent = 'Enter your email and password.';
    msg.className = 'alert-box error';
    return;
  }
  try {
    const res = await API.post('/api/auth/admin/login', body);
    API.auth.save(res.token, res.user); // stored as the admin session only
    API.queueToast(`Welcome back, ${res.user.name}`);
    window.location.href = safeNext('/admin') || '/admin';
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'alert-box error';
  }
});
