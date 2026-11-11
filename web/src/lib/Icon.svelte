<!-- web/src/lib/Icon.svelte -->

<script lang="ts">
  // Material outline icons, inlined as SVG at build time like the rest of doughmination.gay
  import IcFolder from "~icons/ic/outline-folder";
  import IcDescription from "~icons/ic/outline-description";
  import IcUploadFile from "~icons/ic/outline-upload-file";
  import IcCreateNewFolder from "~icons/ic/outline-create-new-folder";
  import IcDelete from "~icons/ic/outline-delete";

  const ICONS = {
    folder: IcFolder,
    file: IcDescription,
    upload: IcUploadFile,
    "new-folder": IcCreateNewFolder,
    trash: IcDelete,
  };

  let { name }: { name: keyof typeof ICONS } = $props();

  const Glyph = $derived(ICONS[name]);
</script>

<Glyph class="icon" aria-hidden="true" />
