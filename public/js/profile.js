renderChrome('profile');

const msgEl = document.getElementById('profile-msg');
function flash(text, type = 'success') {
  msgEl.textContent = text;
  msgEl.className = `alert-box ${type}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const nameForm = document.getElementById('name-form');
const pwForm = document.getElementById('password-form');
const delForm = document.getElementById('delete-form');

function showUser(u) {
  document.getElementById('p-email').textContent = u.email;
  document.getElementById('p-since').textContent = fmtDate(u.createdAt) || '—';
  document.getElementById('p-name').value = u.name;
}

async function load() {
  // Fetch fresh details from the server (the stored copy may be out of date)
  const { user } = await API.get('/api/auth/me');
  API.auth.save(null, user);
  showUser(user);
}

nameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('p-name').value.trim();
  if (!name) return flash('Enter your name.', 'error');
  try {
    const { user } = await API.put('/api/auth/me', { name });
    API.auth.save(null, user);
    renderChrome('profile'); // refresh the name shown in the header
    flash('Name updated.');
  } catch (err) { flash(err.message, 'error'); }
});

pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { currentPassword, newPassword, confirm: repeated } = Object.fromEntries(new FormData(pwForm));
  if (!currentPassword || !newPassword) return flash('Fill in all password fields.', 'error');
  if (newPassword.length < 8 || !/\d/.test(newPassword)) return flash('New password must be at least 8 characters and include a number.', 'error');
  if (newPassword !== repeated) return flash('The new passwords do not match.', 'error');
  try {
    const res = await API.put('/api/auth/password', { currentPassword, newPassword });
    API.auth.save(res.token, res.user); // the server issues a fresh token after a password change
    pwForm.reset();
    flash('Password changed.');
  } catch (err) { flash(err.message, 'error'); }
});

delForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('p-delete-pass').value;
  if (!password) return flash('Enter your password to confirm.', 'error');
  if (!confirm('Delete your account and all saved assessments permanently?')) return;
  try {
    await API.del('/api/auth/me', { password });
    API.auth.clear();
    window.location.href = '/';
  } catch (err) { flash(err.message, 'error'); }
});

if (API.requireLogin()) load().catch((e) => flash(e.message, 'error'));
