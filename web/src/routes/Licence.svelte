<script lang="ts">
  import { marked } from "marked";
  import Hero from "../lib/Hero.svelte";

  const doc = fetch("/LICENCE.md", { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.text();
  });
</script>

<svelte:head><title>Licence</title></svelte:head>

<Hero eyebrow="Legal" title="Licence" />
<article class="doc content">
  {#await doc}
    Loading licence…
  {:then md}
    <!-- trusted, first-party content -->
    {@html marked.parse(md)}
  {:catch}
    Couldn't load the licence. See <a href="/LICENCE.md">/LICENCE.md</a>
  {/await}
</article>
