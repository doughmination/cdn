<script lang="ts">
  // Directory browser over /api/list (every object in the bucket). The path
  // is the folder: /f/Comic-Code shows everything under "f/Comic-Code/".

  import Crumbs from "../lib/Crumbs.svelte";
  import Hero from "../lib/Hero.svelte";
  import Icon from "../lib/Icon.svelte";
  import Uploader from "../lib/Uploader.svelte";
  import { encodePath, fmtSize, type Listing } from "../lib/files";
  import { link } from "../lib/router.svelte";
  import NotFound from "./NotFound.svelte";

  let {
    prefix,
    listing,
    failed,
    canUpload,
    onuploaded,
  }: { prefix: string; listing: Listing | null; failed: boolean; canUpload: boolean; onuploaded: () => void } =
    $props();

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

  const childHref = (name: string) => `/${encodePath(prefix ? `${prefix}/${name}` : name)}`;
</script>

<svelte:head><title>{prefix ? `${prefix} · CDN` : "CDN"}</title></svelte:head>

{#if missing}
  <NotFound />
{:else}
  {#if prefix}
    <Hero eyebrow="Folder" title={prefix.slice(prefix.lastIndexOf("/") + 1)} />
  {:else}
    <Hero eyebrow="Clove's CDN" title="Hey, this is my CDN.">
      <p class="lede">Assets for my other sites. Meant for me, but you're welcome to look around.</p>
      <p class="note">
        Please don't hotlink. I can change these URLs at any point without
        warning, so anything pointing here may break.
      </p>
    </Hero>
  {/if}

  <div class="content">
    <Crumbs path={prefix} />

    <!-- Signed-in visitors upload straight into the folder they're looking at. -->
    {#if canUpload}
      <Uploader folder={prefix} {onuploaded} />
    {/if}

    <input class="filter" type="search" placeholder="Filter this folder…" autocomplete="off" bind:value={filter} />

    <ul class="listing">
      {#if failed}
        <li class="row empty">Couldn't load the file list.</li>
      {:else if !listing}
        <li class="row empty">Loading…</li>
      {:else}
        {#each folders as name (name)}
          <li class="row folder">
            <a class="name" href={childHref(name)} use:link><Icon name="folder" />{name}/</a>
          </li>
        {/each}
        {#each files as f (f.path)}
          <li class="row file">
            <a class="name" href={childHref(f.name)} use:link><Icon name="file" />{f.name}</a>
            <span class="size">{fmtSize(f.size)}</span>
          </li>
        {:else}
          {#if !folders.length}<li class="row empty">Nothing here.</li>{/if}
        {/each}
      {/if}
    </ul>
  </div>
{/if}
