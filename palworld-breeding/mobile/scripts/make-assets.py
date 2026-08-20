#!/usr/bin/env python3
"""Generate the Paldexia app icons.

The mark: an original pal-sphere-style orb — a blue glass sphere with a gold
meridian ring that passes BEHIND the sphere at the back and in front at the
near side, plus seated gold pole caps.

Rewritten 2026-08-20 (CEO: "the logo is not very good — make it better, more
accurate, polished, smooth"). The previous version drew flat vector shapes with
hand-rolled PNG writing: banded shading, a lopsided ribbon instead of a real
ring, and cones that floated rather than sat on the sphere. This version shades
a real sphere per pixel — Lambert diffuse with a wrapped terminator, a
Blinn-Phong specular, and a Fresnel rim so the edge glows like glass — and
renders the ring in two passes so it actually encircles the orb.

Outputs (mobile/assets/):
  icon.png          1024x1024 opaque  — iOS masks its own corners
  adaptive-icon.png 1024x1024 opaque  — Android foreground (safe zone)
  splash-icon.png   512x512  alpha    — orb only, for the splash screen

Run:  python scripts/make-assets.py
Then: python scripts/make-dev-icon.py   (restamps the DEV band on top)
Icons are native — an OTA can never change them, only a rebuild can.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / "assets"

BG = (12, 22, 24)

# Blue glass, dark to light. Sampled to stay in the app's own palette.
DEEP = np.array([14, 62, 112], dtype=np.float64)
MID = np.array([46, 142, 206], dtype=np.float64)
LIT = np.array([166, 224, 248], dtype=np.float64)
RIM = np.array([150, 214, 245], dtype=np.float64)

# Gold as shading stops, so the knobs can be lit by the same shader as the orb.
G_DEEP = np.array([92, 60, 14], dtype=np.float64)
G_MID = np.array([206, 156, 52], dtype=np.float64)
G_LIT = np.array([252, 232, 176], dtype=np.float64)
G_RIM = np.array([255, 214, 130], dtype=np.float64)

GOLD_HI = (247, 220, 150)
GOLD_MID = (226, 178, 74)
GOLD_LO = (150, 108, 32)

SS = 4  # supersample factor for the vector passes (ring, caps)


def _unit(v):
    v = np.array(v, dtype=np.float64)
    return v / np.linalg.norm(v)


def shade_sphere(size, cx, cy, radius, deep=None, mid=None, lit=None, rim=None,
                 spec_power=55.0, spec_gain=0.5):
    """A lit sphere as RGBA, anti-aliased analytically at the silhouette."""
    deep = DEEP if deep is None else deep
    mid = MID if mid is None else mid
    lit = LIT if lit is None else lit
    rim = RIM if rim is None else rim
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    px = xx + 0.5 - cx
    py = yy + 0.5 - cy

    nx = px / radius
    ny = py / radius
    r2 = nx * nx + ny * ny
    z = np.sqrt(np.clip(1.0 - r2, 0.0, None))

    light = _unit((-0.42, -0.58, 0.70))
    view = np.array([0.0, 0.0, 1.0])
    half = _unit(light + view)

    ndotl = nx * light[0] + ny * light[1] + z * light[2]
    # Wrapped diffuse: softens the terminator so the sphere reads as glass
    # rather than a hard-lit billiard ball.
    diffuse = np.clip((ndotl + 0.35) / 1.35, 0.0, 1.0)

    ndoth = np.clip(nx * half[0] + ny * half[1] + z * half[2], 0.0, 1.0)
    # A tight glint plus a broad sheen: one alone reads as a lens flare.
    specular = ndoth ** spec_power * 0.78 + ndoth ** 8.0 * 0.09

    # Bounce light off the imagined ground, so the base is dark but not dead.
    bounce_dir = _unit((0.18, 0.80, 0.42))
    bounce = np.clip(nx * bounce_dir[0] + ny * bounce_dir[1] + z * bounce_dir[2], 0.0, 1.0) ** 2.0

    fresnel = np.clip(1.0 - z, 0.0, 1.0) ** 3.0
    # Occlusion toward the base keeps it from looking like a lit balloon.
    occlude = np.clip((ny + 0.15) / 1.15, 0.0, 1.0) ** 2.0

    # Two-stop ramp: deep core -> mid body -> lit crown.
    t = diffuse[..., None]
    body = deep + (mid - deep) * np.clip(t * 1.9, 0, 1)
    body = body + (lit - mid) * np.clip((t - 0.58) / 0.42, 0, 1)
    body = body * (1.0 - 0.32 * occlude[..., None])

    rgb = (body
           + rim * (fresnel[..., None] * 0.5)
           + rim * (bounce[..., None] * 0.16)
           + 255.0 * (specular[..., None] * spec_gain))
    rgb = np.clip(rgb, 0, 255)

    r_px = np.sqrt(px * px + py * py)
    alpha = np.clip(radius - r_px + 0.5, 0.0, 1.0) * 255.0

    out = np.dstack([rgb, alpha]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _gold_gradient(size):
    """Vertical gold ramp used to colour the ring and caps."""
    grad = Image.new("RGB", (1, size))
    d = ImageDraw.Draw(grad)
    for y in range(size):
        f = y / max(1, size - 1)
        if f < 0.5:
            a, b, k = GOLD_HI, GOLD_MID, f / 0.5
        else:
            a, b, k = GOLD_MID, GOLD_LO, (f - 0.5) / 0.5
        d.point((0, y), fill=tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3)))
    return grad.resize((size, size), Image.NEAREST)


def _gold_directional(size):
    """Gold ramp running along the light direction, so the ring is lit like the
    orb instead of reading as a flat printed band."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    t = ((size - xx) * 0.42 + (size - yy) * 0.58) / (size * 1.0)
    t = np.clip((t - t.min()) / max(1e-6, (t.max() - t.min())), 0, 1)[..., None]
    lo = np.array(GOLD_LO, dtype=np.float64)
    mid = np.array(GOLD_MID, dtype=np.float64)
    hi = np.array(GOLD_HI, dtype=np.float64)
    rgb = lo + (mid - lo) * np.clip(t * 2.0, 0, 1)
    rgb = rgb + (hi - mid) * np.clip((t - 0.5) * 2.0, 0, 1)
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def ring_layer(size, cx, cy, rx, ry, thickness):
    """The meridian ring, as a full RGBA layer (front and back together)."""
    big = size * SS
    box_o = [(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS]
    inset = thickness * SS
    box_i = [box_o[0] + inset, box_o[1] + inset, box_o[2] - inset, box_o[3] - inset]

    outer = Image.new("L", (big, big), 0)
    ImageDraw.Draw(outer).ellipse(box_o, fill=255)
    inner = Image.new("L", (big, big), 0)
    ImageDraw.Draw(inner).ellipse(box_i, fill=255)
    mask = ImageChops.subtract(outer, inner).resize((size, size), Image.LANCZOS)

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer.paste(_gold_directional(size), (0, 0))
    layer.putalpha(mask)
    return layer


def knob(size, cx, cy, r):
    """A gold pole knob: the same shader as the orb, so it reads as turned metal
    seated on the sphere rather than a cone pasted over it."""
    return shade_sphere(size, cx, cy, r, deep=G_DEEP, mid=G_MID, lit=G_LIT,
                        rim=G_RIM, spec_power=70.0, spec_gain=0.5)


def render(size, orb_scale, opaque, out_name):
    S = size
    cx = cy = S / 2.0
    radius = S * orb_scale

    canvas = Image.new("RGBA", (S, S), (BG[0], BG[1], BG[2], 255) if opaque else (0, 0, 0, 0))

    rx = radius * 1.19
    ry = radius * 0.40
    thickness = max(2.0, radius * 0.085)
    ring = ring_layer(S, cx, cy, rx, ry, thickness)

    # Back half of the ring first, so the sphere occludes it.
    back = ring.copy()
    bm = Image.new("L", (S, S), 0)
    ImageDraw.Draw(bm).rectangle([0, 0, S, int(cy)], fill=255)
    back.putalpha(ImageChops.multiply(back.split()[3], bm))
    canvas.alpha_composite(back)

    caps = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    kr = radius * 0.235
    caps.alpha_composite(knob(S, cx, cy - radius * 0.965, kr))
    caps.alpha_composite(knob(S, cx, cy + radius * 0.965, kr))
    canvas.alpha_composite(caps)

    # Contact shadow tucked under the orb.
    shadow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(shadow).ellipse(
        [cx - radius * 0.92, cy + radius * 0.30, cx + radius * 0.92, cy + radius * 1.30],
        fill=90,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.045))
    canvas.alpha_composite(Image.merge("RGBA", (
        Image.new("L", (S, S), 0), Image.new("L", (S, S), 0), Image.new("L", (S, S), 0), shadow)))

    canvas.alpha_composite(shade_sphere(S, cx, cy, radius))

    # Front half of the ring, over the sphere.
    front = ring.copy()
    fm = Image.new("L", (S, S), 0)
    ImageDraw.Draw(fm).rectangle([0, int(cy), S, S], fill=255)
    front.putalpha(ImageChops.multiply(front.split()[3], fm))
    canvas.alpha_composite(front)

    # Caps again on top, so their near edge overlaps the orb like real metal.
    tip = Image.new("L", (S, S), 0)
    ImageDraw.Draw(tip).rectangle([0, 0, S, int(cy - radius * 0.965)], fill=255)
    ImageDraw.Draw(tip).rectangle([0, int(cy + radius * 0.965), S, S], fill=255)
    caps_top = caps.copy()
    caps_top.putalpha(ImageChops.multiply(caps_top.split()[3], tip))
    canvas.alpha_composite(caps_top)

    if opaque:
        flat = Image.new("RGB", (S, S), BG)
        flat.paste(canvas, (0, 0), canvas)
        flat.save(ASSETS / out_name, "PNG")
    else:
        canvas.save(ASSETS / out_name, "PNG")
    print("wrote", out_name, f"({S}x{S})")


if __name__ == "__main__":
    render(1024, 0.335, True, "icon.png")
    render(1024, 0.270, True, "adaptive-icon.png")   # Android safe zone
    render(512, 0.350, False, "splash-icon.png")
