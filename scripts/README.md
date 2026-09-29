# MMD → glb converter

Converts MikuMikuDanceFR `.pmx` models (e.g. the official HoYoverse Genshin
releases) into web-ready `.glb` for the `/genshin` gallery. Target renderer is
`<model-viewer>` (standard PBR), so only geometry, normals, UVs and each
material's **base** texture are kept — sphere maps, toon ramps and morphs are
dropped (model-viewer can't display them anyway). Handedness is converted from
MMD (left-handed) to glTF (right-handed).de

## Folders

- `models-src/` — raw model downloads live here. **Not** under `public/`, so the
  `.pmx` + textures are never served to the web. Drop each extracted model folder
  in here (keep each `.pmx` next to its texture folder).
- `public/models/` — the converted `.glb` files that the site actually serves.

## One-time setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
```

## Convert a model

Run from the project root:

```bash
python3 scripts/pmx2glb.py "models-src/<folder>/<model>.pmx" "public/models/<name>.glb"
```

Example:

```bash
python3 scripts/pmx2glb.py "models-src/paimon/派蒙1.0.pmx" "public/models/paimon.glb"
```

Then add a card in `src/app/genshin/page.tsx` pointing `model` at the new file.

## Notes

- If a `.rar` won't extract in Finder, install "The Unarchiver" from the App
  Store, or extract with `libarchive` in Python.
- Chinese/Japanese texture filenames are handled automatically.
- Textures larger than 2048px are downscaled to keep `.glb` sizes reasonable
  (tweak `MAX_TEX` in `pmx2glb.py` to change this).
- The script monkey-patches `pymeshio` to read "extended UV" vertices that newer
  Genshin models use — stock pymeshio errors on them.
