const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const BASE = __dirname;
const FILES_DIR = path.join(BASE, 'files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR);

// store running process info: { serverName: { pid, logPath } }
const running = {};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(BASE, 'tmp_uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
});
const upload = multer({ storage });
if (!fs.existsSync(path.join(BASE, 'tmp_uploads'))) fs.mkdirSync(path.join(BASE, 'tmp_uploads'));

// ------------------ Helpers ------------------
function serverFolder(name) {
  return path.join(FILES_DIR, name);
}

function ensureServer(name) {
  const f = serverFolder(name);
  if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true });
  const plugins = path.join(f, 'plugins');
  const mods = path.join(f, 'mods');
  if (!fs.existsSync(plugins)) fs.mkdirSync(plugins);
  if (!fs.existsSync(mods)) fs.mkdirSync(mods);
  return f;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to download: ' + res.status);
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

// ------------------ Routes ------------------
// serve index
app.get('/', (req, res) => res.sendFile(path.join(BASE, 'public', 'index.html')));

// list servers
app.get('/api/servers', (req, res) => {
  const names = fs.readdirSync(FILES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);
  const list = names.map(name => {
    const folder = serverFolder(name);
    const jar = fs.existsSync(path.join(folder, 'server.jar')) ? 'server.jar' : null;
    return { name, jar, running: !!running[name] };
  });
  res.json(list);
});

// create server (vanilla/paper support for demo)
app.post('/api/create', async (req, res) => {
  try {
    const { name, version, type } = req.body;
    if (!name) return res.status(400).json({ error: 'missing name' });
    const folder = ensureServer(name);
    if (type === 'vanilla') {
      const manifest = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json').then(r => r.json());
      const verObj = manifest.versions.find(v => v.id === version) || manifest.versions.find(v => v.id === manifest.latest.release);
      if (!verObj) return res.status(404).json({ error: 'version not found' });
      const verData = await fetch(verObj.url).then(r => r.json());
      const serverUrl = verData.downloads && verData.downloads.server && verData.downloads.server.url;
      if (!serverUrl) return res.status(500).json({ error: 'server URL not found in manifest' });
      await downloadFile(serverUrl, path.join(folder, 'server.jar'));
      fs.writeFileSync(path.join(folder, 'eula.txt'), 'eula=true');
      return res.json({ ok: true, message: 'vanilla server.jar downloaded' });
    } else if (type === 'paper') {
      const paperMeta = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`).then(r=> {
        if (!r.ok) throw new Error('paper version not found');
        return r.json();
      });
      const builds = paperMeta.builds;
      const build = builds[builds.length - 1];
      const jarUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/paper-${version}-${build}.jar`;
      await downloadFile(jarUrl, path.join(folder, 'server.jar'));
      fs.writeFileSync(path.join(folder, 'eula.txt'), 'eula=true');
      return res.json({ ok: true, message: 'paper server.jar downloaded' });
    } else {
      return res.status(400).json({ error: 'type not supported in demo' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// start server
app.post('/api/start', (req, res) => {
  const { name, xmx } = req.body;
  if (!name) return res.status(400).json({ error: 'missing name' });
  const folder = serverFolder(name);
  if (!fs.existsSync(folder)) return res.status(404).json({ error: 'server not found' });
  const jar = path.join(folder, 'server.jar');
  if (!fs.existsSync(jar)) return res.status(404).json({ error: 'server.jar not found' });
  if (running[name]) return res.status(400).json({ error: 'already running' });

  const logPath = path.join(folder, 'latest.log');
  const out = fs.openSync(logPath, 'a');
  const mem = xmx || '1G';
  const proc = spawn('java', ['-Xmx' + mem, '-jar', 'server.jar', 'nogui'], {
    cwd: folder,
    stdio: ['ignore', out, out],
    detached: true
  });
  proc.unref();
  running[name] = { pid: proc.pid, logPath };
  fs.writeFileSync(path.join(folder, 'run.pid'), String(proc.pid));
  console.log(`Started ${name} pid=${proc.pid}`);
  res.json({ ok: true, pid: proc.pid });
});

// stop server (kill by pid)
app.post('/api/stop', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'missing name' });
  const info = running[name];
  if (!info) return res.status(400).json({ error: 'not running' });
  try {
    process.kill(info.pid, 'SIGTERM');
    delete running[name];
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// stream log via SSE (simple tail)
app.get('/api/log/:name', (req, res) => {
  const name = req.params.name;
  const folder = serverFolder(name);
  const logPath = path.join(folder, 'latest.log');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let pos = 0;
  const send = () => {
    if (!fs.existsSync(logPath)) return;
    const stat = fs.statSync(logPath);
    if (stat.size > pos) {
      const stream = fs.createReadStream(logPath, { start: pos, end: stat.size });
      let chunk = '';
      stream.on('data', c => chunk += c.toString());
      stream.on('end', () => {
        pos = stat.size;
        res.write(`data: ${chunk}\n\n`);
      });
    }
  };
  const interval = setInterval(send, 1000);
  req.on('close', () => clearInterval(interval));
});

// upload plugin/mod via file upload (placed into plugins or mods)
app.post('/api/upload/:name/:type', upload.single('file'), (req, res) => {
  const { name, type } = req.params; // type: plugins or mods or files
  if (!name) return res.status(400).json({ error: 'missing name' });
  const folder = ensureServer(name);
  const targetDir = type === 'mods' ? path.join(folder, 'mods') : type === 'files' ? folder : path.join(folder, 'plugins');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
  const tmpPath = req.file.path;
  const dest = path.join(targetDir, req.file.originalname);
  fs.rename(tmpPath, dest, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, path: dest });
  });
});

// download file from url into server files (used by iframe 'download' button)
app.post('/api/fetch-url', async (req, res) => {
  try {
    const { name, url, target } = req.body; // target: 'plugins'|'mods'|'files'
    if (!name || !url) return res.status(400).json({ error: 'missing params' });
    const folder = ensureServer(name);
    const targetDir = target === 'mods' ? path.join(folder, 'mods') : target === 'plugins' ? path.join(folder, 'plugins') : folder;
    const filename = path.basename(url.split('?')[0]);
    const dest = path.join(targetDir, filename);
    await downloadFile(url, dest);
    return res.json({ ok: true, dest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// list files for a server
app.get('/api/files/:name', (req, res) => {
  const name = req.params.name;
  const folder = serverFolder(name);
  if (!fs.existsSync(folder)) return res.status(404).json({ error: 'not found' });
  const items = [];
  function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(f => {
      const full = path.join(dir, f);
      const rel = path.relative(folder, full);
      const stat = fs.statSync(full);
      items.push({ name: rel, isDir: stat.isDirectory(), size: stat.size });
      if (stat.isDirectory()) walk(full);
    });
  }
  walk(folder);
  res.json(items);
});

// download a file
app.get('/download/:name/*', (req, res) => {
  const name = req.params.name;
  const rel = req.params[0];
  const folder = serverFolder(name);
  const full = path.join(folder, rel);
  if (!full.startsWith(folder)) return res.status(403).end();
  if (!fs.existsSync(full)) return res.status(404).end();
  res.download(full);
});

// delete file
app.delete('/api/file/:name/*', (req, res) => {
  const name = req.params.name;
  const rel = req.params[0];
  const folder = serverFolder(name);
  const full = path.join(folder, rel);
  if (!full.startsWith(folder)) return res.status(403).end();
  if (!fs.existsSync(full)) return res.status(404).end();
  fs.unlinkSync(full);
  res.json({ ok: true });
});

// fallback - serve SPA index for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(BASE, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server listening ${PORT}`));
