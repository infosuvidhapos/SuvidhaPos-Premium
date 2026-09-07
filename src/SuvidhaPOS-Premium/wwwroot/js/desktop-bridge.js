(() => {
  const hasNative = () => !!(window.chrome && window.chrome.webview);
  const send = (type, payload = {}) => {
    try {
      // Support/Forgot Password should always open WhatsApp, including inside WebView2.
      // WebView2's navigation policy will safely hand the external URL to Windows.
      if (type === 'support' || type === 'forgotPassword') {
        const url = 'https://wa.me/918271718844';
        window.open(url, '_blank', 'noopener');
        return true;
      }
      if (type === 'biometric') {
        const error = document.querySelector('#loginError');
        if (error) error.textContent = 'Biometric login is optional and requires Windows Hello/device enrollment.';
        return true;
      }
      if (hasNative()) {
        window.chrome.webview.postMessage({ type, ...payload });
        return true;
      }
      if (type === 'exit') {
        window.close();
        return true;
      }
      if (type === 'database') {
        const error = document.querySelector('#loginError');
        if (error) error.textContent = 'Change Database is available in the Windows desktop host.';
        return true;
      }
    } catch (e) {
      console.error('Desktop bridge:', e);
    }
    return false;
  };
  window.desktopMessage = send;

  // Login is deliberately independent of the native bridge. This keeps the
  // login page functional in both the WebView2 desktop shell and normal browser.
  window.login = async function () {
    const user = document.querySelector('#loginUser')?.value.trim() || '';
    const pass = document.querySelector('#loginPass')?.value || '';
    const remember = document.querySelector('#rememberMe')?.checked ?? false;
    const error = document.querySelector('#loginError');
    if (error) error.textContent = '';
    if (!user || !pass) {
      if (error) error.textContent = 'Enter User ID and Password';
      return;
    }
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserName: user, Password: pass })
      });
      let d = {};
      try { d = await r.json(); } catch (_) {}
      if (!r.ok) {
        if (r.status === 401) throw new Error('Invalid username or password');
        throw new Error(d.message || d.detail || 'Database connection failed. Click Change Database.');
      }
      window.currentUser = d.user;
      send(remember ? 'remember' : 'clearRemembered', remember
        ? { enabled: true, userName: user, password: pass }
        : {});
      const screen = document.querySelector('#loginScreen');
      if (screen) screen.style.display = 'none';
      const pill = document.querySelector('#userPill');
      if (pill && d.user) pill.textContent = `${d.user.DisplayName} · ${d.user.Role}`;
      if (d.user?.MustChangePassword && typeof window.openChangePassword === 'function') window.openChangePassword(true);
      if (typeof window.loadDashboard === 'function') await window.loadDashboard();
    } catch (e) {
      if (error) error.textContent = e?.message || 'Unable to login';
      console.error('Login failed:', e);
    }
  };

  window.addEventListener('load', () => {
    const user = document.querySelector('#loginUser');
    if (user && !user.value) user.focus();
  });
})();
