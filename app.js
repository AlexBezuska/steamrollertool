const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { execFileSync } = require('child_process');

const port = Number(process.env.PORT || 8092);
const rootDir = __dirname;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.icns': 'image/icns',
  '.zip': 'application/zip',
  '.ttf': 'font/ttf'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function parseRawBody(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(Object.assign(new Error('Payload Too Large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (error) => reject(error));
  });
}

async function generateIcnsFromPngBuffer(buffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamroller-icns-'));
  const sourcePng = path.join(tmpDir, 'master_1024.png');
  const icnsPath = path.join(tmpDir, 'icon.icns');

  try {
    await sharp(buffer)
      .resize(1024, 1024, { fit: 'cover' })
      .png()
      .toFile(sourcePng);

    const sizes = [16, 32, 48, 128, 256, 512];
    const iconFiles = [];

    for (const size of sizes) {
      const out = path.join(tmpDir, `icon_${size}x${size}.png`);
      await sharp(sourcePng).resize(size, size, { fit: 'cover' }).png().toFile(out);
      iconFiles.push(out);
    }

    execFileSync('png2icns', [icnsPath, ...iconFiles], { stdio: 'ignore' });
    return fs.readFileSync(icnsPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function handleRequest(req, res) {
  const requestPath = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && requestPath === '/api/generate-icns') {
    try {
      const sourceBuffer = await parseRawBody(req);
      const icnsBuffer = await generateIcnsFromPngBuffer(sourceBuffer);
      send(res, 200, icnsBuffer, 'image/icns');
    } catch (error) {
      const status = error.statusCode || 500;
      send(res, status, status === 500 ? `ICNS generation failed: ${error.message}` : error.message);
    }
    return;
  }

  const normalizedPath = decodeURIComponent(requestPath === '/' ? '/index.html' : requestPath);
  const filePath = path.normalize(path.join(rootDir, normalizedPath));

  if (!filePath.startsWith(rootDir)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, err.code === 'ENOENT' ? 404 : 500, err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, contentTypes[ext] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    send(res, 500, `Server Error: ${error.message}`);
  });
});

server.listen(port, () => {
  console.log(`SteamrollerTool running at http://localhost:${port}`);
});
