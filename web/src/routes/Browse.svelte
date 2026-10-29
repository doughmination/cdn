<script lang="ts">
  // Directory browser over /api/list (every object in the bucket). The path
  // is the folder: /f/Comic-Code shows everything under "f/Comic-Code/".
  // Signed in, it also uploads, makes folders and deletes.

  import Crumbs from "../lib/Crumbs.svelte";
  import Hero from "../lib/Hero.svelte";
  import Icon from "../lib/Icon.svelte";
  import Uploader from "../lib/Uploader.svelte";
  import { apiWrite, encodePath, fmtSize, type Listing } from "../lib/files";
  import { link, navigate } from "../lib/router.svelte";
  import { FOLDER_MARKER } from "../../../shared/folders";
  import NotFound from "./NotFound.svelte";

  let {
    prefix,
    listing,
    failed,
    canEdit,
    onchanged,
  }: { prefix: string; listing: Listing | null; failed: boolean; canEdit: boolean; onchanged: () => Promise<void> } =
    $props();

  let filter = $state("");
  let naming = $state(false);
  let newName = $state("");
  let working = $state(false);
  let error = $state("");

  // A new folder starts unfiltered, with nothing half-done.
  $effect.pre(() => {
    prefix;
    filter = "";
    naming = false;
    newName = "";
    error = "";
  });

  const base = $derived(prefix ? prefix + "/" : "");

  // Immediate children (folders + files) of the current folder.
  const children = $derived.by(() => {
    const folders = new Set<string>();
    const files: { name: string; path: string; size: number }[] = [];
    for (const f of listing?.files ?? []) {
      if (!f.path.startsWith(base)) continue;
      const rest = f.path.slice(base.length);
      const slash = rest.indexOf("/");
      if (slash !== -1) folders.add(rest.slice(0, slash));
      else if (rest !== FOLDER_MARKER) files.push({ name: rest, path: f.path, size: f.size });
    }
    return {
      folders: [...folders].sort((a, b) => a.localeCompare(b)),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  const q = $derived(filter.trim().toLowerCase());
  const folders = $derived(children.folders.filter((n) => !q || n.toLowerCase().includes(q)));
  const files = $derived(children.files.filter((f) => !q || f.name.toLowerCase().includes(q)));
  // A folder held open only by its marker still exists; it's just empty.
  const missing = $derived(listing !== null && prefix !== "" && !listing.files.some((f) => f.path.startsWith(base)));
  const empty = $derived(!children.folders.length && !children.files.length);

  const childHref = (name: string) => `/${encodePath(prefix ? `${prefix}/${name}` : name)}`;
  const parentHref = $derived(`/${encodePath(prefix.slice(0, Math.max(0, prefix.lastIndexOf("/"))))}`);

  /** Runs one API write, then reloads the listing and (if given) goes to `then`. */
  async function change(method: "POST" | "DELETE", url: string, then?: string) {
    working = true;
    error = (await apiWrite(method, url)) ?? "";
    if (!error) {
      await onchanged();
      if (then) navigate(then);
    }
    working = false;
  }

  function createFolder(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
    if (!name) return;
    const path = prefix ? `${prefix}/${name}` : name;
    change("POST", `/api/folders/${encodePath(path)}`, `/${encodePath(path)}`);
  }

  function deleteFile(f: { name: string; path: string }) {
    if (confirm(`Delete ${f.name}? Anything linking to it will break.`)) {
      change("DELETE", `/api/files/${encodePath(f.path)}`);
    }
  }

  function deleteFolder() {
    change("DELETE", `/api/files/${encodePath(`${prefix}/${FOLDER_MARKER}`)}`, parentHref);
  }
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

    <!-- Signed-in visitors manage the folder they're looking at. -->
    {#if canEdit && listing}
      <div class="actions">
        {#if naming}
          <form class="newfolder" onsubmit={createFolder}>
            <!-- svelte-ignore a11y_autofocus -->
            <input class="filter" type="text" placeholder="Folder name" autocomplete="off" spellcheck="false" autofocus disabled={working} bind:value={newName} />
            <button class="btn" type="submit" disabled={working || !newName.trim()}>Create</button>
            <button class="btn" type="button" disabled={working} onclick={() => (naming = false)}>Cancel</button>
          </form>
        {:else}
          <button class="btn" type="button" onclick={() => (naming = true)}><Icon name="new-folder" />New folder</button>
          {#if prefix && empty}
            <button class="btn danger" type="button" disabled={working} onclick={deleteFolder}><Icon name="trash" />Delete folder</button>
          {/if}
        {/if}
        {#if error}<span class="status err">{error}</span>{/if}
      </div>

      <Uploader folder={prefix} {onchanged} />
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
            {#if canEdit}
              <button class="remove delete" title="Delete {f.name}" aria-label="Delete {f.name}" disabled={working} onclick={() => deleteFile(f)}><Icon name="trash" /></button>
            {/if}
          </li>
        {:else}
          {#if !folders.length}<li class="row empty">Nothing here.</li>{/if}
        {/each}
      {/if}
    </ul>
  </div>
{/if}
