<script lang="ts">
  import { fetchList, fetchMe, type Listing } from "./lib/files";
  import { route } from "./lib/router.svelte";
  import Browse from "./routes/Browse.svelte";
  import Licence from "./routes/Licence.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import Preview from "./routes/Preview.svelte";
  import Upload from "./routes/Upload.svelte";

  let listing = $state<Listing | null>(null);
  let failed = $state(false);
  let canUpload = $state(false);

  // The upload page fetches its own (fresh) copy.
  if (route.path !== "/upload") {
    fetchList()
      .then((l) => (listing = l))
      .catch(() => (failed = true));
    fetchMe().then((me) => (canUpload = Boolean(me)));
  }

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

{#if route.path === "/upload"}
  <Upload />
{:else if route.path === "/licence"}
  <Licence />
{:else if path === null}
  <NotFound />
{:else if file && listing}
  <Preview {file} raw={listing.raw} />
{:else}
  <Browse prefix={path} {listing} {failed} {canUpload} />
{/if}
