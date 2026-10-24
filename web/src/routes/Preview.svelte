<script lang="ts">
  // One file: what it is, links to the raw copy, and a preview where the
  // browser can show it. Media loads straight from raw; text goes through
  // /api/files so the bucket doesn't need CORS for this site.

  import Crumbs from "../lib/Crumbs.svelte";
  import Hero from "../lib/Hero.svelte";
  import { copyText, encodePath, fmtSize, type FileEntry } from "../lib/files";
  import { extensionOf, kindOf } from "../../../shared/kinds";

  let { file, raw }: { file: FileEntry; raw: string } = $props();

  /** Bigger text files only get the links; nobody wants to scroll that. */
  const MAX_TEXT = 512 * 1024;

  const name = $derived(file.path.slice(file.path.lastIndexOf("/") + 1));
  const ext = $derived(extensionOf(file.path));
  const kind = $derived(kindOf(file.path));
  const url = $derived(`${raw}/${encodePath(file.path)}`);
  const local = $derived(`/api/files/${encodePath(file.path)}`);

  const text = $derived(
    kind === "text" && file.size <= MAX_TEXT
      ? fetch(local, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        })
      : null,
  );
</script>

<svelte:head><title>{name} · CDN</title></svelte:head>

<Hero eyebrow={kind ?? "File"} title={name}>
  <p class="lede">{fmtSize(file.size)}{ext ? ` · .${ext}` : ""}</p>
</Hero>

<div class="content">
  <Crumbs path={file.path} file />

  <div class="actions">
    <a class="btn" href={url} target="_blank" rel="noopener">Open raw</a>
    <a class="btn" href={local} download={name}>Download</a>
    <button class="btn" type="button" onclick={(e) => copyText(e.currentTarget, url)}>Copy URL</button>
  </div>

  <div class="preview">
    {#if kind === "image"}
      <img src={url} alt={name} />
    {:else if kind === "video"}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={url} controls preload="metadata"></video>
    {:else if kind === "audio"}
      <audio src={url} controls preload="metadata"></audio>
    {:else if kind === "pdf"}
      <iframe src={url} title={name}></iframe>
    {:else if text}
      {#await text}
        <p class="empty">Loading…</p>
      {:then body}
        <pre>{body}</pre>
      {:catch}
        <p class="empty">Couldn't load this file.</p>
      {/await}
    {:else if kind === "text"}
      <p class="empty">Too big to preview here. Open the raw file instead.</p>
    {:else}
      <p class="empty">No preview for this kind of file.</p>
    {/if}
  </div>
</div>
