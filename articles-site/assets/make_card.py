"""Draw the site banner that link previews use (Twitter/X, Discord, iMessage…): card.png, 1200 x 630.

Run after changing the site's look:  python articles-site/assets/make_card.py

It's the site as it looks at the top of a page, minus the account buttons: the parchment with its
rough edges (the same pieces the site draws, from make_edges.py), the badge, the name, a
hand-drawn ink line, and the tagline.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 630
FRAME = 92                      # how wide the rough edge is drawn
PAPER = (233, 203, 119)         # --paper in site.css
INK, INK_SOFT = (31, 22, 10), (59, 44, 20)
FONTS = r"C:\Windows\Fonts"     # Segoe UI stands in for Open Sans, the site's font


def font(name, size):
    for f in (name, "arialbd.ttf" if "b" in name else "arial.ttf"):
        try:
            return ImageFont.truetype(os.path.join(FONTS, f), size)
        except OSError:
            continue
    return ImageFont.load_default()


def parchment():
    card = Image.new("RGB", (W, H), PAPER)
    edge = lambda f: Image.open(os.path.join(HERE, f)).convert("RGB")  # noqa: E731
    left, right = edge("edge-left.png"), edge("edge-right.png")
    for img, x in ((left, 0), (right, W - FRAME)):
        strip = img.resize((FRAME, round(img.height * FRAME / img.width)))
        for y in range(0, H, strip.height):
            card.paste(strip, (x, y))
    card.paste(edge("edge-top.png").resize((W, FRAME)), (0, 0))
    card.paste(edge("edge-bottom.png").resize((W, FRAME)), (0, H - FRAME))
    return card


def ink_rule(draw, x0, x1, y, seed=7):
    """A slightly tilted, slightly wobbly stroke, like the site's hand-drawn lines."""
    rnd = random.Random(seed)
    tilt, pts = rnd.uniform(-3, 3), []
    for i in range(61):
        t = i / 60
        wob = math.sin(t * math.pi * 3 + rnd.uniform(0, 0.3)) * 1.6 + rnd.uniform(-0.6, 0.6)
        pts.append((x0 + (x1 - x0) * t, y + tilt * (t - 0.5) * 2 + wob))
    draw.line(pts, fill=(13, 9, 4), width=5, joint="curve")


def main():
    card = parchment()
    draw = ImageDraw.Draw(card)
    badge = Image.open(os.path.join(HERE, "icon-512.png")).convert("RGBA").resize((230, 230), Image.LANCZOS)
    bx, by = 150, (H - 230) // 2 - 6
    card.paste(badge, (bx, by), badge)
    name, tag = font("segoeuib.ttf", 70), font("segoeui.ttf", 31)
    tx = bx + 230 + 50
    draw.text((tx, H // 2 - 108), "According To", font=name, fill=INK)
    draw.text((tx, H // 2 - 30), "Knowledge", font=name, fill=INK)
    ink_rule(draw, tx, W - 150, H // 2 + 72)
    draw.text((tx, H // 2 + 100), "Articles on religion, belief and discourse", font=tag, fill=INK_SOFT)
    out = os.path.join(HERE, "card.png")
    card.save(out, optimize=True)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main()
