const editableAssets = Array.from(document.querySelectorAll('.editable-asset'));
const outputAssets = Array.from(document.querySelectorAll('[data-output-path]'));
const outputMap = new Map();
const customizedRegions = new Set();

function updateCustomCount() {
  const countEl = document.getElementById('custom-count');
  if (!countEl) return;
  countEl.textContent = `${customizedRegions.size}/${editableAssets.length}`;
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
  customizedRegions.add(asset.dataset.outputPath);
  updateCustomCount();
}

async function applyMacIcon(file) {
  const macPngBlob = await resizedBlobFromImage(file, 1024, 1024, 'png');
  outputMap.set('steam-assets/client/mac_icon_1024.png', macPngBlob);

  const macImg = document.querySelector('img[data-output-path="steam-assets/client/mac_icon_1024.png"]');
  if (macImg) {
    macImg.src = URL.createObjectURL(macPngBlob);
  }

  customizedRegions.add('steam-assets/client/mac_icon_1024.png');
  updateCustomCount();

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

for (const asset of editableAssets) wireAsset(asset);
wireLinuxDropZone();
wireIconDownloadButtons();
wireShareButton();
updateCustomCount();
document.getElementById('download-updated-zip')?.addEventListener('click', buildUpdatedZip);
