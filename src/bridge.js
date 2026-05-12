(() => {
  const KEYS = ['enabled', 'imageDataUrl', 'frameRate', 'width', 'height'];

  function post(state) {
    window.postMessage({
      type: 'VIRTUAL_CAMERA_STATE',
      enabled: !!state.enabled,
      imageDataUrl: state.imageDataUrl || null,
      frameRate: state.frameRate || 30,
      width: state.width || 1280,
      height: state.height || 720
    }, '*');
  }

  function sync() {
    try {
      chrome.storage.local.get(KEYS, (state) => post(state || {}));
    } catch (_) {
      // extension context invalidated; ignore
    }
  }

  sync();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') sync();
    });
  } catch (_) {
    // ignore
  }
})();
