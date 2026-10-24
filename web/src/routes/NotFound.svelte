<script lang="ts">
  import Hero from "../lib/Hero.svelte";
  import { link } from "../lib/router.svelte";
</script>

<svelte:head><title>404 — Not Found</title></svelte:head>

<Hero eyebrow="Error 404" title="Not found">
  <p class="lede">
    That asset isn't here. It may have moved — URLs here can change at any point.
  </p>
  <p><a href="/" use:link>Go back home</a></p>
</Hero>
