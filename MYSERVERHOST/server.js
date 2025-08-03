const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const serversDir = path.join(__dirname, 'servers');
if (!fs.existsSync(serversDir)) fs.mkdirSync(serversDir);

app.post('/create', (req, res) => {
  const { name, version, type } = req.body;
  const folder = path.join(serversDir, name);
  if (fs.existsSync(folder)) return res.json({ message: 'Server already exists' });
  fs.mkdirSync(folder);
  // Here you'd download server.jar from Mojang or Forge/Fabric, but just placeholder now
  fs.writeFileSync(path.join(folder, 'info.txt'), `version=${version}\ntype=${type}`);
  res.json({ message: 'Server created!' });
});

app.get('/servers', (req, res) => {
  const serverNames = fs.readdirSync(serversDir);
  const servers = serverNames.map(name => {
    const file = path.join(serversDir, name, 'info.txt');
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      const version = lines.find(l => l.startsWith('version=')).split('=')[1];
      const type = lines.find(l => l.startsWith('type=')).split('=')[1];
      return { name, version, type };
    }
    return { name, version: 'unknown', type: 'unknown' };
  });
  res.json(servers);
});

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
