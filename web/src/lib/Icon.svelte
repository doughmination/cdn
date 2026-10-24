<script lang="ts">
  // Small blocky stroke icons.
  let { name }: { name: "folder" | "file" | "upload" } = $props();
</script>

<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" style="vertical-align:-2px;margin-right:0.35em">
  {#if name === "folder"}
    <path d="M3 6h6l2 3h10v11H3V6z" />
  {:else if name === "file"}
    <path d="M5 2h10l4 4v16H5V2z" /><path d="M15 2v4h4" />
  {:else}
    <path d="M12 17V4M7 9l5-5 5 5M4 21h16" />
  {/if}
</svg>
