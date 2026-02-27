const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const clientDir = root;
const placeholdersDir = path.join(clientDir, 'placeholders');
const downloadsDir = path.join(clientDir, 'downloads');

const bgColor = '#bebebe';
const textColor = '#464646';
const pad = 18;

const imageAssets = [
  { rel: 'store/header_capsule_placeholder.png', width: 920, height: 430, label: 'Header Capsule', format: 'png' },
  { rel: 'store/small_capsule_placeholder.png', width: 462, height: 174, label: 'Small Capsule', format: 'png' },
  { rel: 'store/main_capsule_placeholder.png', width: 1232, height: 706, label: 'Main Capsule', format: 'png' },
  { rel: 'store/vertical_capsule_placeholder.png', width: 748, height: 896, label: 'Vertical Capsule', format: 'png' },
  { rel: 'screenshots/store_screenshot_01_placeholder.png', width: 1920, height: 1080, label: 'Store Screenshot 01', format: 'png' },
  { rel: 'screenshots/store_screenshot_02_placeholder.png', width: 1920, height: 1080, label: 'Store Screenshot 02', format: 'png' },
  { rel: 'screenshots/store_screenshot_03_placeholder.png', width: 1920, height: 1080, label: 'Store Screenshot 03', format: 'png' },
  { rel: 'screenshots/store_screenshot_04_placeholder.png', width: 1920, height: 1080, label: 'Store Screenshot 04', format: 'png' },
  { rel: 'screenshots/store_screenshot_05_placeholder.png', width: 1920, height: 1080, label: 'Store Screenshot 05', format: 'png' },
  { rel: 'library/library_capsule_placeholder.png', width: 600, height: 900, label: 'Library Capsule', format: 'png' },
  { rel: 'library/library_header_placeholder.png', width: 920, height: 430, label: 'Library Header', format: 'png' },
  { rel: 'library/library_hero_placeholder.png', width: 3840, height: 1240, label: 'Library Hero', format: 'png' },
  { rel: 'library/library_logo_placeholder.png', width: 1280, height: 720, label: 'Library Logo', format: 'png' },
  { rel: 'client/shortcut_icon_512_placeholder.png', width: 512, height: 512, label: 'Shortcut Icon 512 PNG', format: 'png' },
  { rel: 'client/app_icon_184_placeholder.jpg', width: 184, height: 184, label: 'App Icon 184 JPG', format: 'jpg' },
  { rel: 'client/mac_icon_1024_placeholder.png', width: 1024, height: 1024, label: 'Mac Icon 1024 PNG', format: 'png' }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanPlaceholdersDir() {
  fs.rmSync(placeholdersDir, { recursive: true, force: true });
  ensureDir(placeholdersDir);
}

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function writePlaceholderImage(asset) {
  const outPath = path.join(placeholdersDir, asset.rel);
  ensureDir(path.dirname(outPath));

  const sizeText = `${asset.width}x${asset.height}`;
  const fontSize = Math.max(13, Math.round(Math.min(asset.width, asset.height) * 0.045));

  const svg = `
<svg width="${asset.width}" height="${asset.height}" viewBox="0 0 ${asset.width} ${asset.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <text x="${pad}" y="${asset.height - pad}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="${textColor}">${escapeXml(asset.label)}</text>
  <text x="${asset.width - pad}" y="${pad + fontSize}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="${textColor}">${escapeXml(sizeText)}</text>
</svg>`.trim();

  let pipeline = sharp(Buffer.from(svg)).resize(asset.width, asset.height);
  if (asset.format === 'jpg') {
    pipeline = pipeline.jpeg({ quality: 90 });
  } else {
    pipeline = pipeline.png();
  }
  await pipeline.toFile(outPath);
}

function runTool(tool, args, options = {}) {
  execFileSync(tool, args, { stdio: 'ignore', ...options });
}

function buildClientIconPackages() {
  const clientDirOut = path.join(placeholdersDir, 'client');
  const shortcut512 = path.join(clientDirOut, 'shortcut_icon_512_placeholder.png');
  const mac1024 = path.join(clientDirOut, 'mac_icon_1024_placeholder.png');
  const macIcns = path.join(clientDirOut, 'mac_icon_placeholder.icns');

  const iconsetDir = path.join(clientDirOut, 'mac.iconset');
  ensureDir(iconsetDir);
  const iconsetSizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ];

  for (const [filename, size] of iconsetSizes) {
    runTool('sips', ['-z', String(size), String(size), mac1024, '--out', path.join(iconsetDir, filename)]);
  }

  runTool('iconutil', ['-c', 'icns', iconsetDir, '-o', macIcns]);
  fs.rmSync(iconsetDir, { recursive: true, force: true });

  const linuxDir = path.join(clientDirOut, 'linux-icons');
  ensureDir(linuxDir);
  const linuxSizes = [16, 24, 32, 64, 96, 128, 256];
  for (const size of linuxSizes) {
    runTool('sips', ['-z', String(size), String(size), shortcut512, '--out', path.join(linuxDir, `icon_${size}x${size}.png`)]);
  }

  const linuxZip = path.join(clientDirOut, 'linux_icons_placeholder.zip');
  if (fs.existsSync(linuxZip)) fs.unlinkSync(linuxZip);
  runTool('zip', ['-r', linuxZip, 'linux-icons'], { cwd: clientDirOut });

  fs.rmSync(linuxDir, { recursive: true, force: true });
}

function buildPlaceholderBundleZip() {
  ensureDir(downloadsDir);
  const zipOut = path.join(downloadsDir, 'steamroller-placeholder-assets.zip');
  if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);

  runTool('zip', ['-r', zipOut, 'placeholders']);
}

async function main() {
  try {
    process.chdir(clientDir);
    cleanPlaceholdersDir();
    for (const asset of imageAssets) {
      await writePlaceholderImage(asset);
    }
    buildClientIconPackages();
    buildPlaceholderBundleZip();
    console.log('Generated placeholder assets and zip bundle.');
    console.log(`Placeholders: ${placeholdersDir}`);
    console.log(`Bundle: ${path.join(downloadsDir, 'steamroller-placeholder-assets.zip')}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();