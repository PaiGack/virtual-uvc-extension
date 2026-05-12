(() => {
  if (window.__virtualCameraInstalled) return;
  window.__virtualCameraInstalled = true;

  const state = {
    enabled: false,
    imageDataUrl: null,
    frameRate: 30,
    width: 1280,
    height: 720,
    cachedImage: null,
    cachedImageSrc: null
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== 'VIRTUAL_CAMERA_STATE') return;
    state.enabled = !!data.enabled;
    state.imageDataUrl = data.imageDataUrl || null;
    if (typeof data.frameRate === 'number' && data.frameRate > 0) state.frameRate = data.frameRate;
    if (typeof data.width === 'number' && data.width > 0) state.width = data.width;
    if (typeof data.height === 'number' && data.height > 0) state.height = data.height;
    if (state.cachedImageSrc !== state.imageDataUrl) {
      state.cachedImage = null;
      state.cachedImageSrc = null;
    }
  });

  function loadImage(src) {
    if (state.cachedImage && state.cachedImageSrc === src) {
      return Promise.resolve(state.cachedImage);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        state.cachedImage = img;
        state.cachedImageSrc = src;
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  function pickDimension(constraint, fallback) {
    if (!constraint) return fallback;
    if (typeof constraint === 'number') return constraint;
    if (typeof constraint === 'object') {
      return constraint.ideal || constraint.exact || constraint.max || constraint.min || fallback;
    }
    return fallback;
  }

  function wantsVideo(constraints) {
    if (!constraints) return false;
    const v = constraints.video;
    return v === true || (typeof v === 'object' && v !== null);
  }

  async function buildVirtualStream(constraints) {
    const videoConstraint = (constraints && typeof constraints.video === 'object') ? constraints.video : {};
    const img = await loadImage(state.imageDataUrl);

    const width = pickDimension(videoConstraint.width, img.naturalWidth || state.width);
    const height = pickDimension(videoConstraint.height, img.naturalHeight || state.height);
    const frameRate = pickDimension(videoConstraint.frameRate, state.frameRate);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    function drawFit() {
      const current = state.cachedImage || img;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const iw = current.naturalWidth;
      const ih = current.naturalHeight;
      if (!iw || !ih) return;
      const scale = Math.min(canvas.width / iw, canvas.height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;
      ctx.drawImage(current, dx, dy, dw, dh);
    }

    drawFit();
    const intervalId = setInterval(() => {
      if (state.cachedImageSrc !== state.imageDataUrl && state.imageDataUrl) {
        loadImage(state.imageDataUrl).then(drawFit).catch(() => {});
      } else {
        drawFit();
      }
    }, Math.max(33, Math.floor(1000 / frameRate)));

    const stream = canvas.captureStream(frameRate);
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', () => clearInterval(intervalId));
      const origStop = videoTrack.stop.bind(videoTrack);
      videoTrack.stop = function () {
        clearInterval(intervalId);
        origStop();
      };
    }

    if (constraints && constraints.audio && origGetUserMedia) {
      try {
        const audioStream = await origGetUserMedia.call(navigator.mediaDevices, { audio: constraints.audio });
        audioStream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch (_) {
        // fall through without audio
      }
    }

    return stream;
  }

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) return;

  const origGetUserMedia = mediaDevices.getUserMedia ? mediaDevices.getUserMedia.bind(mediaDevices) : null;
  const origEnumerate = mediaDevices.enumerateDevices ? mediaDevices.enumerateDevices.bind(mediaDevices) : null;

  if (origGetUserMedia) {
    mediaDevices.getUserMedia = async function (constraints) {
      if (state.enabled && state.imageDataUrl && wantsVideo(constraints)) {
        try {
          return await buildVirtualStream(constraints);
        } catch (err) {
          console.warn('[VirtualCamera] failed to build virtual stream, falling back:', err);
        }
      }
      return origGetUserMedia(constraints);
    };
  }

  if (origEnumerate) {
    mediaDevices.enumerateDevices = async function () {
      const devices = await origEnumerate();
      if (!state.enabled) return devices;
      const hasVideoInput = devices.some((d) => d.kind === 'videoinput');
      if (hasVideoInput) return devices;
      return [
        ...devices,
        {
          deviceId: 'virtual-camera-fixed-image',
          kind: 'videoinput',
          label: 'Virtual Camera (Fixed Image)',
          groupId: 'virtual-camera-group',
          toJSON() { return this; }
        }
      ];
    };
  }

  const legacyGetUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia;
  if (legacyGetUserMedia) {
    const wrapped = function (constraints, success, error) {
      if (state.enabled && state.imageDataUrl && wantsVideo(constraints)) {
        buildVirtualStream(constraints).then(success, error);
        return;
      }
      legacyGetUserMedia.call(navigator, constraints, success, error);
    };
    navigator.getUserMedia = wrapped;
    if (navigator.webkitGetUserMedia) navigator.webkitGetUserMedia = wrapped;
    if (navigator.mozGetUserMedia) navigator.mozGetUserMedia = wrapped;
  }
})();
