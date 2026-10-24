<script lang="ts">
  import { link, route } from "./router.svelte";
  import { AVATAR, SITE_NAME } from "./site";

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
    <!-- Not use:link: the worker sends signed-out visitors to sign in first. -->
    <a href="/upload" aria-current={current("/upload")}>Upload</a>
    <a href="/licence" use:link aria-current={current("/licence")}>Licence</a>
    <a href="https://doughmination.gay">doughmination.gay</a>
  </nav>
</header>
