#!/usr/bin/env python3
# personal/scripts/pmx2glb.py
# Copyright (c) 2026 Clove Nytrix Doughmination Twilight
# Licensed under the DASL-1.0 Licence.
# See LICENCE.md in the project root for full licence information.

"""pmx2glb.py — convert an MMD .pmx model to a self-contained .glb.

Target renderer is <model-viewer> (standard PBR), so we deliberately keep only
what PBR can show: geometry, normals, UVs and each material's *base* texture.
Sphere maps, toon ramps and morphs are dropped (model-viewer can't display them
anyway). Handedness is converted MMD left-handed -> glTF right-handed by negating
Z and reversing triangle winding.
"""
import io, json, os, struct, sys, glob
from PIL import Image
from pymeshio import common, pmx as pmxmod
from pymeshio.pmx import reader

# --- Patch pymeshio: support "extended UV" vertices (extra vec4 UV sets that
# newer Genshin models carry). Stock pymeshio raises on them (and its exception
# is itself buggy). We store the count and skip the extra UV floats per vertex. ---
_orig_init = reader.Reader.__init__


def _patched_init(self, ios, text_encoding, extended_uv, vertex_index_size,
                  texture_index_size, material_index_size, bone_index_size,
                  morph_index_size, rigidbody_index_size):
    common.BinaryReader.__init__(self, ios)
    self.extended_uv = extended_uv
    self.read_text = self.get_read_text(text_encoding)
    if vertex_index_size <= 2:
        self.read_vertex_index = lambda: self.read_uint(vertex_index_size)
    else:
        self.read_vertex_index = lambda: self.read_int(vertex_index_size)
    self.read_texture_index = lambda: self.read_int(texture_index_size)
    self.read_material_index = lambda: self.read_int(material_index_size)
    self.read_bone_index = lambda: self.read_int(bone_index_size)
    self.read_morph_index = lambda: self.read_int(morph_index_size)
    self.read_rigidbody_index = lambda: self.read_int(rigidbody_index_size)


def _patched_read_vertex(self):
    pos = self.read_vector3()
    nrm = self.read_vector3()
    uv = self.read_vector2()
    for _ in range(4 * getattr(self, "extended_uv", 0)):
        self.read_float()  # discard extra UV channels
    return pmxmod.Vertex(pos, nrm, uv, self.read_deform(), self.read_float())


reader.Reader.__init__ = _patched_init
reader.Reader.read_vertex = _patched_read_vertex

MAX_TEX = 2048  # cap texture dimension to keep glb sizes sane


def find_texture(pmx_dir, rel):
    rel = rel.replace("\\", "/")
    cand = os.path.normpath(os.path.join(pmx_dir, rel))
    if os.path.isfile(cand):
        return cand
    # case-insensitive / loose fallback
    base = os.path.basename(rel).lower()
    for root, _dirs, files in os.walk(pmx_dir):
        for f in files:
            if f.lower() == base:
                return os.path.join(root, f)
    return None


def load_png_bytes(path):
    im = Image.open(path).convert("RGBA")
    if max(im.size) > MAX_TEX:
        s = MAX_TEX / max(im.size)
        im = im.resize((max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s))))
    # A texture only counts as "transparent" if it has real cut-out regions
    # (pixels that are actually see-through), not merely a fully-opaque alpha
    # channel. Many MMD PNGs carry an all-opaque alpha; treating those as
    # transparent makes <model-viewer> depth-sort them and the model renders
    # see-through / inside-out. Threshold at 128 = genuine holes only.
    lo = im.getchannel("A").getextrema()[0]
    has_cutout = lo < 128
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue(), has_cutout


def pad4(b, fill=b"\x00"):
    r = (4 - (len(b) % 4)) % 4
    return b + fill * r if r else b


def convert(pmx_path, out_path):
    pmx_dir = os.path.dirname(pmx_path)
    m = reader.read_from_file(pmx_path)
    verts = m.vertices

    # --- attribute buffers (Z negated for LH->RH) ---
    pos = bytearray(); nrm = bytearray(); uv = bytearray()
    pmin = [1e30, 1e30, 1e30]; pmax = [-1e30, -1e30, -1e30]
    for v in verts:
        px, py, pz = v.position.x, v.position.y, -v.position.z
        nx, ny, nz = v.normal.x, v.normal.y, -v.normal.z
        pos += struct.pack("<3f", px, py, pz)
        nrm += struct.pack("<3f", nx, ny, nz)
        uv += struct.pack("<2f", v.uv.x, v.uv.y)
        for k, val in enumerate((px, py, pz)):
            pmin[k] = min(pmin[k], val); pmax[k] = max(pmax[k], val)

    # --- unique textures -> embedded PNG bufferViews ---
    tex_cache = {}   # pmx texture_index -> (image_index, has_alpha)
    images = []      # list of (png_bytes,)
    for ti, rel in enumerate(m.textures):
        p = find_texture(pmx_dir, rel)
        if not p:
            continue
        try:
            data, has_cutout = load_png_bytes(p)
        except Exception as e:
            print(f"    ! texture skip {rel}: {e}")
            continue
        tex_cache[ti] = (len(images), has_cutout)
        images.append(data)

    # --- per-material index runs (winding reversed) ---
    idx = m.indices
    mat_prims = []   # (index_bytes, count, gltf_material_dict)
    off = 0
    for mat in m.materials:
        n = mat.vertex_count
        run = idx[off:off + n]
        off += n
        ib = bytearray()
        for t in range(0, len(run), 3):
            a, b, c = run[t], run[t + 1], run[t + 2]
            ib += struct.pack("<3I", a, c, b)  # reverse winding
        col = mat.diffuse_color
        alpha = getattr(mat, "alpha", 1.0)
        pbr = {
            "baseColorFactor": [1.0, 1.0, 1.0, float(alpha)],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.9,
        }
        # Transparency policy that survives a real-time PBR renderer:
        #   - texture with genuine cut-outs -> MASK (no depth sorting needed)
        #   - uniformly semi-transparent material (mat.alpha < 1) -> BLEND
        #   - everything else -> OPAQUE
        # This avoids the see-through/inside-out look you get when every
        # alpha-channel texture is naively marked BLEND.
        alpha_mode = "OPAQUE"
        alpha_cutoff = None
        if mat.texture_index in tex_cache:
            img_i, has_cutout = tex_cache[mat.texture_index]
            pbr["baseColorTexture"] = {"index": img_i}
            if has_cutout:
                alpha_mode = "MASK"
                alpha_cutoff = 0.5
        else:
            pbr["baseColorFactor"] = [col.r, col.g, col.b, float(alpha)]
        if alpha < 1.0:
            alpha_mode = "BLEND"
            alpha_cutoff = None
        gmat = {
            "name": (mat.name or f"mat{len(mat_prims)}")[:40],
            "pbrMetallicRoughness": pbr,
            "doubleSided": True,
            "alphaMode": alpha_mode,
        }
        if alpha_cutoff is not None:
            gmat["alphaCutoff"] = alpha_cutoff
        mat_prims.append((bytes(ib), len(run), gmat))

    # ---- assemble single binary buffer ----
    blob = bytearray()
    bviews = []

    def add_view(data, target=None):
        data = pad4(bytes(data))
        bv = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)}
        if target:
            bv["target"] = target
        blob.extend(data)
        bviews.append(bv)
        return len(bviews) - 1

    pos_bv = add_view(pos, 34962)
    nrm_bv = add_view(nrm, 34962)
    uv_bv = add_view(uv, 34962)

    accessors = [
        {"bufferView": pos_bv, "componentType": 5126, "count": len(verts),
         "type": "VEC3", "min": pmin, "max": pmax},
        {"bufferView": nrm_bv, "componentType": 5126, "count": len(verts), "type": "VEC3"},
        {"bufferView": uv_bv, "componentType": 5126, "count": len(verts), "type": "VEC2"},
    ]

    primitives = []
    materials = []
    for ib, count, gmat in mat_prims:
        if count == 0:
            continue
        ibv = add_view(ib, 34963)
        acc = len(accessors)
        accessors.append({"bufferView": ibv, "componentType": 5125,
                          "count": count, "type": "SCALAR"})
        materials.append(gmat)
        primitives.append({
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
            "indices": acc, "material": len(materials) - 1,
        })

    gltf_images, gltf_textures = [], []
    for i, data in enumerate(images):
        ibv = add_view(data)
        gltf_images.append({"bufferView": ibv, "mimeType": "image/png"})
        gltf_textures.append({"source": i, "sampler": 0})

    gltf = {
        "asset": {"version": "2.0", "generator": "pmx2glb"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": m.name or "model"}],
        "meshes": [{"name": m.name or "model", "primitives": primitives}],
        "materials": materials,
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": bviews,
        "accessors": accessors,
    }
    if gltf_images:
        gltf["images"] = gltf_images
        gltf["textures"] = gltf_textures
        gltf["samplers"] = [{"magFilter": 9729, "minFilter": 9987,
                             "wrapS": 10497, "wrapT": 10497}]

    json_chunk = pad4(json.dumps(gltf, ensure_ascii=False).encode("utf-8"), b" ")
    bin_chunk = pad4(bytes(blob))

    def chunk(ctype, data):
        return struct.pack("<II", len(data), ctype) + data

    jc = chunk(0x4E4F534A, json_chunk)
    bc = chunk(0x004E4942, bin_chunk)
    total = 12 + len(jc) + len(bc)
    header = struct.pack("<III", 0x46546C67, 2, total)
    with open(out_path, "wb") as f:
        f.write(header + jc + bc)

    print(f"    -> {os.path.basename(out_path)}: "
          f"{len(verts)} verts, {sum(c for _, c, _ in mat_prims)//3} tris, "
          f"{len(materials)} prims, {len(images)} textures, "
          f"{total/1024/1024:.2f} MB")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python3 scripts/pmx2glb.py <input.pmx> [output.glb]")
        print("  if output is omitted, writes public/models/<input-name>.glb")
        sys.exit(1)
    pmx = sys.argv[1]
    if len(sys.argv) >= 3:
        out = sys.argv[2]
    else:
        # default: public/models/<pmx-filename>.glb (relative to project root)
        stem = os.path.splitext(os.path.basename(pmx))[0]
        out = os.path.join("public", "models", stem + ".glb")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    print(f"  converting {os.path.basename(pmx)} -> {out}")
    convert(pmx, out)
