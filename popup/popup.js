const el = {
  enabled: document.getElementById('enabled'),
  file: document.getElementById('file'),
  delete: document.getElementById('delete'),
  clearAll: document.getElementById('clearAll'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  counter: document.getElementById('counter'),
  preview: document.getElementById('preview'),
  placeholder: document.getElementById('placeholder'),
  resolution: document.getElementById('resolution'),
  frameRate: document.getElementById('frameRate')
};

const MAX_DIMENSION = 1920;
const MAX_HISTORY = 10;

const store = {
  images: [],
  currentId: null
};

function currentImage() {
  if (!store.currentId) return null;
  return store.images.find((img) => img.id === store.currentId) || null;
}

function currentIndex() {
  if (!store.currentId) return -1;
  return store.images.findIndex((img) => img.id === store.currentId);
}

function render() {
  const img = currentImage();
  if (img) {
    el.preview.src = img.dataUrl;
    el.preview.hidden = false;
    el.placeholder.hidden = true;
  } else {
    el.preview.removeAttribute('src');
    el.preview.hidden = true;
    el.placeholder.hidden = false;
  }

  const total = store.images.length;
  const idx = currentIndex();
  const hasMultiple = total > 1;
  el.prev.hidden = !hasMultiple;
  el.next.hidden = !hasMultiple;
  el.counter.hidden = total === 0;
  if (total > 0) el.counter.textContent = `${idx + 1} / ${total}`;
  el.prev.disabled = !hasMultiple;
  el.next.disabled = !hasMultiple;
  el.delete.disabled = total === 0;
  el.clearAll.disabled = total === 0;
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
  if (w <= MAX_DIMENSION && h <= MAX_DIMENSION) {
    return { dataUrl: originalDataUrl, width: w, height: h };
  }
  const scale = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height
  };
}

function resolutionToWH(value, fallbackW, fallbackH) {
  if (value === 'auto') return { width: fallbackW || 1280, height: fallbackH || 720 };
  const [w, h] = value.split('x').map(Number);
  return { width: w, height: h };
}

async function persistCurrent() {
  const img = currentImage();
  const partial = {
    images: store.images,
    currentImageId: store.currentId
  };
  if (img) {
    const { width, height } = resolutionToWH(el.resolution.value, img.width, img.height);
    partial.imageDataUrl = img.dataUrl;
    partial.width = width;
    partial.height = height;
  } else {
    partial.imageDataUrl = null;
  }
  await chrome.storage.local.set(partial);
}

async function loadInitialState() {
  const state = await chrome.storage.local.get([
    'enabled', 'images', 'currentImageId', 'imageDataUrl', 'resolution', 'frameRate'
  ]);
  el.enabled.checked = !!state.enabled;
  if (state.resolution) el.resolution.value = state.resolution;
  if (state.frameRate) el.frameRate.value = String(state.frameRate);

  if (Array.isArray(state.images) && state.images.length > 0) {
    store.images = state.images;
    store.currentId = state.currentImageId && store.images.some((i) => i.id === state.currentImageId)
      ? state.currentImageId
      : store.images[store.images.length - 1].id;
  } else if (state.imageDataUrl) {
    const migrated = {
      id: makeId(),
      dataUrl: state.imageDataUrl,
      width: state.width || 0,
      height: state.height || 0
    };
    store.images = [migrated];
    store.currentId = migrated.id;
    await persistCurrent();
  }
  render();
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function addImageFromFile(file) {
  const { img, originalDataUrl } = await readFileAsImage(file);
  const { dataUrl, width, height } = downscale(img, originalDataUrl);
  const entry = { id: makeId(), dataUrl, width, height };
  store.images.push(entry);
  while (store.images.length > MAX_HISTORY) store.images.shift();
  store.currentId = entry.id;
}

function step(delta) {
  if (store.images.length < 2) return;
  const idx = currentIndex();
  if (idx < 0) {
    store.currentId = store.images[0].id;
  } else {
    const n = store.images.length;
    const next = (idx + delta + n) % n;
    store.currentId = store.images[next].id;
  }
}

el.enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: el.enabled.checked });
});

el.file.addEventListener('change', async () => {
  const files = el.file.files ? Array.from(el.file.files) : [];
  if (files.length === 0) return;
  try {
    for (const file of files) {
      await addImageFromFile(file);
    }
    await persistCurrent();
    render();
  } catch (err) {
    alert('图片加载失败: ' + (err && err.message ? err.message : err));
  } finally {
    el.file.value = '';
  }
});

el.prev.addEventListener('click', async () => {
  step(-1);
  await persistCurrent();
  render();
});

el.next.addEventListener('click', async () => {
  step(1);
  await persistCurrent();
  render();
});

el.delete.addEventListener('click', async () => {
  if (store.images.length === 0) return;
  const idx = currentIndex();
  store.images.splice(idx, 1);
  if (store.images.length === 0) {
    store.currentId = null;
  } else {
    const nextIdx = Math.min(idx, store.images.length - 1);
    store.currentId = store.images[nextIdx].id;
  }
  await persistCurrent();
  render();
});

el.clearAll.addEventListener('click', async () => {
  store.images = [];
  store.currentId = null;
  await persistCurrent();
  render();
});

el.resolution.addEventListener('change', async () => {
  const img = currentImage();
  const fallbackW = img ? img.width : 1280;
  const fallbackH = img ? img.height : 720;
  const { width, height } = resolutionToWH(el.resolution.value, fallbackW, fallbackH);
  await chrome.storage.local.set({ resolution: el.resolution.value, width, height });
});

el.frameRate.addEventListener('change', () => {
  chrome.storage.local.set({ frameRate: Number(el.frameRate.value) });
});

document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (e.key === 'ArrowLeft') { el.prev.click(); }
  else if (e.key === 'ArrowRight') { el.next.click(); }
});

loadInitialState();
