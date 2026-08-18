#!/usr/bin/env python3
"""The open-sea placement audit — run after EVERY data regeneration.

Decodes the SHIPPED mapPois.g.ts and flags any non-exempt point sitting on
painted open water (>42 m from any land pixel of the game's own texture).
Born in the CEO's "MAKE SURE EVERYTHING IS WHERE U SAY IT IS" round
(2026-08-18): the game files park unplaced rows at world origin and a few
more float in the sea; the extractor drops them, and this audit proves the
drop worked. Expected output: exactly the two explained keepers —
the Sky-Island chest (flying island, z 266 m) and the Sanctuary-1
island-edge ore. Anything else is a regression.
"""
import base64
import re
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = np.asarray(Image.open(ROOT / 'tools' / '.cache' / 'T_WorldMap_hi.png').convert('RGB'))
H, W = src.shape[:2]
r = src[..., 0].astype(np.int16)
g = src[..., 1].astype(np.int16)
b = src[..., 2].astype(np.int16)
land = ~((b > g + 4) & (g > r + 6) & (r < 150))

ts = (ROOT / 'mobile' / 'src' / 'data' / 'mapPois.g.ts').read_text(encoding='utf-8')
flagged = []
for m in re.finditer(r"id: '([a-z_]+)'.*?maps: '([^']*)',\s*pts: '([^']*)'", ts, re.S):
    layer = m.group(1)
    if layer in ('crude_oil', 'alpha_pals'):
        continue
    maps = list(base64.b64decode(m.group(2)))
    for (u16, v16), mi in zip(struct.iter_unpack('<HH', base64.b64decode(m.group(3))), maps):
        if mi != 0:
            continue
        px, py = int(u16 / 65535.0 * W), int(v16 / 65535.0 * H)
        if land[py, px]:
            continue
        if any(land[max(0, py - k):py + k + 1, max(0, px - k):px + k + 1].any()
               for k in (2, 4, 8, 16, 24)):
            continue
        flagged.append((layer, px, py))

KNOWN = {('chest', 3714, 6397), ('ore', 5238, 4572)}
extra = [f for f in flagged if f not in KNOWN]
print(f'open-sea rows: {len(flagged)} ({len(extra)} unexplained)')
for f in extra:
    print('REGRESSION:', f)
raise SystemExit(1 if extra else 0)
