<script lang="ts">
  // Upload page. Files go one at a time as raw PUTs to /api/files/<path>; the
  // worker checks the SSO session and writes them into the R2 bucket.

  import { allFolders, copyText, encodePath, fetchList, fetchMe, fmtSize } from "../lib/files";

  interface Item {
    file: File;
    status: "waiting" | "uploading" | "done" | "error";
    progress: number;
    message: string;
    url: string;
  }

  // "Upload here" from the browser links to /upload?folder=<folder>.
  let folderInput = $state(new URLSearchParams(location.search).get("folder") ?? "");
  let overwrite = $state(false);
  let queue = $state<Item[]>([]);
  let busy = $state(false);
  let over = $state(false);
  let who = $state("…");
  let suggestions = $state<string[]>([]);

  const folder = $derived(folderInput.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/"));
  const pending = $derived(queue.filter((q) => q.status === "waiting" || q.status === "error").length);
  const done = $derived(queue.filter((q) => q.status === "done").length);

  fetchMe().then((me) => (who = me ? `@${me.username}` : "nobody"));
  loadFolders();

  // Suggest existing folders.
  async function loadFolders() {
    try {
      suggestions = allFolders((await fetchList(true)).files);
    } catch {}
  }

  function add(files: FileList | null | undefined) {
    for (const file of files ?? []) {
      // Picking the same name again replaces the earlier pick.
      queue = queue.filter((q) => q.file.name !== file.name || q.status === "done");
      queue.push({ file, status: "waiting", progress: 0, message: "", url: "" });
    }
  }

  function put(item: Item) {
    return new Promise<void>((resolve) => {
      const path = folder ? `${folder}/${item.file.name}` : item.file.name;
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/files/${encodePath(path)}${overwrite ? "?overwrite=1" : ""}`);
      if (item.file.type) xhr.setRequestHeader("Content-Type", item.file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) item.progress = Math.round((e.loaded / e.total) * 100);
      };
      xhr.onload = () => {
        let body: { url?: string; error?: string } | null = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status === 201 && body?.url) {
          item.status = "done";
          item.url = body.url;
        } else {
          item.status = "error";
          item.message = body?.error || (xhr.status === 413 ? "Too big for one upload." : `Failed (${xhr.status}).`);
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
      xhr.send(item.file);
    });
  }

  async function uploadAll() {
    busy = true;
    for (const item of queue) {
      if (item.status === "waiting" || item.status === "error") await put(item);
    }
    busy = false;
    loadFolders();
  }

  function dragOver(e: DragEvent) {
    e.preventDefault();
    over = true;
  }
</script>

<svelte:head><title>Upload</title></svelte:head>

<div class="flag-stripe"></div>
<h1 class="trans-title">Upload</h1>
<p class="note">
  Signed in as <strong>{who}</strong> · <a href="/logout">Sign out</a> · <a href="/{encodePath(folder)}">Browse files</a>
</p>

<label class="field">
  <span class="label">Folder (blank for the top level)</span>
  <input class="filter" type="text" list="folders" placeholder="img/avatars" autocomplete="off" spellcheck="false" bind:value={folderInput} />
  <datalist id="folders">
    {#each suggestions as d (d)}<option value={d}></option>{/each}
  </datalist>
</label>

<label
  class="drop"
  class:over
  ondragenter={dragOver}
  ondragover={dragOver}
  ondragleave={() => (over = false)}
  ondrop={(e) => {
    e.preventDefault();
    over = false;
    add(e.dataTransfer?.files);
  }}
>
  <input
    type="file"
    multiple
    onchange={(e) => {
      add(e.currentTarget.files);
      e.currentTarget.value = "";
    }}
  />
  Drop files here, or click to pick them.
</label>

<div class="actions">
  <button class="btn" type="button" disabled={busy || pending === 0} onclick={uploadAll}>
    {pending > 1 ? `Upload ${pending} files` : "Upload"}
  </button>
  <label><input type="checkbox" bind:checked={overwrite} /> Replace files that already exist</label>
  <span>{done ? `${done} uploaded` : ""}</span>
</div>

<ul class="listing">
  {#each queue as item, i (item)}
    <li class="row file">
      {#if item.status === "done"}
        <a class="name" href={item.url} target="_blank" rel="noopener">{item.file.name}</a>
      {:else}
        <span class="name">{item.file.name}</span>
      {/if}
      <span class="size">{fmtSize(item.file.size)}</span>
      {#if item.status === "uploading"}
        <span class="status">{item.progress}%</span>
      {:else if item.status === "done"}
        <span class="status ok">done</span>
        <button class="copy" title="Copy URL" onclick={(e) => copyText(e.currentTarget, item.url)}>copy</button>
      {:else if item.status === "error"}
        <span class="status err">{item.message}</span>
      {:else if busy}
        <span class="status">waiting</span>
      {:else}
        <button class="remove" onclick={() => queue.splice(i, 1)}>remove</button>
      {/if}
    </li>
  {:else}
    <li class="row empty">No files picked yet.</li>
  {/each}
</ul>
