<script lang="ts">
  import type { Snippet } from "svelte";

  // The page heading: small accent label, big title, optional text under it.
  let { eyebrow, title, children }: { eyebrow: string; title: string; children?: Snippet } = $props();
</script>

<section class="hero">
  <p class="eyebrow">{eyebrow}</p>
  <h1>{title}</h1>
  {@render children?.()}
</section>
