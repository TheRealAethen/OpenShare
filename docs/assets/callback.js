(function () {
  var FORWARDED_KEYS = ['code', 'state', 'error', 'error_description'];

  function buildProtocolUrl(search) {
    var incoming = new URLSearchParams(search);
    var outgoing = new URLSearchParams();
    FORWARDED_KEYS.forEach(function (key) {
      if (incoming.has(key)) outgoing.set(key, incoming.get(key));
    });
    if (!outgoing.has('code') && !outgoing.has('error')) return null;
    return 'openshare://callback?' + outgoing.toString();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildProtocolUrl: buildProtocolUrl, FORWARDED_KEYS: FORWARDED_KEYS };
    return;
  }

  var status = document.getElementById('status');
  var button = document.getElementById('return');
  var incoming = new URLSearchParams(window.location.search);
  var protocolUrl = buildProtocolUrl(window.location.search);
  var failed = incoming.has('error');

  // Remove the code from the address bar and browser history; it stays only in the button's link.
  window.history.replaceState(null, '', window.location.pathname);

  if (!protocolUrl) {
    status.textContent = 'This page completes sign-in for OpenShare. Start the sign-in from the app.';
    return;
  }

  status.textContent = failed
    ? 'Sign-in was not completed. Return to OpenShare to see the details.'
    : 'Sign-in received. Return to OpenShare to finish connecting your account.';
  button.href = protocolUrl;
  button.classList.remove('hidden');
})();
