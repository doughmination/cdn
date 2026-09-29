// Upload page. Files go one at a time as raw PUTs to /api/files/<path>; the
// worker checks the SSO session and writes them into the R2 bucket.

const folderInput = document.getElementById("folder");
const folderList = document.getElementById("folders");
const drop = document.getElementById("drop");
const picker = document.getElementById("picker");
const go = document.getElementById("go");
const overwrite = document.getElementById("overwrite");
const summary = document.getElementById("summary");
const queueEl = document.getElementById("queue");

// [{ file, status: "waiting" | "uploading" | "done" | "error", progress, message, url }]
let queue = [];
let busy = false;

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function esc(s) {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function folder() {
  return folderInput.value.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function render() {
  const rows = queue.map((item, i) => {
    let status;
    if (item.status === "uploading") status = `<span class="status">${item.progress}%</span>`;
    else if (item.status === "done") {
      status = `<span class="status ok">done</span>
        <button class="copy" data-url="${esc(item.url)}" title="Copy URL">copy</button>`;
    } else if (item.status === "error") status = `<span class="status err">${esc(item.message)}</span>`;
    else status = busy ? `<span class="status">waiting</span>` : `<button class="remove" data-i="${i}">remove</button>`;

    const name = item.status === "done"
      ? `<a class="name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.file.name)}</a>`
      : `<span class="name">${esc(item.file.name)}</span>`;
    return `<li class="row file">${name}<span class="size">${fmtSize(item.file.size)}</span>${status}</li>`;
  });
  queueEl.innerHTML = rows.join("") || `<li class="row empty">No files picked yet.</li>`;

  const pending = queue.filter((q) => q.status === "waiting" || q.status === "error").length;
  go.disabled = busy || pending === 0;
  go.textContent = pending > 1 ? `Upload ${pending} files` : "Upload";

  const done = queue.filter((q) => q.status === "done").length;
  summary.textContent = done ? `${done} uploaded` : "";
}

function add(files) {
  for (const file of files) {
    // Picking the same name again replaces the earlier pick.
    queue = queue.filter((q) => q.file.name !== file.name || q.status === "done");
    queue.push({ file, status: "waiting", progress: 0, message: "", url: "" });
  }
  render();
}

function put(item) {
  return new Promise((resolve) => {
    const path = folder() ? `${folder()}/${item.file.name}` : item.file.name;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/files/${encodePath(path)}${overwrite.checked ? "?overwrite=1" : ""}`);
    if (item.file.type) xhr.setRequestHeader("Content-Type", item.file.type);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      item.progress = Math.round((e.loaded / e.total) * 100);
      render();
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 201 && body) {
        item.status = "done";
        item.url = body.url;
      } else {
        item.status = "error";
        item.message = (body && body.error) || (xhr.status === 413 ? "Too big for one upload." : `Failed (${xhr.status}).`);
      }
      resolve();
    };
    xhr.onerror = () => {
      item.status = "error";
      item.message = "Network error.";
      resolve();
    };
    item.status = "uploading";
    item.progress = 0;
    render();
    xhr.send(item.file);
  });
}

go.addEventListener("click", async () => {
  busy = true;
  for (const item of queue) {
    if (item.status === "waiting" || item.status === "error") await put(item);
  }
  busy = false;
  render();
  loadFolders();
});

picker.addEventListener("change", () => {
  add(picker.files);
  picker.value = "";
});

for (const type of ["dragenter", "dragover"]) {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
}
for (const type of ["dragleave", "drop"]) {
  drop.addEventListener(type, () => drop.classList.remove("over"));
}
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  add(e.dataTransfer.files);
});

queueEl.addEventListener("click", (e) => {
  const remove = e.target.closest("button.remove");
  if (remove) {
    queue.splice(Number(remove.dataset.i), 1);
    render();
    return;
  }
  const copy = e.target.closest("button.copy");
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.url).then(() => {
      copy.textContent = "copied";
      setTimeout(() => (copy.textContent = "copy"), 1200);
    });
  }
});

// Suggest existing folders.
async function loadFolders() {
  try {
    const data = await (await fetch("/api/list", { cache: "no-store" })).json();
    const dirs = new Set();
    for (const f of data.files || []) {
      const parts = f.path.split("/");
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
    folderList.innerHTML = [...dirs].sort().map((d) => `<option value="${esc(d)}">`).join("");
  } catch {}
}

async function init() {
  // "Upload here" from the browser links to /upload#<folder>.
  const fromHash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  if (fromHash) folderInput.value = fromHash;

  try {
    const me = await (await fetch("/api/me")).json();
    document.getElementById("who").textContent = me ? `@${me.username}` : "nobody";
  } catch {}

  render();
  loadFolders();
}

init();
