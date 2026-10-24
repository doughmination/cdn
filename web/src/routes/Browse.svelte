<script lang="ts">
  // Directory browser over /api/list (every object in the bucket). The path
  // is the folder: /f/Comic-Code shows everything under "f/Comic-Code/".

  import Crumbs from "../lib/Crumbs.svelte";
  import Icon from "../lib/Icon.svelte";
  import { copyText, encodePath, fmtSize, type Listing } from "../lib/files";
  import { link } from "../lib/router.svelte";
  import NotFound from "./NotFound.svelte";

  let {
    prefix,
    listing,
    failed,
    canUpload,
  }: { prefix: string; listing: Listing | null; failed: boolean; canUpload: boolean } = $props();

  let filter = $state("");

  // A new folder starts unfiltered.
  $effect.pre(() => {
    prefix;
    filter = "";
  });

  // Immediate children (folders + files) of the current folder.
  const children = $derived.by(() => {
    const base = prefix ? prefix + "/" : "";
    const folders = new Set<string>();
    const files: { name: string; path: string; size: number }[] = [];
    for (const f of listing?.files ?? []) {
      if (!f.path.startsWith(base)) continue;
      const rest = f.path.slice(base.length);
      const slash = rest.indexOf("/");
      if (slash === -1) files.push({ name: rest, path: f.path, size: f.size });
      else folders.add(rest.slice(0, slash));
    }
    return {
      folders: [...folders].sort((a, b) => a.localeCompare(b)),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  const q = $derived(filter.trim().toLowerCase());
  const folders = $derived(children.folders.filter((n) => !q || n.toLowerCase().includes(q)));
  const files = $derived(children.files.filter((f) => !q || f.name.toLowerCase().includes(q)));
  const missing = $derived(listing !== null && prefix !== "" && !children.folders.length && !children.files.length);

  const fileUrl = (path: string) => `${listing!.raw}/${encodePath(path)}`;
  const childHref = (name: string) => `/${encodePath(prefix ? `${prefix}/${name}` : name)}`;
</script>

<svelte:head><title>{prefix ? `${prefix} · CDN` : "CDN"}</title></svelte:head>

{#if missing}
  <NotFound />
{:else}
  <div class="flag-stripe"></div>
  <h1 class="trans-title">Hey, this is my CDN.</h1>
  <p>Assets for my other sites. Meant for me, but you're welcome to look around.</p>
  <p class="note">
    Please don't hotlink. I can change these URLs at any point without
    warning, so anything pointing here may break.
  </p>

  <Crumbs path={prefix} />

  <!-- Uploaders get a shortcut to the upload page, aimed at this folder. -->
  <div class="folderbar">
    {#if canUpload}
      <a class="folderbtn" href="/upload?folder={encodeURIComponent(prefix)}"><Icon name="upload" />Upload here</a>
    {/if}
  </div>

  <input class="filter" type="search" placeholder="Filter this folder…" autocomplete="off" bind:value={filter} />

  <ul class="listing">
    {#if failed}
      <li class="row empty">Couldn't load the file list.</li>
    {:else if listing}
      {#each folders as name (name)}
        <li class="row folder">
          <a class="name" href={childHref(name)} use:link><Icon name="folder" />{name}/</a>
        </li>
      {/each}
      {#each files as f (f.path)}
        <li class="row file">
          <a class="name" href={childHref(f.name)} use:link><Icon name="file" />{f.name}</a>
          <span class="size">{fmtSize(f.size)}</span>
          <button class="copy" title="Copy URL" onclick={(e) => copyText(e.currentTarget, fileUrl(f.path))}>copy</button>
        </li>
      {:else}
        {#if !folders.length}<li class="row empty">Nothing here.</li>{/if}
      {/each}
    {/if}
  </ul>

  <footer>
    <span>
      {#if failed}{:else if listing}{listing.count} files · © {new Date().getFullYear()} · assets may move without notice ·
      {:else}loading… ·{/if}
    </span>
    <a href="/licence" use:link>Licence</a> ·
    <a href="/upload">Upload</a>
  </footer>
{/if}
