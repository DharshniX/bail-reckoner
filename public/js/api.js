/* Shared helpers: API calls, auth state, header/footer/breadcrumbs, toasts, HTML escaping */
const API = (() => {
  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } }

  // One-time clean-up of the old single-session keys (before user/admin sessions were split)
  safeSet('br_token', null); safeSet('br_user', null);

  // Users and admins have separate sessions, so logging into one never logs out the other.
  // Pages under /admin use the admin session; every other page uses the user session.
  const SCOPE = location.pathname.startsWith('/admin') ? 'admin' : 'user';
  const KEYS = {
    user: { token: 'br_user_token', user: 'br_user_session' },
    admin: { token: 'br_admin_token', user: 'br_admin_session' },
  };
  const LOGIN_PAGE = { user: '/login', admin: '/admin/login' };

  /** True if a JWT's "exp" time has passed (checked locally to avoid a pointless request). */
  function isExpired(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.exp * 1000 < Date.now();
    } catch { return true; }
  }

  function session(scope) {
    const k = KEYS[scope];
    const s = {
      get token() {
        const t = safeGet(k.token);
        if (t && isExpired(t)) { s.clear(); return null; }
        return t;
      },
      get user() { if (!s.token) return null; try { return JSON.parse(safeGet(k.user) || 'null'); } catch { return null; } },
      save(token, user) { if (token) safeSet(k.token, token); safeSet(k.user, JSON.stringify(user)); },
      clear() { safeSet(k.token, null); safeSet(k.user, null); },
    };
    return s;
  }

  const sessions = { user: session('user'), admin: session('admin') };
  const auth = sessions[SCOPE];                                 // the session this page uses
  auth.scope = SCOPE;
  auth.isAdmin = () => auth.user?.role === 'admin';

  let protectedPage = false;
  /** Call at the top of pages that need a login. Redirects to the right login page if needed. */
  function requireLogin() {
    protectedPage = true;
    const ok = SCOPE === 'admin' ? auth.isAdmin() : !!auth.user;
    if (!ok) location.replace(`${LOGIN_PAGE[SCOPE]}?next=${encodeURIComponent(location.pathname)}`);
    return ok;
  }

  async function request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    // Session expired, password reset or account deactivated: drop the session
    if (res.status === 401 && auth.token && !/\/auth\/(admin\/)?login$/.test(url)) {
      auth.clear();
      if (protectedPage) requireLogin();
    }
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  }

  // A toast queued before a redirect (e.g. "Welcome back") is shown on the next page
  function queueToast(text) { try { sessionStorage.setItem('br_toast', text); } catch { /* ignore */ } }
  function takeToast() {
    try { const t = sessionStorage.getItem('br_toast'); sessionStorage.removeItem('br_toast'); return t; } catch { return null; }
  }

  return {
    auth,
    sessions,
    loginPage: LOGIN_PAGE[SCOPE],
    requireLogin,
    queueToast,
    takeToast,
    get: (u) => request('GET', u),
    post: (u, b) => request('POST', u, b || {}),
    put: (u, b) => request('PUT', u, b || {}),
    patch: (u, b) => request('PATCH', u, b || {}),
    del: (u, b) => request('DELETE', u, b),
  };
})();

/** Accepts only same-site paths for ?next= redirects (blocks //evil.com style open redirects). */
function safeNext(prefix) {
  const next = new URLSearchParams(location.search).get('next') || '';
  return next.startsWith(prefix) && !next.startsWith('//') && !next.includes('\\') ? next : null;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Page chrome: sticky header with dropdowns + mobile menu, breadcrumbs, footer,
// toasts and the back-to-top button. Every page calls renderChrome('<page key>').
// ---------------------------------------------------------------------------
const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M7 21h10M5 7h14M12 3l-1 1M12 3l1 1"/><path d="M5 7l-3 6a3 3 0 0 0 6 0L5 7zM19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/></svg>';

const ICON = {
  caret: '<svg class="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
};

// Page key -> [url, title]. Used for highlighting the current page and for breadcrumbs.
const PAGES = {
  home: ['/', 'Home'],
  assess: ['/assess', 'Assess a case'],
  library: ['/library', 'Legal library'],
  history: ['/history', 'My assessments'],
  profile: ['/profile', 'Profile'],
  login: ['/login', 'User login'],
  'admin-login': ['/admin/login', 'Admin login'],
  dashboard: ['/admin', 'Admin dashboard'],
  rules: ['/admin/rules', 'Rules'],
  offences: ['/admin/offences', 'Offences'],
  provisions: ['/admin/provisions', 'Provisions'],
  users: ['/admin/users', 'Users'],
  changelog: ['/admin/changelog', 'Change log'],
};
const ADMIN_SECTIONS = ['rules', 'offences', 'provisions', 'users', 'changelog'];

/** Dropdown with the account's name; items are [href, label] or 'logout'. */
function accountMenu(u, scope, items) {
  const initial = esc((u.name || '?').trim().charAt(0).toUpperCase());
  return `<div class="dropdown">
    <button type="button" class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">
      <span class="avatar" aria-hidden="true">${initial}</span><span class="acct-name">${esc(u.name)}</span>${ICON.caret}
    </button>
    <div class="dropdown-menu">
      <div class="dm-head"><strong>${esc(u.name)}</strong><small>${esc(u.email || '')}</small></div>
      ${items.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('')}
      <hr><button type="button" data-logout="${scope}">Log out</button>
    </div>
  </div>`;
}

function loginMenu() {
  return `<div class="dropdown">
    <button type="button" class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Log in ${ICON.caret}</button>
    <div class="dropdown-menu">
      <a href="/login"><span class="dm-icon">${ICON.user}</span><span><b>User login</b><small>Run and save assessments</small></span></a>
      <a href="/admin/login"><span class="dm-icon dark">${ICON.shield}</span><span><b>Admin login</b><small>Authorised personnel only</small></span></a>
    </div>
  </div>
  <a class="btn btn-accent btn-sm" href="/login?mode=register">Get started</a>`;
}

function headerHTML(active) {
  const user = API.sessions.user.user;
  const admin = API.sessions.admin.user;
  const adminMode = API.auth.scope === 'admin' && admin?.role === 'admin';
  const link = (key) => `<a href="${PAGES[key][0]}"${active === key ? ' class="active" aria-current="page"' : ''}>${esc(PAGES[key][1])}</a>`;

  let links;
  let actions;
  if (adminMode) {
    // Admin pages keep the admin menu
    links = ['dashboard', ...ADMIN_SECTIONS].map(link);
    actions = accountMenu(admin, 'admin', [['/admin', 'Admin dashboard'], ['/', 'View public site']]);
  } else {
    links = ['home', 'assess', 'library'].map(link);
    if (user) links.push(link('history'));
    const items = [['/profile', 'Profile'], ['/history', 'My assessments']];
    if (admin?.role === 'admin') items.push(['/admin', 'Admin dashboard']); // admin also signed in here
    actions = user ? accountMenu(user, 'user', items) : loginMenu();
  }

  return `<div class="container header-inner">
    <a class="brand" href="${adminMode ? '/admin' : '/'}">
      <span class="brand-mark">${LOGO}</span>
      <span><span class="brand-name">Bail Reckoner</span><span class="brand-sub">${adminMode ? 'Admin Portal · Legal source module' : 'Bail Assessment &amp; Legal Rights Calculator'}</span></span>
    </a>
    <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="Open menu"><span></span><span></span><span></span></button>
    <nav class="nav" id="main-nav" aria-label="Main">
      <div class="nav-links">${links.join('')}</div>
      <div class="nav-actions">${actions}</div>
    </nav>
  </div>`;
}

function breadcrumbsHTML(active) {
  if (!PAGES[active] || active === 'home' || active === 'dashboard') return '';
  const trail = ADMIN_SECTIONS.includes(active) ? [PAGES.dashboard] : [PAGES.home];
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><div class="container"><ol>
    ${trail.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}
    <li aria-current="page">${esc(PAGES[active][1])}</li>
  </ol></div></nav>`;
}

function footerHTML() {
  return `<div class="container footer-grid">
      <div class="footer-brand">
        <a class="brand" href="/"><span class="brand-mark">${LOGO}</span><span class="brand-name">Bail Reckoner</span></a>
        <p>Plain-language guidance on bail under the Bharatiya Nagarik Suraksha Sanhita, 2023.</p>
      </div>
      <nav aria-label="Footer: the tool"><h4>The tool</h4>
        <a href="/assess">Assess a case</a><a href="/library">Legal library</a><a href="/#about">About</a></nav>
      <nav aria-label="Footer: accounts"><h4>Accounts</h4>
        <a href="/login">User login</a><a href="/login?mode=register">Create account</a><a href="/admin/login">Admin login</a></nav>
      <div class="footer-help"><h4>Need a lawyer?</h4>
        <p>Free legal aid — NALSA helpline</p><a class="helpline" href="tel:15100">15100</a></div>
    </div>
    <div class="container footer-bottom">
      <p><strong>Informational tool only.</strong> Not a substitute for legal advice or a court's decision.</p>
      <p>Based on the BNSS, 2023 and BNS, 2023 · Full Stack Development project — SRM Easwari Engineering College.</p>
    </div>`;
}

function showToast(text, type = 'success') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = text;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4000);
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ensureBackToTop() {
  if (document.getElementById('back-to-top')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'back-to-top';
  b.className = 'back-to-top';
  b.setAttribute('aria-label', 'Back to top');
  b.innerHTML = ICON.up;
  b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
  document.body.appendChild(b);
  const onScroll = () => b.classList.toggle('show', window.scrollY > 600);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function closeMenus(except) {
  document.querySelectorAll('.dropdown.open').forEach((d) => {
    if (d === except) return;
    d.classList.remove('open');
    d.querySelector('.dropdown-toggle').setAttribute('aria-expanded', 'false');
  });
}

// Document-level handlers are attached once, so re-rendering the header is safe.
let chromeEventsBound = false;
function bindChromeEvents() {
  if (chromeEventsBound) return;
  chromeEventsBound = true;

  document.addEventListener('click', (e) => {
    // Dropdowns: toggle the clicked one, close the rest (and close on outside click)
    const toggle = e.target.closest('.dropdown-toggle');
    closeMenus(toggle?.parentElement);
    if (toggle) {
      const open = toggle.parentElement.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    }
    // Mobile menu
    const burger = e.target.closest('.nav-toggle');
    if (burger) {
      const header = burger.closest('.site-header');
      const open = header.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    // Log out (user and admin sessions are separate)
    const logout = e.target.closest('[data-logout]');
    if (logout) {
      const scope = logout.dataset.logout;
      API.sessions[scope].clear();
      API.queueToast('You have been logged out.');
      window.location.href = scope === 'admin' ? '/admin/login' : '/';
    }
    // "Show password" buttons inside .pw-field
    const pw = e.target.closest('.pw-toggle');
    if (pw) {
      const input = pw.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      pw.textContent = show ? 'Hide' : 'Show';
      pw.setAttribute('aria-pressed', String(show));
      pw.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.dropdown.open .dropdown-toggle');
    closeMenus();
    const header = document.querySelector('.site-header.nav-open');
    if (header) { header.classList.remove('nav-open'); header.querySelector('.nav-toggle').setAttribute('aria-expanded', 'false'); }
    if (open) open.focus();
  });
}

function renderChrome(active) {
  const header = document.getElementById('site-header');
  if (header) {
    header.className = 'site-header';
    header.innerHTML = headerHTML(active);
    document.querySelector('.breadcrumbs')?.remove();
    header.insertAdjacentHTML('afterend', breadcrumbsHTML(active));
  }
  const footer = document.getElementById('site-footer');
  if (footer) {
    footer.className = 'site-footer';
    footer.innerHTML = footerHTML();
  }
  bindChromeEvents();
  ensureBackToTop();
  const queued = API.takeToast();
  if (queued) showToast(queued);
}
