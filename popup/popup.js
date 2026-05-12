const el = {
  enabled: document.getElementById('enabled'),
  file: document.getElementById('file'),
  clear: document.getElementById('clear'),
  preview: document.getElementById('preview'),
  placeholder: document.getElementById('placeholder'),
  resolution: document.getElementById('resolution'),
  frameRate: document.getElementById('frameRate')
};

const MAX_DIMENSION = 1920;

function showPreview(dataUrl) {
  if (dataUrl) {
    el.preview.src = dataUrl;
    el.preview.hidden = false;
    el.placeholder.hidden = true;
  } else {
    el.preview.removeAttribute('src');
    el.preview.hidden = true;
    el.placeholder.hidden = false;
  }
}

function readFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, originalDataUrl: reader.result });
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function downscale(img, originalDataUrl) {
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w <= MAX_DIMENSION && h <= MAX_DIMENSION) return originalDataUrl;
  const scale = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function loadInitialState() {
  const state = await chrome.storage.local.get(['enabled', 'imageDataUrl', 'resolution', 'frameRate']);
  el.enabled.checked = !!state.enabled;
  if (state.imageDataUrl) showPreview(state.imageDataUrl);
  if (state.resolution) el.resolution.value = state.resolution;
  if (state.frameRate) el.frameRate.value = String(state.frameRate);
}

function resolutionToWH(value, fallbackW, fallbackH) {
  if (value === 'auto') return { width: fallbackW || 1280, height: fallbackH || 720 };
  const [w, h] = value.split('x').map(Number);
  return { width: w, height: h };
}

async function persist(partial) {
  await chrome.storage.local.set(partial);
}

el.enabled.addEventListener('change', () => {
  persist({ enabled: el.enabled.checked });
});

el.file.addEventListener('change', async () => {
  const file = el.file.files && el.file.files[0];
  if (!file) return;
  try {
    const { img, originalDataUrl } = await readFileAsImage(file);
    const dataUrl = downscale(img, originalDataUrl);
    showPreview(dataUrl);
    const { width, height } = resolutionToWH(el.resolution.value, img.naturalWidth, img.naturalHeight);
    await persist({
      imageDataUrl: dataUrl,
      resolution: el.resolution.value,
      frameRate: Number(el.frameRate.value),
      width,
      height
    });
  } catch (err) {
    alert('图片加载失败: ' + (err && err.message ? err.message : err));
  } finally {
    el.file.value = '';
  }
});

el.clear.addEventListener('click', async () => {
  showPreview(null);
  await chrome.storage.local.remove(['imageDataUrl']);
});

el.resolution.addEventListener('change', async () => {
  const state = await chrome.storage.local.get(['imageDataUrl']);
  let fallbackW = 1280, fallbackH = 720;
  if (el.resolution.value === 'auto' && state.imageDataUrl) {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = state.imageDataUrl;
    });
    fallbackW = img.naturalWidth;
    fallbackH = img.naturalHeight;
  }
  const { width, height } = resolutionToWH(el.resolution.value, fallbackW, fallbackH);
  await persist({ resolution: el.resolution.value, width, height });
});

el.frameRate.addEventListener('change', () => {
  persist({ frameRate: Number(el.frameRate.value) });
});

loadInitialState();
