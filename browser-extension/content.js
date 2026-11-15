// Content script: runs only on docs.google.com/forms/*, and reports events only while
// the background worker says monitoring is active for THIS tab.
// It never reads form content, clipboard data or key values.

(() => {
  let active = false;
  let idleThresholdMs = 120000;
  let lastInput = Date.now();
  let wasFullscreen = false;
  let listenersAttached = false;

  const send = (event_type, details = {}) => {
    try {
      chrome.runtime.sendMessage({
        type: 'ACTIVITY',
        event_type,
        event_timestamp: new Date().toISOString(),
        details
      });
    } catch (_) { /* extension reloaded; ignore */ }
  };

  const onVisibility = () => {
    if (active) send(document.hidden ? 'page_hidden' : 'page_visible');
  };
  const onBlur = () => active && send('window_blur');
  const onFocus = () => active && send('window_focus');
  const onCopy = () => active && send('copy');   // event only, no clipboard contents
  const onPaste = () => active && send('paste');
  const onOffline = () => active && send('connection_lost');
  const onOnline = () => active && send('connection_restored');
  const onFullscreen = () => {
    const isFs = !!document.fullscreenElement;
    if (active && wasFullscreen && !isFs) send('fullscreen_exit');
    wasFullscreen = isFs;
  };

  // Input timestamps only; event details are never read.
  const onInput = () => {
    const now = Date.now();
    const idle = now - lastInput;
    lastInput = now;
    if (active && idle >= idleThresholdMs) {
      send('inactivity', { duration_seconds: Math.round(idle / 1000) });
    }
  };

  const attach = () => {
    if (listenersAttached) return;
    listenersAttached = true;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach((t) =>
      window.addEventListener(t, onInput, { passive: true, capture: true })
    );
  };

  const detach = () => {
    if (!listenersAttached) return;
    listenersAttached = false;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('copy', onCopy, true);
    document.removeEventListener('paste', onPaste, true);
    document.removeEventListener('fullscreenchange', onFullscreen);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach((t) =>
      window.removeEventListener(t, onInput, { capture: true })
    );
  };

  const applyState = (state) => {
    active = !!(state && state.active);
    if (state && state.idleThresholdSeconds) idleThresholdMs = state.idleThresholdSeconds * 1000;
    if (active) {
      lastInput = Date.now();
      wasFullscreen = !!document.fullscreenElement;
      attach();
    } else {
      detach();
    }
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'MONITOR_STATE') applyState(msg);
  });

  // Ask the background worker whether this tab is the registered, monitored exam tab.
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_READY' }, (state) => {
      if (chrome.runtime.lastError) return;
      applyState(state);
    });
  } catch (_) { /* ignore */ }
})();
