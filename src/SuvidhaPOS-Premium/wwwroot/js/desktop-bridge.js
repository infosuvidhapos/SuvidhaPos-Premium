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

  // Authentication is owned exclusively by login-authfix7.js.
  // Keep this file limited to native desktop messaging to avoid replacing
  // the verified login handler at runtime.

  window.addEventListener('load', () => {
    const user = document.querySelector('#loginUser');
    if (user && !user.value) user.focus();
  });
})();
