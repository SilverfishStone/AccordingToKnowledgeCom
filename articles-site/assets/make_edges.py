"""Cut parchment.png into the four edge pieces the site draws around every page.

Run after replacing parchment.png:  python articles-site/assets/make_edges.py

The corners and rough edges (the outer 110 px of the picture) become edge-top/bottom
(stretched across the page) and edge-left/right (repeated down it; each is its strip plus a
mirror image, so the repeats join without a seam). The flat middle is just the paper colour,
--paper in site.css.
"""
import os
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
S = 110   # must match --slice in site.css

im = Image.open(os.path.join(HERE, "parchment.png")).convert("RGB")
W, H = im.size
im.crop((0, 0, W, S)).save(os.path.join(HERE, "edge-top.png"), optimize=True)
im.crop((0, H - S, W, H)).save(os.path.join(HERE, "edge-bottom.png"), optimize=True)
for name, box in (("edge-left.png", (0, S, S, H - S)), ("edge-right.png", (W - S, S, W, H - S))):
    seg = im.crop(box)
    tile = Image.new("RGB", (seg.width, seg.height * 2))
    tile.paste(seg, (0, 0))
    tile.paste(ImageOps.flip(seg), (0, seg.height))
    tile.save(os.path.join(HERE, name), optimize=True)
print("Edges made from", W, "x", H, "parchment.")
