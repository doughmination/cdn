<script lang="ts">
  import { AVATAR, SITE_NAME } from "./site";

  let { count }: { count?: number } = $props();
</script>

<footer>
  <span><img src={AVATAR} alt="" width="20" height="20" />{SITE_NAME}</span>
  {#if count !== undefined}<span>{count} files</span>{/if}
  <span>assets may move without notice</span>
  <span>Clove Twilight &copy; {new Date().getFullYear()}</span>
</footer>
