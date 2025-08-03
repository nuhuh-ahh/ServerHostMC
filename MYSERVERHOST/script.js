const form = document.getElementById('create-form');
const serverList = document.getElementById('servers');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('server-name').value;
  const version = document.getElementById('version').value;
  const type = document.getElementById('type').value;

  const res = await fetch('https://your-backend.onrender.com/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, version, type })
  });

  const data = await res.json();
  alert(data.message);
  loadServers();
});

async function loadServers() {
  const res = await fetch('https://your-backend.onrender.com/servers');
  const servers = await res.json();
  serverList.innerHTML = '';
  servers.forEach(server => {
    const li = document.createElement('li');
    li.textContent = `${server.name} (${server.version} - ${server.type})`;
    serverList.appendChild(li);
  });
}

loadServers();
