const editableAssets = Array.from(document.querySelectorAll('.editable-asset'));
const outputAssets = Array.from(document.querySelectorAll('[data-output-path]'));
const outputMap = new Map();
const customizedRegions = new Set();
let logoEasterEggRunning = false;
let lastSlotSoundAt = 0;
let lastAnimatedCustomCount = 0;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function updateCustomCount() {
  const countEl = document.getElementById('custom-count');
  const currentCount = customizedRegions.size;
  if (countEl) {
    countEl.textContent = `${currentCount}/${editableAssets.length}`;
  }

  if (currentCount > lastAnimatedCustomCount) {
    animateUpdatedDownloadButton(currentCount);
  } else if (currentCount < lastAnimatedCustomCount) {
    syncUpdatedDownloadButtonScale(currentCount);
  }

  lastAnimatedCustomCount = currentCount;
}

function calculateGrowthScale(count) {
  const cappedCount = Math.min(count, 20);
  return (1 + (cappedCount * 0.02)).toFixed(3);
}

function syncUpdatedDownloadButtonScale(count) {
  const button = document.getElementById('download-updated-zip');
  if (!button) return;
  button.style.setProperty('--growth-scale', calculateGrowthScale(count));
}

function animateUpdatedDownloadButton(count) {
  const button = document.getElementById('download-updated-zip');
  if (!button) return;

  button.style.setProperty('--growth-scale', calculateGrowthScale(count));
  button.classList.remove('download-growth-pop');
  void button.offsetWidth;
  button.classList.add('download-growth-pop');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function outputFilename(asset) {
  return asset.dataset.outputPath.split('/').pop();
}

function markSlotFilled(asset) {
  if (!asset) return;
  asset.classList.add('slot-filled');
}

function playAudioFile(src, volume = 1) {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.preload = 'auto';

      const done = () => {
        audio.removeEventListener('ended', done);
        audio.removeEventListener('error', done);
        resolve();
      };

      audio.addEventListener('ended', done);
      audio.addEventListener('error', done);

      const start = audio.play();
      if (start && typeof start.then === 'function') {
        start.catch(done);
      }
    } catch {
      resolve();
    }
  });
}

function playSlotDropSound() {
  const now = Date.now();
  if (now - lastSlotSoundAt < 60) return;
  lastSlotSoundAt = now;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const startTime = ctx.currentTime + 0.01;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, startTime);
    osc.frequency.exponentialRampToValueAtTime(660, startTime + 0.08);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.06, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.11);

    window.setTimeout(() => ctx.close().catch(() => {}), 260);
  } catch {
  }
}

async function resizedBlobFromImage(file, width, height, format) {
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
    offsetY = (height - drawHeight) / 2;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
  URL.revokeObjectURL(sourceUrl);
  return blob;
}

async function applyDroppedFile(asset, file) {
  const width = Number(asset.dataset.width);
  const height = Number(asset.dataset.height);
  const format = asset.dataset.format;
  const blob = await resizedBlobFromImage(file, width, height, format);
  outputMap.set(asset.dataset.outputPath, blob);
  asset.src = URL.createObjectURL(blob);
  markSlotFilled(asset);
  customizedRegions.add(asset.dataset.outputPath);
  updateCustomCount();
  playSlotDropSound();
}

async function applyMacIcon(file) {
  const macPngBlob = await resizedBlobFromImage(file, 1024, 1024, 'png');
  outputMap.set('steam-assets/client/mac_icon_1024.png', macPngBlob);

  const macImg = document.querySelector('img[data-output-path="steam-assets/client/mac_icon_1024.png"]');
  if (macImg) {
    macImg.src = URL.createObjectURL(macPngBlob);
    markSlotFilled(macImg);
  }

  customizedRegions.add('steam-assets/client/mac_icon_1024.png');
  updateCustomCount();
  playSlotDropSound();

  try {
    const response = await fetch('/api/generate-icns', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: macPngBlob
    });
    if (response.ok) {
      const icnsBlob = await response.blob();
      outputMap.set('steam-assets/client/mac_icon.icns', icnsBlob);
    }
  } catch {
    console.warn('ICNS regeneration failed; using fallback ICNS if needed.');
  }
}

async function applyLinuxIcon(file) {
  const linuxSizes = [16, 24, 32, 64, 96, 128, 256];
  const linuxZip = new JSZip();
  for (const size of linuxSizes) {
    const pngBlob = await resizedBlobFromImage(file, size, size, 'png');
    linuxZip.file(`linux-icons/icon_${size}x${size}.png`, pngBlob);
  }
  const linuxZipBlob = await linuxZip.generateAsync({ type: 'blob' });
  outputMap.set('steam-assets/client/linux_icons.zip', linuxZipBlob);
  customizedRegions.add('steam-assets/client/linux_icons.zip');
  updateCustomCount();

  const dropZone = document.getElementById('linux-icon-drop');
  if (dropZone) {
    dropZone.textContent = 'Linux ZIP generated. Drop another image to replace it.';
    dropZone.classList.add('linux-dropzone-ready');
  }
}

function playEasterEggSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return Promise.resolve();

  return new Promise((resolve) => {
    try {
      const ctx = new AudioCtx();
      const startTime = ctx.currentTime + 0.02;
      const notes = [523.25, 659.25, 783.99, 1046.5];

      notes.forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const noteStart = startTime + (index * 0.12);
        const noteEnd = noteStart + 0.18;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.08, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteStart);
        osc.stop(noteEnd);
      });

      window.setTimeout(() => {
        ctx.close().catch(() => {});
        resolve();
      }, 1200);
    } catch {
      resolve();
    }
  });
}

function smoothScrollToBottom(durationMs = 7000) {
  return new Promise((resolve) => {
    const startY = window.scrollY;
    const targetY = document.documentElement.scrollHeight - window.innerHeight;
    if (targetY <= startY) {
      resolve();
      return;
    }

    const startTime = performance.now();
    const easeInOut = (value) => (value < 0.5 ? 2 * value * value : 1 - (Math.pow(-2 * value + 2, 2) / 2));

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = easeInOut(progress);
      window.scrollTo({ top: startY + ((targetY - startY) * eased), left: 0, behavior: 'auto' });

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(tick);
  });
}

async function runLogoEasterEgg(file) {
  if (logoEasterEggRunning) return;
  if (!file || !file.type.startsWith('image/')) return;

  logoEasterEggRunning = true;
  const logo = document.querySelector('.site-logo');
  logo?.classList.add('easter-egg-active');

  try {
    await playAudioFile('site-assets/ui-button-click.ogg', 0.9);
    await playEasterEggSound();

    for (const asset of editableAssets) {
      asset.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(260);

      if (asset.id === 'client-master-icon') {
        await applyMacIcon(file);
      } else {
        await applyDroppedFile(asset, file);
      }

      asset.classList.add('slot-pop');
      window.setTimeout(() => asset.classList.remove('slot-pop'), 260);
      await sleep(150);
    }

    const linuxDrop = document.getElementById('linux-icon-drop');
    linuxDrop?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(280);
    await applyLinuxIcon(file);
    linuxDrop?.classList.add('slot-pop');
    window.setTimeout(() => linuxDrop?.classList.remove('slot-pop'), 260);

    await smoothScrollToBottom(2200);
  } finally {
    logo?.classList.remove('easter-egg-active');
    logoEasterEggRunning = false;
  }
}

async function getOutputBlob(path, fallbackUrl) {
  let blob = outputMap.get(path);
  if (blob) return blob;
  if (!fallbackUrl) return null;
  const response = await fetch(fallbackUrl);
  if (!response.ok) return null;
  return await response.blob();
}

function wireAsset(asset) {
  asset.addEventListener('dragover', (event) => {
    event.preventDefault();
    asset.classList.add('drag-over');
  });

  asset.addEventListener('dragleave', () => {
    asset.classList.remove('drag-over');
  });

  asset.addEventListener('drop', async (event) => {
    event.preventDefault();
    asset.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      if (asset.id === 'client-master-icon') {
        await applyMacIcon(file);
      } else {
        await applyDroppedFile(asset, file);
      }
    } catch {
      alert('Could not process dropped image.');
    }
  });

  const button = asset.closest('.card')?.querySelector('.asset-download-btn');
  if (button) {
    button.addEventListener('click', async () => {
      let blob = outputMap.get(asset.dataset.outputPath);
      if (!blob) {
        blob = await (await fetch(asset.src)).blob();
      }
      triggerDownload(blob, outputFilename(asset));
    });
  }
}

function wireLinuxDropZone() {
  const dropZone = document.getElementById('linux-icon-drop');
  if (!dropZone) return;

  const processFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      await applyLinuxIcon(file);
    } catch {
      alert('Could not process dropped image for Linux icons.');
    }
  };

  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    await processFile(file);
  });

  dropZone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      await processFile(file);
    });
    input.click();
  });

  dropZone.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dropZone.click();
    }
  });
}

async function buildUpdatedZip() {
  if (!window.JSZip) {
    alert('ZIP library not loaded.');
    return;
  }

  if (customizedRegions.size === 0) {
    alert('You have not added any custom images yet. Drag images into the asset regions first, then download your custom set.');
    return;
  }

  if (customizedRegions.size < editableAssets.length) {
    const proceed = window.confirm('You have added some custom images, but not all regions are complete. Download partial set now? Missing assets will stay as placeholders.');
    if (!proceed) return;
  }

  const zip = new JSZip();

  for (const asset of outputAssets) {
    const outputPath = asset.dataset.outputPath;
    let blob = outputMap.get(outputPath);
    if (!blob) {
      blob = await (await fetch(asset.src)).blob();
    }
    zip.file(outputPath, blob);
  }

  const macIcnsBlob = await getOutputBlob('steam-assets/client/mac_icon.icns', 'placeholders/client/mac_icon_placeholder.icns');
  if (macIcnsBlob) zip.file('steam-assets/client/mac_icon.icns', macIcnsBlob);

  const linuxZipBlob = await getOutputBlob('steam-assets/client/linux_icons.zip', 'placeholders/client/linux_icons_placeholder.zip');
  if (linuxZipBlob) zip.file('steam-assets/client/linux_icons.zip', linuxZipBlob);

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, 'steamroller-updated-assets.zip');
}

function wireIconDownloadButtons() {
  const buttons = Array.from(document.querySelectorAll('.icon-download-btn'));
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const path = button.dataset.downloadPath;
      const fallbackUrl = button.dataset.fallbackUrl;
      const filename = button.dataset.filename || path.split('/').pop();
      const blob = await getOutputBlob(path, fallbackUrl);
      if (!blob) {
        alert('Could not prepare this file.');
        return;
      }
      triggerDownload(blob, filename);
    });
  }
}

function wireShareButton() {
  const shareBtn = document.getElementById('share-page-btn');
  if (!shareBtn) return;

  shareBtn.addEventListener('click', async () => {
    const shareUrl = window.location.href;
    const shareData = {
      title: 'SteamrollerTool',
      text: 'Steam Assets, Done. Fast.',
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert('Share link copied to clipboard.');
      } else {
        window.prompt('Copy this link:', shareUrl);
      }
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  });
}

function wireLogoEasterEgg() {
  const logo = document.querySelector('.site-logo');
  if (!logo) return;

  logo.addEventListener('dragover', (event) => {
    event.preventDefault();
    logo.classList.add('drag-over');
  });

  logo.addEventListener('dragleave', () => {
    logo.classList.remove('drag-over');
  });

  logo.addEventListener('drop', async (event) => {
    event.preventDefault();
    logo.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    try {
      await runLogoEasterEgg(file);
    } catch {
      alert('Could not process dropped image.');
    }
  });
}

for (const asset of editableAssets) wireAsset(asset);
wireLinuxDropZone();
wireIconDownloadButtons();
wireShareButton();
wireLogoEasterEgg();
updateCustomCount();
document.getElementById('download-updated-zip')?.addEventListener('click', buildUpdatedZip);
