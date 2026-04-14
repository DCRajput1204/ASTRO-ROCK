/**
 * extract-frames-server.js
 * Run with: node extract-frames-server.js
 * Starts a local server endpoint that the browser posts frames to,
 * so they get saved directly to public/earth-frames/ without needing
 * the user to download a ZIP.
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const OUT_DIR = path.join(__dirname, 'public', 'earth-frames');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  // CORS — allow requests from the Vite dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Frame-Index');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/save-frame') {
    const idx  = parseInt(req.headers['x-frame-index'] || '0', 10);
    const name = `frame-${String(idx + 1).padStart(3, '0')}.jpg`;
    const file = path.join(OUT_DIR, name);

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      // Body is a data URL: data:image/jpeg;base64,...
      const dataUrl = Buffer.concat(chunks).toString();
      const b64     = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      process.stdout.write(`\r  Saved ${name}  (${Math.round(Buffer.from(b64,'base64').length/1024)}KB)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file: name }));
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/done') {
    const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.jpg'));
    console.log(`\n✅ Done! ${files.length} frames saved to public/earth-frames/`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: files.length }));
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(9999, () => {
  console.log('');
  console.log('=================================================');
  console.log('  Frame Save Server running on port 9999');
  console.log('  Now open: http://localhost:5173/extract-frames.html');
  console.log('  Click "Extract & Save Frames" to begin.');
  console.log('=================================================');
  console.log('');
});
