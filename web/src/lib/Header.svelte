<script lang="ts">
  import { link, route } from "./router.svelte";
  import { AVATAR, SITE_NAME } from "./site";

  let { me }: { me: { username: string } | null } = $props();

  const current = (path: string) => (route.path === path ? "page" : undefined);
</script>

<!-- Fixed-height page backdrop, so every page gets the same amount of background -->
<div class="backdrop" aria-hidden="true"></div>

<header>
  <a class="brand" href="/" use:link>
    <img src={AVATAR} alt="" width="32" height="32" />
    <span>{SITE_NAME}</span>
  </a>
  <nav>
    <a href="/" use:link aria-current={current("/")}>Files</a>
    <a href="/licence" use:link aria-current={current("/licence")}>Licence</a>
    <!-- Not use:link: both go through the worker. Signing in comes back to this page. -->
    {#if me}
      <a href="/logout" title="Signed in as @{me.username}">Sign out</a>
    {:else}
      <a href="/login?next={encodeURIComponent(route.path)}">Sign in</a>
    {/if}
    <a href="https://doughmination.gay">doughmination.gay</a>
  </nav>
</header>
