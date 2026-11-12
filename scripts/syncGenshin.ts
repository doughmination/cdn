// scripts/syncGenshin.ts

// Copies Genshin UI images from enka.network into the R2 bucket, sorted into folders.
// Re-run after each game patch: it only fetches and uploads what is missing.
//
//   deno run -A scripts/syncGenshin.ts            download only
//   deno run -A scripts/syncGenshin.ts --upload   download, then upload (needs `wrangler login`)
//
// With more than one Cloudflare account, set CLOUDFLARE_ACCOUNT_ID for the upload.

const upstreamBase = "https://enka.network/ui";
const rawBase = "https://raw.doughmination.gay";
const bucketName = "cdn";
const bucketPrefix = "genshin";
const cacheDir = ".genshin-cache";

const charactersUrl = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/avatars.json";
const weaponsUrl = "https://gi.yatta.moe/api/v2/en/weapon";
const artifactsUrl = "https://gi.yatta.moe/api/v2/en/reliquary";

const userAgent = "genshin-asset-sync/1.0";
const parallelJobs = 4;

type Folder = "characters" | "weapons" | "artifacts";

type Asset = {
  folder: Folder;
  fileName: string;
};

type CharacterEntry = {
  SideIconName?: string;
};

type YattaItem = {
  id: number;
  icon?: string;
};

type YattaList = {
  data: {
    items: Record<string, YattaItem>;
  };
};

async function fetchJson<Data>(url: string): Promise<Data> {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  return (await response.json()) as Data;
}

// '/ui/UI_AvatarIcon_Side_Aino.png' becomes 'UI_AvatarIcon_Side_Aino', same as the API does
function iconStem(raw: string | undefined): string {
  if (!raw) return "";

  const fileName = raw.trim().split("/").pop() ?? "";

  return fileName.toLowerCase().endsWith(".png") ? fileName.slice(0, -4) : fileName;
}

// Icon, side icon and gacha artwork for every character
async function characterAssets(): Promise<Asset[]> {
  const characters = await fetchJson<Record<string, CharacterEntry>>(charactersUrl);
  const stems = new Set<string>();

  for (const entry of Object.values(characters)) {
    const sideIcon = iconStem(entry.SideIconName);
    if (!sideIcon) continue;

    const fullIcon = sideIcon.replace("_Side_", "_");

    stems.add(sideIcon);
    stems.add(fullIcon);
    stems.add(fullIcon.replace("UI_AvatarIcon_", "UI_Gacha_AvatarImg_"));
  }

  // Manekin and Manekina are not in the list, the API adds them by hand
  for (const name of ["MannequinBoy", "MannequinGirl"]) {
    stems.add(`UI_AvatarIcon_${name}`);
    stems.add(`UI_AvatarIcon_Side_${name}`);
    stems.add(`UI_Gacha_AvatarImg_${name}`);
  }

  return toAssets("characters", stems);
}

// Base icon plus the ascended (_Awaken) icon for every weapon
async function weaponAssets(): Promise<Asset[]> {
  const weapons = await fetchJson<YattaList>(weaponsUrl);
  const stems = new Set<string>();

  for (const weapon of Object.values(weapons.data.items)) {
    if (!weapon.icon) continue;

    stems.add(weapon.icon);
    stems.add(`${weapon.icon}_Awaken`);
  }

  return toAssets("weapons", stems);
}

// Up to five pieces per set. Small sets have fewer, those answer 404 and are remembered.
async function artifactAssets(): Promise<Asset[]> {
  const sets = await fetchJson<YattaList>(artifactsUrl);
  const stems = new Set<string>();

  for (const set of Object.values(sets.data.items)) {
    for (const piece of [1, 2, 3, 4, 5]) {
      stems.add(`UI_RelicIcon_${set.id}_${piece}`);
    }
  }

  return toAssets("artifacts", stems);
}

function toAssets(folder: Folder, stems: Set<string>): Asset[] {
  return [...stems].sort().map((stem) => ({
    folder,
    fileName: `${stem}.png`,
  }));
}

const localPath = (asset: Asset) => `${cacheDir}/${asset.folder}/${asset.fileName}`;
const bucketKey = (asset: Asset) => `${bucketPrefix}/${asset.folder}/${asset.fileName}`;

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

// Names Enka does not have, so later runs skip them
const missingPath = `${cacheDir}/missing.json`;

async function readMissing(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse(await Deno.readTextFile(missingPath)) as string[]);
  } catch {
    return new Set();
  }
}

// Runs the job over every item, a few at a time
async function inParallel<Item>(items: Item[], job: (item: Item) => Promise<void>): Promise<void> {
  const queue = [...items];

  const workers = Array.from({ length: parallelJobs }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await job(item);
    }
  });

  await Promise.all(workers);
}

async function download(assets: Asset[]): Promise<Asset[]> {
  const missing = await readMissing();
  const ready: Asset[] = [];
  let fetched = 0;
  let failed = 0;

  for (const folder of ["characters", "weapons", "artifacts"]) {
    await Deno.mkdir(`${cacheDir}/${folder}`, { recursive: true });
  }

  await inParallel(assets, async (asset) => {
    const path = localPath(asset);

    if (await fileExists(path)) {
      ready.push(asset);
      return;
    }

    if (missing.has(bucketKey(asset))) return;

    const response = await fetch(`${upstreamBase}/${asset.fileName}`, {
      headers: { "User-Agent": userAgent },
    });

    if (response.status === 404) {
      await response.body?.cancel();
      missing.add(bucketKey(asset));
      return;
    }

    if (!response.ok) {
      await response.body?.cancel();
      failed += 1;
      console.error(`download failed (${response.status}): ${asset.fileName}`);
      return;
    }

    await Deno.writeFile(path, new Uint8Array(await response.arrayBuffer()));
    ready.push(asset);
    fetched += 1;

    if (fetched % 50 === 0) console.log(`downloaded ${fetched}…`);
  });

  await Deno.writeTextFile(missingPath, JSON.stringify([...missing].sort(), null, 2));

  console.log(`download: ${fetched} new, ${ready.length} ready, ${missing.size} not on Enka, ${failed} failed`);

  return ready;
}

async function upload(assets: Asset[]): Promise<void> {
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  await inParallel(assets, async (asset) => {
    const key = bucketKey(asset);

    // The bucket is public on raw., so a HEAD tells us what is already there
    const existing = await fetch(`${rawBase}/${key}`, { method: "HEAD" });

    if (existing.ok) {
      skipped += 1;
      return;
    }

    const command = new Deno.Command("npx", {
      args: [
        "wrangler",
        "r2",
        "object",
        "put",
        `${bucketName}/${key}`,
        "--file",
        localPath(asset),
        "--content-type",
        "image/png",
        "--remote",
      ],
      stdout: "null",
      stderr: "piped",
    });

    const result = await command.output();

    if (!result.success) {
      failed += 1;
      console.error(`upload failed: ${key}\n${new TextDecoder().decode(result.stderr).trim()}`);
      return;
    }

    uploaded += 1;

    if (uploaded % 25 === 0) console.log(`uploaded ${uploaded}…`);
  });

  console.log(`upload: ${uploaded} new, ${skipped} already in the bucket, ${failed} failed`);

  if (failed > 0) Deno.exit(1);
}

const assets = [
  ...(await characterAssets()),
  ...(await weaponAssets()),
  ...(await artifactAssets()),
];

console.log(`${assets.length} candidate files`);

const ready = await download(assets);

if (Deno.args.includes("--upload")) {
  await upload(ready);
} else {
  console.log("download only. Add --upload to send them to the bucket.");
}
