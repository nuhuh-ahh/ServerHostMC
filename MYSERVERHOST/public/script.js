const api = '';// if hosted on same origin leave empty

function $(id){return document.getElementById(id)}
function show(name){document.querySelectorAll('.page').forEach(p=>p.style.display='none');$(name).style.display='block';}

async function refreshServers(){
  const res = await fetch(api + '/api/servers');
  const list = await res.json();
  const sl = $('serverList'); sl.innerHTML='';
  const fs = $('fileServer'); fs.innerHTML='';
  const ps = $('pluginServer'); ps.innerHTML='';
  const cs = $('consoleServer'); cs.innerHTML='';
  const ss = $('settingsServer'); ss.innerHTML='';
  list.forEach(s => {
    const li = document.createElement('li'); li.textContent = s.name + (s.running? ' (running)':''); sl.appendChild(li);
    [fs,ps,cs,ss].forEach(sel => { const opt = document.createElement('option'); opt.value = s.name; opt.textContent = s.name; sel.appendChild(opt); });
  });
}

$('createForm').onsubmit = async (e)=>{
  e.preventDefault();
  const name = $('sname').value.trim();
  const version = $('sversion').value.trim();
  const type = $('stype').value;
  if(!name) return alert('need name');
  const res = await fetch(api + '/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,version,type})});
  const j = await res.json();
  alert(JSON.stringify(j));
  refreshServers();
}

$('startBtn').onclick = async ()=>{
  const name = $('sname').value.trim();
  const mem = $('xmx').value.trim() || '1G';
  await fetch(api + '/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,xmx:mem})});
  setTimeout(refreshServers,1000);
}
$('stopBtn').onclick = async ()=>{
  const name = $('sname').value.trim();
  await fetch(api + '/api/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  setTimeout(refreshServers,1000);
}

$('uploadFileBtn')?.addEventListener('click', async ()=>{
  const f = $('fileUpload').files[0];
  const name = $('fileServer').value;
  if(!f) return alert('choose file');
  const form = new FormData(); form.append('file', f);
  await fetch(api + '/api/upload/' + name + '/files', { method:'POST', body: form });
  alert('uploaded');
});

$('fetchUrlBtn').onclick = async ()=>{
  const name = $('pluginServer').value;
  const url = $('externalUrl').value.trim();
  const target = $('pluginTarget').value;
  if(!name || !url) return alert('select server and url');
  const res = await fetch(api + '/api/fetch-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,url,target})});
  alert('done: ' + JSON.stringify(await res.json()));
}

// console SSE
let eventSource = null;
$('consoleServer').addEventListener('change', ()=>{
  if(eventSource) eventSource.close();
  const name = $('consoleServer').value;
  const pre = $('consoleLog'); pre.textContent='';
  if(!name) return;
  eventSource = new EventSource((api||'') + '/api/log/' + name);
  eventSource.onmessage = e=>{ pre.textContent += e.data + '
'; pre.scrollTop = pre.scrollHeight; }
});

// settings apply (only online-mode example)
$('applySettings')?.addEventListener('click', async ()=>{
  const name = $('settingsServer').value;
  const crack = $('crackMode').checked;
  if(!name) return alert('select');
  // modify server.properties
  await fetch(api + '/api/files/' + name);
  // for demo we'll write server.properties via fetch-url with data URL
  const content = 'online-mode=' + (!crack) + '
';
  const blob = new Blob([content]);
  const fd = new FormData(); fd.append('file', blob, 'server.properties');
  await fetch('/api/upload/' + name + '/files', { method: 'POST', body: fd });
  alert('applied');
});

// initial
refreshServers();

// small helper to download listed files in Files page
$('fileServer').addEventListener('change', async ()=>{
  const name = $('fileServer').value; if(!name) return;
  const res = await fetch(api + '/api/files/' + name); const files = await res.json();
  const wrap = $('fileList'); wrap.innerHTML = '';
  files.forEach(f=>{
    const el = document.createElement('div');
    el.textContent = f.name + (f.isDir? ' [dir]':'') + ' ' + f.size + ' bytes';
    if(!f.isDir) { const a = document.createElement('a'); a.href = '/download/' + name + '/' + encodeURIComponent(f.name); a.textContent = ' Download'; a.style.marginLeft='10px'; el.appendChild(a);} 
    wrap.appendChild(el);
  });
});

// show home by default
show('home');
