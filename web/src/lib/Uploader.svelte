<script lang="ts">
  // Upload panel shown in a folder to signed-in visitors. Files go one at a
  // time as raw PUTs to /api/files/<path>; the worker checks the SSO session
  // and writes them into the R2 bucket, under this folder (or a new subfolder).

  import { untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import { encodePath, fmtSize } from "./files";

  interface Item {
    file: File;
    status: "waiting" | "uploading" | "done" | "error";
    progress: number;
    message: string;
  }

  let { folder, onuploaded }: { folder: string; onuploaded: () => void } = $props();

  let subInput = $state("");
  let overwrite = $state(false);
  let queue = $state<Item[]>([]);
  let busy = $state(false);
  let over = $state(false);

  // A new folder starts with an empty queue.
  $effect.pre(() => {
    folder;
    untrack(() => {
      if (!busy) queue = [];
      subInput = "";
    });
  });

  const sub = $derived(subInput.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/"));
  const target = $derived([folder, sub].filter(Boolean).join("/"));
  const pending = $derived(queue.filter((q) => q.status === "waiting" || q.status === "error").length);
  const done = $derived(queue.filter((q) => q.status === "done").length);

  function add(files: FileList | null | undefined) {
    for (const file of files ?? []) {
      // Picking the same name again replaces the earlier pick.
      queue = queue.filter((q) => q.file.name !== file.name || q.status === "done");
      queue.push({ file, status: "waiting", progress: 0, message: "" });
    }
  }

  function put(item: Item, dir: string) {
    return new Promise<void>((resolve) => {
      const path = dir ? `${dir}/${item.file.name}` : item.file.name;
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
    const dir = target;
    for (const item of queue) {
      if (item.status === "waiting" || item.status === "error") await put(item, dir);
    }
    busy = false;
    // Finished uploads now show in the listing, so only failures stay queued.
    if (done) {
      queue = queue.filter((q) => q.status !== "done");
      onuploaded();
    }
  }

  function dragOver(e: DragEvent) {
    e.preventDefault();
    over = true;
  }
</script>

<section class="uploader">
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
    <Icon name="upload" />Drop files here to upload to <strong>/{target}</strong>, or click to pick them.
  </label>

  {#if queue.length}
    <ul class="listing">
      {#each queue as item, i (item)}
        <li class="row file">
          <span class="name">{item.file.name}</span>
          <span class="size">{fmtSize(item.file.size)}</span>
          {#if item.status === "uploading"}
            <span class="status">{item.progress}%</span>
          {:else if item.status === "done"}
            <span class="status ok">done</span>
          {:else if item.status === "error"}
            <span class="status err">{item.message}</span>
          {:else if busy}
            <span class="status">waiting</span>
          {:else}
            <button class="remove" onclick={() => queue.splice(i, 1)}>remove</button>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="actions">
      <button class="btn" type="button" disabled={busy || pending === 0} onclick={uploadAll}>
        {pending > 1 ? `Upload ${pending} files` : "Upload"}
      </button>
      <input class="filter sub" type="text" placeholder="Into a subfolder (optional)" autocomplete="off" spellcheck="false" disabled={busy} bind:value={subInput} />
      <label><input type="checkbox" bind:checked={overwrite} /> Replace existing files</label>
    </div>
  {/if}
</section>
