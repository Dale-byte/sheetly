// Cloud sync bridge for Sheetly.
// Loaded BEFORE app.js. Talks to the parent window over postMessage.
// - Defers DOMContentLoaded handlers until parent sends the snapshot.
// - Seeds localStorage so app.js's loadData() picks up the cloud snapshot.
// - Hooks localStorage.setItem to push changes back to parent (debounced).
(function () {
  var STORAGE_KEY = 'sheetly_data';
  var ready = false;
  var pendingPush = null;
  var pushTimer = null;
  var deferredDCL = [];
  var initReceived = false;

  // Intercept DOMContentLoaded so app.js's init waits for our snapshot.
  var origAdd = document.addEventListener.bind(document);
  document.addEventListener = function (type, listener, opts) {
    if (type === 'DOMContentLoaded' && !initReceived) {
      deferredDCL.push(listener);
      return;
    }
    return origAdd(type, listener, opts);
  };

  function fireDeferred() {
    initReceived = true;
    var list = deferredDCL.slice();
    deferredDCL = [];
    for (var i = 0; i < list.length; i++) {
      try { list[i].call(document, new Event('DOMContentLoaded')); } catch (e) { console.error(e); }
    }
  }

  function send(type, payload) {
    try {
      // Never '*': that hands the budget snapshot to whatever parent we are
      // framed by. The host is always same-origin (it serves this file).
      window.parent.postMessage(
        { source: 'sheetly', type: type, payload: payload },
        window.location.origin
      );
    } catch (e) {}
  }

  function schedulePush(value) {
    pendingPush = value;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      if (pendingPush != null) {
        send('save', pendingPush);
        pendingPush = null;
      }
    }, 600);
  }

  // Hook localStorage.setItem so any save() in app.js mirrors to the cloud.
  var origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    origSet(k, v);
    if (k === STORAGE_KEY && ready) schedulePush(v);
  };
  var origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function (k) {
    origRemove(k);
    if (k === STORAGE_KEY && ready) send('save', '');
  };

  // Receive snapshot/auth state from parent.
  window.addEventListener('message', function (e) {
    // Security: only accept messages from our host, same-origin.
    // `msg.source` below is NOT this check - that string lives inside e.data
    // and any page can forge it. These two are the real gate.
    if (e.origin !== window.location.origin) return;
    if (e.source !== window.parent) return;
    var msg = e.data;
    if (!msg || msg.source !== 'sheetly-host') return;
    if (msg.type === 'init') {
      try {
        if (msg.payload && typeof msg.payload === 'string' && msg.payload.length > 0) {
          origSet(STORAGE_KEY, msg.payload);
        }
        // Empty payload (no cloud data): keep whatever is stored locally
        // instead of wiping it. The shell only sends empty when there is no
        // cloud data AND no local data, so nothing is ever lost here.
      } catch (err) {}
      ready = true;
      send('ready', null);
      fireDeferred();
    } else if (msg.type === 'navigate') {
      try {
        if (typeof window.navigate === 'function') window.navigate(msg.payload);
        else window.location.hash = '#' + msg.payload;
      } catch (err) {}
    } else if (msg.type === 'reload') {
      window.location.reload();
    }
  });

  // Tell parent we're alive and ready to receive snapshot.
  send('hello', null);
})();
