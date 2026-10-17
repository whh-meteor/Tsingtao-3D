"""Derive a signed coastal distance / onshore direction field from existing OSM masks.

No network requests. R = signed distance (-4096..4096m); GB = onshore X/Z.
Rows run north to south, matching the existing managed textures.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
region = json.loads((DATA / 'region.json').read_text(encoding='utf-8'))
local = json.loads((DATA / 'scene.json').read_text(encoding='utf-8'))
regional_mask = np.asarray(Image.open(DATA / 'regional-shore.png'))[:, :, 1] > 127
local_mask = np.asarray(Image.open(DATA / 'shore-distance.png'))[:, :, 1] > 127
rb, lb = region['bounds'], local['shoreTexture']['bounds']


def field(mask, sx, sz):
    distance = (distance_transform_edt(mask, sampling=(sz, sx))
                - distance_transform_edt(~mask, sampling=(sz, sx)))
    # Subtract half a pixel so the distance refers to the coastline between cells.
    distance -= np.sign(distance) * min(sx, sz) / 2
    smooth = gaussian_filter(distance, max(1, 24 / min(sx, sz)))
    gz, gx = np.gradient(smooth, -sz, sx)
    length = np.maximum(np.hypot(gx, gz), 1e-6)
    encoded = np.round((np.clip(distance / 4096, -1, 1) * .5 + .5) * 255).astype(np.uint8)
    pixels = np.empty((*mask.shape, 4), dtype=np.uint8)
    pixels[:, :, 0] = encoded
    pixels[:, :, 1] = np.round((gx / length * .5 + .5) * 255).astype(np.uint8)
    pixels[:, :, 2] = np.round((gz / length * .5 + .5) * 255).astype(np.uint8)
    pixels[:, :, 3] = 255
    # Direction is never sampled outside the coastal bank; neutralize the
    # unused interior / open sea to keep delivery small and deterministic.
    pixels[(distance < -2000) | (distance > 850), 1:3] = 128
    return pixels


height, width = regional_mask.shape
pixels = field(regional_mask, (rb['maxX']-rb['minX'])/(width-1), (rb['maxZ']-rb['minZ'])/(height-1))
Image.fromarray(pixels).save(DATA / 'fog-coast-regional.png', optimize=True)

# Pad the detailed field with the regional sea / land mask. The local image
# boundary must never be mistaken for a coastline by the distance transform.
spacing, padding = 8, 4600
x = np.arange(lb['minX']-padding, lb['maxX']+padding+spacing, spacing)
z = np.arange(lb['maxZ']+padding, lb['minZ']-padding-spacing, -spacing)
xx, zz = np.meshgrid(x, z)
uv = [(rb['maxZ']-zz)/(rb['maxZ']-rb['minZ'])*(height-1),
      (xx-rb['minX'])/(rb['maxX']-rb['minX'])*(width-1)]
mask = map_coordinates(regional_mask.astype(np.uint8), uv, order=0, mode='nearest').astype(bool)
inside = (xx>=lb['minX']) & (xx<=lb['maxX']) & (zz>=lb['minZ']) & (zz<=lb['maxZ'])
lh, lw = local_mask.shape
mask[inside] = map_coordinates(local_mask.astype(np.uint8),
    [(lb['maxZ']-zz[inside])/(lb['maxZ']-lb['minZ'])*(lh-1),
     (xx[inside]-lb['minX'])/(lb['maxX']-lb['minX'])*(lw-1)], order=0, mode='nearest')
pixels = field(mask, spacing, spacing)
rows, cols = np.flatnonzero((z>=lb['minZ']) & (z<=lb['maxZ'])), np.flatnonzero((x>=lb['minX']) & (x<=lb['maxX']))
pixels = pixels[rows[0]:rows[-1]+1, cols[0]:cols[-1]+1]
Image.fromarray(pixels).save(DATA / 'fog-coast-local.png', optimize=True)
detail_bounds = dict(minX=float(x[cols[0]]), maxX=float(x[cols[-1]]), minZ=float(z[rows[-1]]), maxZ=float(z[rows[0]]))
region['metadata']['coastalFog'] = {
    'regional': {'url':'/data/fog-coast-regional.png', 'bounds':rb},
    'local': {'url':'/data/fog-coast-local.png', 'bounds':detail_bounds},
    'distanceRange':4096,
    'channels':'R=signed distance (-4096m sea to +4096m land); GB=onshore X/Z encoded 0..1; A=255',
    'source':'Derived from existing OSM regional-shore.png and shore-distance.png; no new geographic features',
    'rows':'north to south; invertY=false',
}
(DATA / 'region.json').write_text(json.dumps(region, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('Coastal fog fields generated from OSM masks:', width, height, 'and', pixels.shape[1], pixels.shape[0])
