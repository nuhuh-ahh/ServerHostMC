const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const SERVER_FOLDER = path.join(__dirname, 'servers');
if (!fs.existsSync(SERVER_FOLDER)) fs.mkdirSync(SERVER_FOLDER);

const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/create-server', async (req, res) => {
  const { name, version, type, crack } = req.body;
  const folder = path.join(SERVER_FOLDER, name);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder);
  const serverJar = path.join(folder, 'server.jar');

  let url = '';
  if (type === 'vanilla') {
    url = `https://piston-meta.mojang.com/v1/packages/${version}/server.jar`; // placeholder
  } else if (type === 'fabric') {
    url = `https://meta.fabricmc.net/v2/versions/loader/${version}/server/json`; // placeholder
  } else {
    return res.status(400).json({ error: 'Unsupported type' });
  }

  try {
    const jarFile = fs.createWriteStream(serverJar);
    const response = await fetch(url);
    response.body.pipe(jarFile);
    response.body.on('end', () => {
      fs.writeFileSync(path.join(folder, 'eula.txt'), 'eula=true');
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

app.post('/start-server', (req, res) => {
  const name = req.body.name;
  const folder = path.join(SERVER_FOLDER, name);
  if (!fs.existsSync(folder)) return res.status(404).json({ error: 'Server not found' });

  const logPath = path.join(folder, 'latest.log');
  const process = exec(`cd ${folder} && java -Xmx1G -jar server.jar nogui`);
  process.stdout.pipe(fs.createWriteStream(logPath));
  res.json({ success: true });
});

app.post('/stop-server', (req, res) => {
  // Tạm thời đơn giản hoá, Hoà cần plugin RCON nếu muốn stop từ xa
  res.json({ message: 'Stop command not implemented yet' });
});

app.post('/upload-plugin/:name', upload.single('plugin'), (req, res) => {
  const name = req.params.name;
  const file = req.file;
  const dest = path.join(SERVER_FOLDER, name, 'plugins');
  if (!fs.existsSync(dest)) fs.mkdirSync(dest);
  fs.renameSync(file.path, path.join(dest, file.originalname));
  res.json({ uploaded: true });
});

app.use((req, res) => {
  res.status(404).send('Trang không tồn tại');
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
