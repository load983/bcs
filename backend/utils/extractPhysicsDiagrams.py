#!/usr/bin/env python3
"""Extract the four vector diagrams from the supplied Physics MCQ PDF.
The diagrams are vector artwork, so pdfimages cannot extract them directly; render
only the known diagram panels and preserve them as compact JPEG data URLs.
"""
import base64
import io
import json
import os
import subprocess
import sys
import tempfile
from PIL import Image

# page: (left, top, right, bottom), normalized against the rendered page
PANELS = {
    1: (0.08, 0.46, 0.93, 0.665),   # Q1 vector addition
    7: (0.08, 0.625, 0.93, 0.795),  # Q13 projectile trajectory
    8: (0.08, 0.775, 0.93, 0.995),  # Q15 Atwood machine
    45: (0.08, 0.595, 0.93, 0.84), # Q89 Carnot cycle
}
QUESTION_BY_PAGE = {1: 1, 7: 13, 8: 15, 45: 89}


def render_page(pdf, page, out_dir):
    prefix = os.path.join(out_dir, f"page-{page}")
    subprocess.run(
        ["pdftoppm", "-f", str(page), "-l", str(page), "-png", "-scale-to", "1400", pdf, prefix],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return prefix + f"-{page:02d}.png"


def main(pdf):
    result = {}
    with tempfile.TemporaryDirectory(prefix="physics-diagrams-") as tmp:
        for page, box in PANELS.items():
            source = render_page(pdf, page, tmp)
            image = Image.open(source).convert("RGB")
            w, h = image.size
            left, top, right, bottom = box
            crop = image.crop((int(w * left), int(h * top), int(w * right), int(h * bottom)))
            # White background keeps the original line art crisp in the teacher editor.
            output = io.BytesIO()
            crop.save(output, format="JPEG", quality=88, optimize=True, progressive=True)
            result[str(QUESTION_BY_PAGE[page])] = "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 2 or not os.path.isfile(sys.argv[1]):
        raise SystemExit("usage: extractPhysicsDiagrams.py FILE.pdf")
    main(sys.argv[1])
