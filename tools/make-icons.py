"""Draws HANDit's app icons (PNG) into web/public: the favicon's mark on an ink tile.

usage: python3 tools/make-icons.py
The mark is two upright bars joined by a crossbar (an "H" made of two hands meeting), with the
marigold tag dot above it. Drawn at 4x and scaled down for smooth edges.
"""
from pathlib import Path

from PIL import Image, ImageDraw

INK = (23, 32, 51, 255)
PAPER = (255, 255, 255, 255)
TAG = (255, 212, 71, 255)
OUT = Path(__file__).resolve().parent.parent / "web" / "public"


def tile(size: int, safe: float, rounded: bool) -> Image.Image:
    """`safe` is the fraction of the tile the mark may use (maskable icons need a wider margin)."""
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22) if rounded else 0, fill=INK)
    m = s * (1 - safe) / 2  # margin
    w = s * safe
    bar = w * 0.17
    top, bottom = m + w * 0.22, m + w
    left, right = m + w * 0.12, m + w * 0.88
    r = bar / 2
    d.rounded_rectangle((left, top, left + bar, bottom), radius=r, fill=PAPER)
    d.rounded_rectangle((right - bar, top, right, bottom), radius=r, fill=PAPER)
    mid = (top + bottom) / 2
    d.rounded_rectangle((left, mid - bar / 2, right, mid + bar / 2), radius=r, fill=PAPER)
    dot = bar * 0.95
    cx = (left + right) / 2
    d.ellipse((cx - dot, m + w * 0.02 - dot * 0.2, cx + dot, m + w * 0.02 + dot * 1.8), fill=TAG)
    return img.resize((size, size), Image.LANCZOS)


for name, size, safe, rounded in [
    ("icon-192.png", 192, 0.62, True),
    ("icon-512.png", 512, 0.62, True),
    ("icon-maskable-512.png", 512, 0.46, False),  # the OS crops it to its own shape
    ("apple-touch-icon.png", 180, 0.62, False),  # iOS rounds the corners itself
]:
    tile(size, safe, rounded).save(OUT / name, optimize=True)
    print("wrote", OUT / name)
