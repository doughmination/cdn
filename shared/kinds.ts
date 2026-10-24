// What a file is, going by its extension. Shared by the worker (link embeds)
// and the viewer (previews).

export type Kind = "image" | "video" | "audio" | "pdf" | "text";

const EXTENSIONS: Record<Kind, string> = {
  image: "png jpg jpeg gif webp avif svg ico bmp",
  video: "mp4 webm mov",
  audio: "mp3 ogg wav flac m4a",
  pdf: "pdf",
  text: "txt md json js mjs cjs ts css html xml csv tsv yml yaml toml ini log sh ps1 py gltf",
};

const KINDS: Record<string, Kind> = Object.fromEntries(
  Object.entries(EXTENSIONS).flatMap(([kind, exts]) => exts.split(" ").map((ext) => [ext, kind as Kind])),
);

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
}

export function kindOf(path: string): Kind | undefined {
  return KINDS[extensionOf(path)];
}
