// Legacy colorful report reference screen intentionally disabled.
// Reports use the original Premium dark report suite from reports-suite.js.
// This file also contains the desktop login hotfix. It is loaded before the
// inline login handler in index.html, so capture-phase listeners can safely
// bypass the legacy handler without changing the login page markup.
(() => {
  const $ = id => document.getElementById(id);
  let signingIn = false;

  const showLoginError = message => {
    const el = $('loginError');
    if (el) el.textContent = String(message || 'Unable to login');
  };

  const postDesktopMessage = (type, payload = {}) => {
    try {
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(Object.assign({ type }, payload));
        return true;
      }
    } catch (e) {
      console.error('Desktop bridge message failed', e);
    }
    return false;
  };

  const normalizeUser = (raw, fallbackUserName) => {
    raw = raw || {};
    return {
      Id: raw.Id ?? raw.id,
      UserName: raw.UserName ?? raw.userName ?? fallbackUserName ?? '',
      DisplayName: raw.DisplayName ?? raw.displayName ?? raw.UserName ?? raw.userName ?? fallbackUserName ?? '',
      Role: raw.Role ?? raw.role ?? 'User',
      MustChangePassword: raw.MustChangePassword ?? raw.mustChangePassword ?? false,
      IsActive: raw.IsActive ?? raw.isActive ?? true
    };
  };

  const fixedLogin = async () => {
    if (signingIn) return;

    const userName = ($('loginUser')?.value || '').trim();
    const password = $('loginPass')?.value || '';
    const remember = !!$('rememberMe')?.checked;
    const button = $('loginSubmitBtn');

    showLoginError('');
    if (!userName || !password) {
      showLoginError('Enter User ID and Password');
      return;
    }

    signingIn = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Signing in...';
    }

    try {
      // Authentication is handled separately from post-login initialization.
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ UserName: userName, Password: password })
      });

      let payload = {};
      try { payload = await response.json(); } catch (_) { }

      if (!response.ok) {
        if (response.status === 401) throw new Error('Invalid username or password');
        throw new Error(payload.message || payload.detail || `Login failed (${response.status})`);
      }

      const rawUser = payload.user ?? payload.User ?? payload;
      const currentUser = normalizeUser(rawUser, userName);
      window.currentUser = currentUser;

      // Authentication has succeeded at this point. Never convert later UI
      // initialization errors back into an "Unable to login" message.
      if (remember) {
        postDesktopMessage('remember', {
          enabled: true,
          userName,
          password
        });
      } else {
        postDesktopMessage('clearRemembered');
      }

      const screen = $('loginScreen');
      if (screen) screen.style.display = 'none';

      const pill = $('userPill');
      if (pill) pill.textContent = `${currentUser.DisplayName} · ${currentUser.Role}`;

      try {
        if (typeof window.loadDashboard === 'function') {
          await window.loadDashboard();
        }
      } catch (dashboardError) {
        console.error('Dashboard initialization failed after successful login', dashboardError);
        const app = $('app');
        if (app) {
          const safe = String(dashboardError?.message || dashboardError || 'Unknown dashboard error')
            .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
          app.innerHTML = `<div class="content"><div class="alert">Login successful, but dashboard initialization failed: ${safe}</div></div>`;
        }
      }

      try {
        if (currentUser.MustChangePassword && typeof window.openChangePassword === 'function') {
          window.openChangePassword(true);
        }
      } catch (passwordDialogError) {
        console.error('Password-change dialog failed after successful login', passwordDialogError);
      }
    } catch (error) {
      console.error('Authentication failed', error);
      showLoginError(error?.message || 'Unable to login');
      const screen = $('loginScreen');
      if (screen) screen.style.display = '';
    } finally {
      signingIn = false;
      if (button) {
        button.disabled = false;
        button.textContent = '→   Login   ›';
      }
    }
  };

  // The old inline handler is attached later at the target/bubble phase.
  // Capture listeners stop it before it runs and route login through fixedLogin.
  document.addEventListener('click', event => {
    const target = event.target?.closest?.('#loginSubmitBtn');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    fixedLogin();
  }, true);

  document.addEventListener('keydown', event => {
    const target = event.target;
    if (!target || target.id !== 'loginPass' || event.key !== 'Enter') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    fixedLogin();
  }, true);

  window.fixedDesktopLogin = fixedLogin;
})();
