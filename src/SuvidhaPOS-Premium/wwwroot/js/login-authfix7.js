(function (w, d) {
  'use strict';

  var busy = false;

  function el(id) { return d.getElementById(id); }

  function show(message) {
    var box = el('loginError');
    if (box) box.textContent = message ? String(message) : '';
  }

  function setButton(working) {
    var btn = el('loginSubmitBtn');
    if (!btn) return;
    btn.disabled = !!working;
    btn.textContent = working ? 'Signing in...' : '\u2192   Login   \u203a';
  }

  function parseJson(text) {
    if (!text) return {};
    try { return JSON.parse(text); } catch (e) { return {}; }
  }

  function request(method, url, body, token, callback) {
    var xhr = new XMLHttpRequest();
    var finished = false;

    function done(err) {
      if (finished) return;
      finished = true;
      callback(err, xhr.status || 0, parseJson(xhr.responseText), xhr.responseText || '');
    }

    try {
      xhr.open(method, url, true);
      xhr.timeout = 15000;
      xhr.setRequestHeader('Accept', 'application/json');
      if (body !== null && body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) done(null);
      };
      xhr.onerror = function () { done(new Error('Local service network error')); };
      xhr.ontimeout = function () { done(new Error('Local service request timed out')); };
      xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
    } catch (e) {
      done(e);
    }
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
    show(message || 'Login failed');
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
    } catch (e) {}
    return false;
  }

  function dashboardFailed(err) {
    var app = el('app');
    if (!app) return;
    var text = err && err.message ? err.message : String(err || 'Unknown dashboard error');
    app.innerHTML = '<div class="content"><div class="alert">Login successful, but dashboard failed: ' +
      text.replace(/[&<>"']/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
      }) + '</div></div>';
  }

  w.suvidhaLoginNow = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    if (busy) return false;

    var user = el('loginUser') ? el('loginUser').value.replace(/^\s+|\s+$/g, '') : '';
    var pass = el('loginPass') ? el('loginPass').value : '';
    var remember = !!(el('rememberMe') && el('rememberMe').checked);

    if (!user || !pass) {
      show('Enter User ID and Password');
      return false;
    }

    busy = true;
    setButton(true);
    show('LOGIN-1: Connecting to local service...');

    request('POST', '/api/login', { UserName: user, Password: pass }, null, function (err, status, data, rawText) {
      if (err) return fail('LOGIN-1 failed: ' + err.message);
      if (status === 401) return fail('Invalid username or password');
      if (status < 200 || status >= 300) {
        return fail('LOGIN-1 failed: HTTP ' + status + (rawText ? ' - ' + rawText.substring(0, 180) : ''));
      }

      var token = data.token || data.Token || '';
      if (!token) return fail('LOGIN-2 failed: Server accepted credentials but returned no session token.');

      w.suvidhaAuthToken = token;
      try { w.sessionStorage.setItem('suvidha_auth_token', token); } catch (e) {}

      var userObj = normalizeUser(data.user || data.User || {}, user);
      w.currentUser = userObj;
      show('LOGIN-2: Credentials accepted. Verifying session...');

      request('GET', '/api/me', null, token, function (verifyErr, verifyStatus, verifyData, verifyText) {
        if (verifyErr) return fail('LOGIN-2 verification failed: ' + verifyErr.message);
        if (verifyStatus < 200 || verifyStatus >= 300) {
          var detail = (verifyData && (verifyData.message || verifyData.detail)) || verifyText || '';
          return fail('LOGIN-2 verification failed: HTTP ' + verifyStatus + (detail ? ' - ' + detail.substring(0, 180) : ''));
        }

        show('Login successful. Opening dashboard...');
        d.body.setAttribute('data-authenticated','true');

        if (remember) {
          postDesktop('remember', { enabled: true, userName: user, password: pass });
        } else {
          postDesktop('clearRemembered', {});
        }

        var screen = el('loginScreen');
        if (screen) screen.style.setProperty('display', 'none', 'important');

        var pill = el('userPill');
        if (pill) pill.textContent = userObj.DisplayName + ' \u00b7 ' + userObj.Role;

        busy = false;
        setButton(false);
        w.setTimeout(function(){
          var s2=el('loginScreen');
          if(s2)s2.style.setProperty('display','none','important');
        },0);

        try {
          if (typeof w.loadDashboard === 'function') {
            var p = w.loadDashboard();
            if (p && typeof p.catch === 'function') p.catch(dashboardFailed);
          } else {
            dashboardFailed(new Error('Dashboard script is not loaded.'));
          }
        } catch (e) {
          dashboardFailed(e);
        }

        if (userObj.MustChangePassword) {
          w.setTimeout(function () {
            try {
              if (typeof w.openChangePassword === 'function') w.openChangePassword(true);
            } catch (e) {}
          }, 250);
        }
      });
    });

    return false;
  };

  w.login = w.suvidhaLoginNow;

  function onReady() {
    var pass = el('loginPass');
    var user = el('loginUser');
    var eye = el('loginEye');

    if (pass) {
      pass.addEventListener('keydown', function (e) {
        e = e || w.event;
        if (e.key === 'Enter' || e.keyCode === 13) {
          if (e.preventDefault) e.preventDefault();
          w.suvidhaLoginNow(e);
        }
      });
    }

    if (user) {
      user.addEventListener('keydown', function (e) {
        e = e || w.event;
        if (e.key === 'Enter' || e.keyCode === 13) {
          if (e.preventDefault) e.preventDefault();
          if (pass) pass.focus();
        }
      });
    }

    if (eye) {
      eye.addEventListener('click', function () {
        if (!pass) return;
        pass.type = pass.type === 'password' ? 'text' : 'password';
        eye.textContent = pass.type === 'password' ? '\u25c9' : '\u25cc';
      });
    }

    var db = el('changeDatabaseBtn');
    if (db) db.addEventListener('click', function () {
      if (!postDesktop('database', {})) show('Change Database requires the Windows desktop host.');
    });

    var exit = el('exitBtn');
    if (exit) exit.addEventListener('click', function () {
      if (!postDesktop('exit', {})) { try { w.close(); } catch (e) {} }
    });

    var support = el('supportBtn');
    var forgot = el('forgotPasswordBtn');
    var openSupport = function () {
      if (!postDesktop('support', {})) {
        try { w.open('https://wa.me/918271718844', '_blank'); } catch (e) {}
      }
    };
    if (support) support.addEventListener('click', openSupport);
    if (forgot) forgot.addEventListener('click', openSupport);

    var biometric = el('biometricBtn');
    if (biometric) biometric.addEventListener('click', function () {
      show('Biometric login requires Windows Hello/device enrollment.');
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})(window, document);
