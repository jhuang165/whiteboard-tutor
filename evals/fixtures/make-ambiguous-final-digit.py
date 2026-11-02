"""Render evals/fixtures/ambiguous-final-digit.png: Bayes work whose final digit reads as 3 or 8.

macOS fonts. Run: python3 -I evals/fixtures/make-ambiguous-final-digit.py evals/fixtures/ambiguous-final-digit.png
"""
import random
import sys

from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
random.seed(7)
MARGIN = 200
W, H = 910 + 2 * MARGIN, 320 + 2 * MARGIN
img = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(img)

typed = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 26)
hand = ImageFont.truetype('/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf', 40)
ink = (30, 30, 30)


def at(x, y):
    return x + MARGIN, y + MARGIN


# Typed problem statement (a text shape).
d.text(at(0, 4), 'Problem: P(A) = 0.3, P(B|A) = 0.4, P(B|not A) = 0.1. Find P(A|B).', font=typed, fill=(0, 0, 0))


def scrawl(x, y, text):
    """Handwriting font with a little jitter per character, like pen ink."""
    cx, cy = at(x, y)
    boxes = []
    for ch in text:
        dy = random.uniform(-2, 2)
        d.text((cx, cy + dy), ch, font=hand, fill=ink)
        boxes.append(d.textbbox((cx, cy + dy), ch, font=hand))
        cx += d.textlength(ch, font=hand) + random.uniform(-1, 1.5)
    return boxes


scrawl(0, 80, 'P(B) = .4(.3) + .1(.7) = .19')
scrawl(0, 170, 'P(A|B) = .12 / .19')
boxes = scrawl(0, 260, '≈ 0.63')

# Nearly close the 3's left side with short strokes, leaving small gaps, so it reads as 3 or 8.
x0, y0, x1, y1 = boxes[-1]
mid = (y0 + y1) / 2
w = x1 - x0
d.arc((x0 + 1, y0 + 1, x0 + w * 0.95, mid + 1), start=135, end=225, fill=ink, width=4)
d.arc((x0 - 1, mid - 1, x0 + w, y1 - 1), start=140, end=220, fill=ink, width=4)

img.save(out, optimize=True)
print(out, img.size)
