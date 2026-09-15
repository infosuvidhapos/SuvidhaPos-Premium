(function (w, d) {
  'use strict';

  var busy = false;
  var OFFLINE_NOTICE = 'No internet connection. Local login is available.';

  function el(id) { return d.getElementById(id); }
  function show(message) {
    var box = el('loginError');
    if (box) box.textContent = message ? String(message) : '';
  }
  function setButton(working) {
    var btn = el('loginSubmitBtn');
    if (!btn) return;
    btn.disabled = !!working;
    btn.innerHTML = working
      ? '<span class="login-spinner" aria-hidden="true"></span><span>Signing in...</span>'
      : '<span class="login-submit-label">→ &nbsp; Login &nbsp;›</span>';
  }
  function parseJson(text) {
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return {}; }
  }
  function request(method, url, body, token, callback) {
    var xhr = new XMLHttpRequest(), finished = false;
    function done(err) {
      if (finished) return;
      finished = true;
      callback(err, xhr.status || 0, parseJson(xhr.responseText), xhr.responseText || '');
    }
    try {
      xhr.open(method, url, true);
      xhr.timeout = 7000;
      xhr.setRequestHeader('Accept', 'application/json');
      if (body !== null && body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onreadystatechange = function () { if (xhr.readyState === 4) done(null); };
      xhr.onerror = function () { done(new Error('LOCAL_SERVICE_UNAVAILABLE')); };
      xhr.ontimeout = function () { done(new Error('LOCAL_SERVICE_TIMEOUT')); };
      xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
    } catch (e) { done(e); }
  }
  function normalizeUser(raw, fallback) {
    raw = raw || {};
    return {
      Id: raw.Id !== undefined ? raw.Id : raw.id,
      UserName: raw.UserName || raw.userName || fallback || '',
      DisplayName: raw.DisplayName || raw.displayName || raw.UserName || raw.userName || fallback || '',
      Role: raw.Role || raw.role || 'User',
      MustChangePassword: raw.MustChangePassword !== undefined ? raw.MustChangePassword : !!raw.mustChangePassword
    };
  }
  function fail(message) {
    busy = false;
    setButton(false);
    show(message || 'Unable to sign in. Please try again.');
    var screen = el('loginScreen');
    if (screen) screen.style.display = 'flex';
  }
  function postDesktop(type, payload) {
    try {
      if (w.chrome && w.chrome.webview) {
        var message = payload || {};
        message.type = type;
        w.chrome.webview.postMessage(message);
        return true;
      }
    } catch (_) {}
    return false;
  }
  function friendlyLoginError(status, data) {
    var code = String((data && (data.code || data.Code)) || '').toUpperCase();
    if (code === 'USER_NOT_FOUND') return 'User ID not found.';
    if (code === 'WRONG_PASSWORD') return 'Incorrect password.';
    if (status === 401) return 'Incorrect User ID or password.';
    if (status === 423) {
      var lic = (data && (data.license || data.License)) || {};
      var lcode = String(lic.code || lic.Code || '').toUpperCase();
      if (lcode === 'LOCKED' || lcode === 'EXPIRED') return 'Your SuvidhaPOS subscription has expired. Please contact support.';
      return (data && (data.message || data.Message)) || 'Your SuvidhaPOS subscription is not available. Please contact support.';
    }
    if (status === 0) return 'Unable to connect to server. Please try again.';
    return 'Unable to sign in. Please try again.';
  }
  function dashboardFailed() {
    var app = el('app');
    if (app) app.innerHTML = '<div class="content"><div class="alert">Login successful, but the dashboard could not load. Please use Refresh or restart SuvidhaPOS.</div></div>';
  }
  function applyAppInfo(info) {
    info = info || {};
    var version = String(info.Version || info.version || 'Unknown');
    var edition = String(info.Edition || info.edition || 'Premium');
    var year = String(info.CopyrightYear || info.copyrightYear || new Date().getFullYear());
    var footer = el('loginFooterVersion'); if (footer) footer.textContent = version;
    var av = el('aboutVersion'); if (av) av.textContent = version;
    var ae = el('aboutEdition'); if (ae) ae.textContent = edition;
    var ac = el('aboutCopyright'); if (ac) ac.textContent = '© ' + year + ' SuvidhaPOS';
  }
  async function loadAppInfo() {
    try {
      var r = await fetch('/public/app-info?_=' + Date.now(), { cache: 'no-store', headers: { 'Accept': 'application/json' } });
      if (r.ok) applyAppInfo(await r.json());
    } catch (_) {}
  }
  function syncAboutStoreType() {
    var s = el('aboutStoreType');
    if (!s) return;
    var o = w.suvidhaOutlet || {};
    var type = String(o.StoreType || o.storeType || (el('loginOutlet') && el('loginOutlet').dataset.storeType) || 'Retail Shop');
    s.textContent = type;
  }
  function showAboutModal(showIt) {
    var modal = el('aboutModal');
    if (!modal) return;
    var on = showIt !== false;
    modal.hidden = !on;
    modal.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) { syncAboutStoreType(); loadAppInfo(); }
  }
  w.showAboutModal = showAboutModal;

  w.suvidhaLoginNow = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    if (busy) return false;
    var user = el('loginUser') ? el('loginUser').value.trim() : '';
    var pass = el('loginPass') ? el('loginPass').value : '';
    var remember = !!(el('rememberMe') && el('rememberMe').checked);

    if (!user) { show('Enter your User ID.'); if (el('loginUser')) el('loginUser').focus(); return false; }
    if (!pass) { show('Enter your password.'); if (el('loginPass')) el('loginPass').focus(); return false; }

    busy = true;
    setButton(true);
    show('');

    request('POST', '/api/login', { UserName: user, Password: pass }, null, function (err, status, data) {
      if (err) return fail('Unable to connect to server. Please try again.');
      if (status < 200 || status >= 300) {
        if (status === 423) {
          var lic = data.license || data.License || {};
          var code = String(lic.code || lic.Code || '').toUpperCase();
          if ((lic.managed === false || lic.Managed === false || code === 'NOT_ACTIVATED') && typeof w.showLicenseActivation === 'function')
            w.setTimeout(function () { w.showLicenseActivation(lic); }, 0);
          else if (typeof w.showLicenseExpired === 'function')
            w.setTimeout(function () { w.showLicenseExpired(lic); }, 0);
        }
        return fail(friendlyLoginError(status, data));
      }

      var token = data.token || data.Token || '';
      if (!token) return fail('Unable to start your session. Please try again.');

      w.suvidhaAuthToken = token;
      try { w.sessionStorage.setItem('suvidha_auth_token', token); } catch (_) {}
      var userObj = normalizeUser(data.user || data.User || {}, user);
      w.currentUser = userObj;

      if (remember) postDesktop('remember', { enabled: true, userName: user, password: pass });
      else postDesktop('clearRemembered', {});

      var loginLicense = data.license || data.License || null;
      if (loginLicense && typeof w.applyLicenseStatus === 'function') w.applyLicenseStatus(loginLicense);

      d.body.setAttribute('data-authenticated', 'true');
      var screen = el('loginScreen');
      if (screen) screen.style.setProperty('display', 'none', 'important');
      var pill = el('userPill');
      if (pill) pill.textContent = userObj.DisplayName + ' · ' + userObj.Role;

      busy = false;
      setButton(false);
      try { w.dispatchEvent(new CustomEvent('suvidha:login-success', { detail: userObj })); } catch (_) {}
      if (typeof w.refreshLicenseStatus === 'function') w.setTimeout(function () { w.refreshLicenseStatus(true); }, 0);

      try {
        if (typeof w.loadDashboard === 'function') {
          var p = w.loadDashboard();
          if (p && typeof p.catch === 'function') p.catch(dashboardFailed);
        } else dashboardFailed();
      } catch (_) { dashboardFailed(); }

      if (userObj.MustChangePassword) {
        w.setTimeout(function () { try { if (typeof w.openChangePassword === 'function') w.openChangePassword(true); } catch (_) {} }, 250);
      }
    });
    return false;
  };
  w.login = w.suvidhaLoginNow;

  function updateCapsLock(e) {
    var warning = el('capsLockWarning');
    if (!warning || !e || typeof e.getModifierState !== 'function') return;
    warning.textContent = '⚠ Caps Lock is ON';
    warning.hidden = !e.getModifierState('CapsLock');
  }
  function onReady() {
    var pass = el('loginPass'), user = el('loginUser'), eye = el('loginEye'), submit = el('loginSubmitBtn');
    if (submit) submit.addEventListener('click', w.suvidhaLoginNow);

    if (pass) {
      pass.addEventListener('keydown', function (e) {
        updateCapsLock(e);
        if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); w.suvidhaLoginNow(e); }
      });
      pass.addEventListener('keyup', updateCapsLock);
      pass.addEventListener('blur', function () { var x = el('capsLockWarning'); if (x) x.hidden = true; });
    }
    if (user) {
      user.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); if (pass) pass.focus(); }
      });
      w.setTimeout(function () { try { user.focus(); user.select(); } catch (_) {} }, 80);
    }
    if (eye) eye.addEventListener('click', function () {
      if (!pass) return;
      pass.type = pass.type === 'password' ? 'text' : 'password';
      eye.textContent = pass.type === 'password' ? '◉' : '◌';
      eye.setAttribute('aria-label', pass.type === 'password' ? 'Show password' : 'Hide password');
      pass.focus();
    });

    var about = el('aboutBtn'), aboutClose = el('aboutCloseBtn'), aboutOk = el('aboutOkBtn'), modal = el('aboutModal');
    if (about) about.addEventListener('click', function () { showAboutModal(true); });
    if (aboutClose) aboutClose.addEventListener('click', function () { showAboutModal(false); });
    if (aboutOk) aboutOk.addEventListener('click', function () { showAboutModal(false); });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) showAboutModal(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal && !modal.hidden) showAboutModal(false); });

    var exit = el('exitBtn');
    if (exit) exit.addEventListener('click', function () {
      if (!w.confirm('Exit SuvidhaPOS?')) return;
      if (!postDesktop('exit', {})) { try { w.close(); } catch (_) {} }
    });

    var support = el('supportBtn'), forgot = el('forgotPasswordBtn');
    function supportFallback() {
      if (typeof w.openSuvidhaContactSupport === 'function') { w.openSuvidhaContactSupport(); return; }
      if (!postDesktop('support', {})) { try { w.open('https://wa.me/918271718844', '_blank'); } catch (_) {} }
    }
    if (support) support.addEventListener('click', supportFallback);
    if (forgot) forgot.addEventListener('click', supportFallback);

    var biometric = el('biometricBtn');
    if (biometric) biometric.addEventListener('click', function () {
      if (!postDesktop('windowsHello', {})) show('Windows Hello is available in the Windows desktop app when configured on this device.');
    });

    w.addEventListener('suvidha:outlet-synced', syncAboutStoreType);
    w.addEventListener('suvidha:sync-offline', function () { if (!busy) show(OFFLINE_NOTICE); });
    loadAppInfo();
    syncAboutStoreType();
    setButton(false);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})(window, document);
