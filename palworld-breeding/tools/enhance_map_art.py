#!/usr/bin/env python3
"""One-time, CEO-approved AI enhancement of the Palpagos map art.

Produces tools/.cache/T_WorldMap_enhanced16k.png (16384) from the game's own
8192 T_WorldMap_hi.png, using Real-ESRGAN x4plus (xinntao/Real-ESRGAN
v0.2.5.0 portable, realesrgan-ncnn-vulkan) quadrant-wise, then downsampled
to 2x. COSMETIC ONLY: his condition was "no accuracy nothing what so ever
only image quality", and the alignment gate below enforces it — any
measured shift versus the original fails the run. Every pin is projected
from coordinates and never touches this image; the placement audits
(audit_map_sea.py) keep reading the untouched original.

Usage: python tools/enhance_map_art.py <path-to-realesrgan-ncnn-vulkan.exe>
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
SRC = CACHE / "T_WorldMap_hi.png"
OUT = CACHE / "T_WorldMap_enhanced16k.png"
OV = 64          # quadrant overlap so the model never sees a hard edge
W = 8192
HALF = W // 2


def main() -> None:
    exe = Path(sys.argv[1])
    src = Image.open(SRC).convert("RGB")
    out = Image.new("RGB", (2 * W, 2 * W))
    for qy in range(2):
        for qx in range(2):
            x0, y0 = max(0, qx * HALF - OV), max(0, qy * HALF - OV)
            x1, y1 = min(W, (qx + 1) * HALF + OV), min(W, (qy + 1) * HALF + OV)
            qin = CACHE / f"_enh_q{qx}{qy}.png"
            qout = CACHE / f"_enh_q{qx}{qy}_x4.png"
            src.crop((x0, y0, x1, y1)).save(qin)
            subprocess.run([str(exe), "-i", str(qin), "-o", str(qout),
                            "-n", "realesrgan-x4plus"], check=True)
            q2 = Image.open(qout).resize(((x1 - x0) * 2, (y1 - y0) * 2), Image.LANCZOS)
            lx, ty = (HALF * qx - x0) * 2, (HALF * qy - y0) * 2
            out.paste(q2.crop((lx, ty, lx + HALF * 2, ty + HALF * 2)),
                      (qx * HALF * 2, qy * HALF * 2))
            qin.unlink()
            qout.unlink()
            print(f"quad {qx},{qy} done")

    # THE ALIGNMENT GATE — his promise, enforced. Phase-correlate landmark
    # crops of the enhanced-downscaled image against the original; any
    # integer shift fails the build.
    O = np.asarray(src.convert("L")).astype(np.float64)
    E = np.asarray(out.convert("L").resize((W, W), Image.LANCZOS)).astype(np.float64)
    for cx, cy in [(1500, 1500), (6500, 1500), (4096, 4096), (1500, 6500),
                   (6500, 6500), (4096, 2000), (2000, 4096)]:
        r = 256
        a = O[cy - r:cy + r, cx - r:cx + r]
        b = E[cy - r:cy + r, cx - r:cx + r]
        a = a - a.mean()
        b = b - b.mean()
        F = np.fft.rfft2(a) * np.conj(np.fft.rfft2(b))
        F /= np.abs(F) + 1e-9
        corr = np.fft.irfft2(F, a.shape)
        peak = np.unravel_index(np.argmax(corr), corr.shape)
        dy = peak[0] if peak[0] <= r else peak[0] - 2 * r
        dx = peak[1] if peak[1] <= r else peak[1] - 2 * r
        if dx or dy:
            raise SystemExit(f"ALIGNMENT FAIL at ({cx},{cy}): shift ({dx},{dy})")
        print(f"({cx},{cy}) aligned")
    out.save(OUT)
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
