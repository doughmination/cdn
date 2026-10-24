<script lang="ts">
  import { encodePath } from "./files";
  import { link } from "./router.svelte";

  // `path` is a folder or file; every part but a file's own name links.
  let { path, file = false }: { path: string; file?: boolean } = $props();

  const parts = $derived(
    (path ? path.split("/") : []).map((name, i, all) => ({ name, path: all.slice(0, i + 1).join("/") })),
  );
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href="/" use:link>cdn</a>
  {#each parts as c, i (c.path)}
    <span class="sep">/</span>
    {#if file && i === parts.length - 1}
      <span>{c.name}</span>
    {:else}
      <a href="/{encodePath(c.path)}" use:link>{c.name}</a>
    {/if}
  {/each}
</nav>
