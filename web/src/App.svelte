<script lang="ts">
  import { fetchList, fetchMe, type Listing } from "./lib/files";
  import Footer from "./lib/Footer.svelte";
  import Header from "./lib/Header.svelte";
  import { route } from "./lib/router.svelte";
  import Browse from "./routes/Browse.svelte";
  import Licence from "./routes/Licence.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import Preview from "./routes/Preview.svelte";

  let listing = $state<Listing | null>(null);
  let failed = $state(false);
  let me = $state<{ username: string } | null>(null);

  // Fetched once whatever page the visit starts on, since in-app navigation
  // never reloads. After an upload it's refetched fresh.
  function load(fresh = false) {
    fetchList(fresh)
      .then((l) => {
        listing = l;
        failed = false;
      })
      .catch(() => (failed = true));
  }
  load();
  fetchMe().then((m) => (me = m));

  // "/img/avatars/" → "img/avatars"; null if the path doesn't decode.
  const path = $derived.by(() => {
    try {
      return decodeURIComponent(route.path).replace(/^\/+|\/+$/g, "");
    } catch {
      return null;
    }
  });

  // An exact object is a file (unless the URL ends in a slash); anything else browses.
  const file = $derived(
    path && listing && !route.path.endsWith("/") ? listing.files.find((f) => f.path === path) : undefined,
  );
</script>

<Header {me} />
<main class="wrap">
  {#if route.path === "/licence"}
    <Licence />
  {:else if path === null}
    <NotFound />
  {:else if file && listing}
    <Preview {file} raw={listing.raw} />
  {:else}
    <Browse prefix={path} {listing} {failed} canUpload={Boolean(me)} onuploaded={() => load(true)} />
  {/if}
</main>
<Footer count={listing?.count} />
