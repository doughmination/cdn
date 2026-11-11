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
  // never reloads. After any change it's refetched fresh.
  function load(fresh = false): Promise<void> {
    return fetchList(fresh)
      .then((loaded) => {
        // The edge copy can be a minute old: if this page isn't in it, ask again
        if (!fresh && !hasPath(loaded, currentPath())) return load(true);
        listing = loaded;
        failed = false;
      })
      .catch(() => {
        failed = true;
      });
  }

  function currentPath(): string | null {
    try {
      return decodeURIComponent(route.path).replace(/^\/+|\/+$/g, "");
    } catch {
      return null;
    }
  }

  /** True if `target` is the top level, a file, or a folder in the listing. */
  function hasPath(loaded: Listing, target: string | null): boolean {
    if (!target || route.path === "/licence") return true;
    return loaded.files.some(
      (entry) => entry.path === target || entry.path.startsWith(`${target}/`),
    );
  }
  load();
  fetchMe().then((m) => (me = m));

  // "/img/avatars/" → "img/avatars"; null if the path doesn't decode.
  const path = $derived(currentPath());

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
    <Preview {file} raw={listing.raw} canEdit={Boolean(me)} onchanged={() => load(true)} />
  {:else}
    <Browse prefix={path} {listing} {failed} canEdit={Boolean(me)} onchanged={() => load(true)} />
  {/if}
</main>
<Footer count={listing?.count} />
