<script lang="ts">
  // The three icons the browser uses, from iconsax like the rest of doughmination.gay
  const NAMES = {
    folder: "folder-2",
    file: "document",
    upload: "document-upload",
  };

  let { name }: { name: keyof typeof NAMES } = $props();
</script>

<iconsax-icon name={NAMES[name]} type="bulk" size="15" aria-hidden="true"></iconsax-icon>
