const backend = ""; // VD: https://yourapp.onrender.com

document.getElementById("form").onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value;
  const version = document.getElementById("version").value;
  const type = document.getElementById("type").value;
  const crack = document.getElementById("crack").checked;

  await fetch(backend + "/create-server", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, version, type, crack }),
  });
};

async function start() {
  const name = document.getElementById("name").value;
  await fetch(backend + "/start-server", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function stop() {
  const name = document.getElementById("name").value;
  await fetch(backend + "/stop-server", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function uploadPlugin() {
  const file = document.getElementById("plugin").files[0];
  const name = document.getElementById("name").value;
  const form = new FormData();
  form.append("plugin", file);
  await fetch(backend + "/upload-plugin/" + name, {
    method: "POST",
    body: form,
  });
}
