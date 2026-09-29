// Directory browser. Reads /api/list (every object in the R2 bucket) and
// renders folder navigation via the URL hash, e.g. #/f/Comic-Code.

const listing = document.getElementById("listing");
const crumbs = document.getElementById("crumbs");
const folderbar = document.getElementById("folderbar");
const filter = document.getElementById("filter");
const fcount = document.getElementById("fcount");

let FILES = []; // [{ path, size }]
let CAN_UPLOAD = false;

// Small blocky stroke icons — replacing the old folder/file/upload emoji.
const ICON_STYLE = 'style="vertical-align:-2px;margin-right:0.35em"';
const ICON_FOLDER = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" ${ICON_STYLE}><path d="M3 6h6l2 3h10v11H3V6z"/></svg>`;
const ICON_FILE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" ${ICON_STYLE}><path d="M5 2h10l4 4v16H5V2z"/><path d="M15 2v4h4"/></svg>`;
const ICON_UPLOAD = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" ${ICON_STYLE}><path d="M12 17V4M7 9l5-5 5 5M4 21h16"/></svg>`;

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Current folder path from the hash, e.g. "f/Comic-Code" ("" = root).
function currentPath() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  return raw.replace(/\/+$/, "");
}

// Immediate children (folders + files) of the given prefix.
function childrenOf(prefix) {
  const base = prefix ? prefix + "/" : "";
  const folders = new Set();
  const files = [];
  for (const f of FILES) {
    if (!f.path.startsWith(base)) continue;
    const rest = f.path.slice(base.length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      files.push({ name: rest, path: f.path, size: f.size });
    } else {
      folders.add(rest.slice(0, slash));
    }
  }
  return {
    folders: [...folders].sort((a, b) => a.localeCompare(b)),
    files: files.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function renderCrumbs(prefix) {
  const parts = prefix ? prefix.split("/") : [];
  let acc = "";
  const links = [`<a href="#/">cdn</a>`];
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    links.push(`<a href="#/${encodeURI(acc)}">${p}</a>`);
  }
  crumbs.innerHTML = links.join('<span class="sep">/</span>');
}

function render() {
  const prefix = currentPath();
  renderCrumbs(prefix);
  const { folders, files } = childrenOf(prefix);
  const q = filter.value.trim().toLowerCase();

  // Uploaders get a shortcut to the upload page, aimed at this folder.
  folderbar.innerHTML = CAN_UPLOAD
    ? `<a class="folderbtn" href="/upload#${encodeURI(prefix)}">${ICON_UPLOAD}Upload here</a>`
    : "";

  const rows = [];

  for (const name of folders) {
    if (q && !name.toLowerCase().includes(q)) continue;
    const target = prefix ? `${prefix}/${name}` : name;
    rows.push(
      `<li class="row folder">
        <a class="name" href="#/${encodeURI(target)}">${ICON_FOLDER}${name}/</a>
      </li>`,
    );
  }

  for (const f of files) {
    if (q && !f.name.toLowerCase().includes(q)) continue;
    const url = `/${encodeURI(f.path)}`;
    rows.push(
      `<li class="row file">
        <a class="name" href="${url}" target="_blank" rel="noopener">${ICON_FILE}${f.name}</a>
        <span class="size">${fmtSize(f.size)}</span>
        <button class="copy" data-path="${f.path}" title="Copy URL">copy</button>
      </li>`,
    );
  }

  listing.innerHTML =
    rows.join("") || `<li class="row empty">Nothing here.</li>`;
}

listing.addEventListener("click", (e) => {
  const btn = e.target.closest("button.copy");
  if (!btn) return;
  const url = `${location.origin}/${btn.dataset.path}`;
  navigator.clipboard?.writeText(url).then(() => {
    const was = btn.textContent;
    btn.textContent = "copied";
    setTimeout(() => (btn.textContent = was), 1200);
  });
});

filter.addEventListener("input", render);
window.addEventListener("hashchange", () => {
  filter.value = "";
  render();
});

async function init() {
  fcount.textContent = "loading… · ";
  try {
    const [res, me] = await Promise.all([
      fetch("/api/list", { cache: "no-cache" }),
      fetch("/api/me").then((r) => r.json()).catch(() => null),
    ]);
    const data = await res.json();
    CAN_UPLOAD = Boolean(me);
    FILES = data.files || [];
    const count = data.count ?? FILES.length;
    fcount.textContent =
      `${count} files · © ${new Date().getFullYear()} · assets may move without notice · `;
    render();
  } catch {
    fcount.textContent = "";
    listing.innerHTML =
      `<li class="row empty">Couldn't load the file list.</li>`;
  }
}

init();
