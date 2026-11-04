#!/usr/bin/env python3
"""
Zerlegt das Platinen-Hintergrundbild in die 10 Leiterbahn-Bündel P1–P10.

Ausgabe:
  src/assets/pcb/board.jpg          – das Hintergrundbild (Kopie)
  src/assets/pcb/trace-p<N>.png     – Leucht-Maske je Bündel (weiß auf transparent, zugeschnitten)
  src/fx/pcb/boardLayout.json       – Bildgröße, Pads, Chip, Masken-Position und Mittellinie je Bündel

Aufruf:  python3 scripts/extract-board.py <bild.jpg>
Benötigt ImageMagick (`magick`), sonst nur die Python-Standardbibliothek.
"""
import json
import os
import subprocess
import sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'Gemini_Generated_Image_fnfzbgfnfzbgfnfz.jpeg')
ASSETS = os.path.join(ROOT, 'src', 'assets', 'pcb')
LAYOUT = os.path.join(ROOT, 'src', 'fx', 'pcb', 'boardLayout.json')

# Ungefähre Lage im Bild (1372 × 768), von Hand abgelesen
PAD_Y = [125, 247, 383, 518, 655]
LEFT_PAD_X, RIGHT_PAD_X = 266, 1110
CHIP = {'x': 576, 'y': 252, 'width': 226, 'height': 238}
# Suchbereich für Bahnen: zwischen Pads und Chip
# Vor dem Chip einen Streifen auslassen: dort laufen die Pins so dicht, dass Bündel verschmelzen
CHIP_GAP = 14
LEFT_BAND = (252, CHIP['x'] - CHIP_GAP)
RIGHT_BAND = (CHIP['x'] + CHIP['width'] + CHIP_GAP, 1124)
Y_BAND = (95, 690)


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


# Die Spielfläche rechnet immer in dieser Höhe (Breite folgt dem Seitenverhältnis).
# Größere Bilder (z. B. 2× hochgerechnet) werden nur für die Erkennung verkleinert;
# als Hintergrund wird das Bild in voller Auflösung übernommen.
DESIGN_HEIGHT = 768


def image_size(path):
    w, h = run('magick', 'identify', '-format', '%w %h', path).decode().split()
    return int(w), int(h)


def read_mask(path, size=None):
    """Binärmaske der hellen, warmen (goldenen) Pixel als PGM lesen."""
    resize = ['-resize', f'{size[0]}x{size[1]}!'] if size else []
    pgm = run('magick', path, *resize,
              '-fx', '(0.3*r+0.59*g+0.11*b > 0.38 && r-b > 0.08 && r >= g && g >= b*0.95) ? 1 : 0',
              '-colorspace', 'gray', '-depth', '8', 'pgm:-')
    # P5-Header: "P5\n<w> <h>\n255\n"
    parts = pgm.split(b'\n', 3)
    w, h = map(int, parts[1].split())
    data = parts[3]
    return w, h, data


def components(w, h, data):
    seen = bytearray(w * h)
    comps = []
    for y in range(Y_BAND[0], Y_BAND[1]):
        for x in list(range(*LEFT_BAND)) + list(range(*RIGHT_BAND)):
            i = y * w + x
            if data[i] < 128 or seen[i]:
                continue
            q = deque([i])
            seen[i] = 1
            px = []
            while q:
                j = q.popleft()
                px.append(j)
                jx, jy = j % w, j // w
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = jx + dx, jy + dy
                        if not (Y_BAND[0] <= ny < Y_BAND[1]):
                            continue
                        if not (LEFT_BAND[0] <= nx < LEFT_BAND[1] or RIGHT_BAND[0] <= nx < RIGHT_BAND[1]):
                            continue
                        k = ny * w + nx
                        if data[k] >= 128 and not seen[k]:
                            seen[k] = 1
                            q.append(k)
            comps.append(px)
    return comps


def rdp(points, eps):
    """Ramer-Douglas-Peucker: behält nur Punkte, die mehr als eps von der Geraden abweichen."""
    if len(points) < 3:
        return points
    (ax, ay), (bx, by) = points[0], points[-1]
    dx, dy = bx - ax, by - ay
    norm = (dx * dx + dy * dy) ** 0.5 or 1
    best, idx = 0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
        if d > best:
            best, idx = d, i
    if best <= eps:
        return [points[0], points[-1]]
    return rdp(points[:idx + 1], eps)[:-1] + rdp(points[idx:], eps)


def main():
    os.makedirs(ASSETS, exist_ok=True)
    src_w, src_h = image_size(SRC)
    design = (round(src_w * DESIGN_HEIGHT / src_h), DESIGN_HEIGHT)
    w, h, data = read_mask(SRC, design if (src_w, src_h) != design else None)
    bundles = {n: [] for n in range(1, 11)}
    for px in components(w, h, data):
        if len(px) < 60:
            continue
        xs = [p % w for p in px]
        left = min(xs) < (LEFT_BAND[0] + LEFT_BAND[1]) / 2
        end_x = min(xs) if left else max(xs)
        # Bahn muss vom Pad bis (fast) an den Chip reichen
        reaches_pad = end_x <= LEFT_PAD_X + 14 if left else end_x >= RIGHT_PAD_X - 14
        reaches_chip = (max(xs) >= LEFT_BAND[1] - 4) if left else (min(xs) <= RIGHT_BAND[0] + 4)
        if not (reaches_pad and reaches_chip):
            continue
        pad_ys = [p // w for p in px if abs(p % w - end_x) <= 6]
        y_at_pad = sum(pad_ys) / len(pad_ys)
        row = min(range(5), key=lambda r: abs(PAD_Y[r] - y_at_pad))
        if abs(PAD_Y[row] - y_at_pad) > 30:
            continue
        pad = 2 * row + (1 if left else 2)  # links ungerade, rechts gerade
        bundles[pad].extend(px)

    layout = {'width': w, 'height': h, 'image': {'width': src_w, 'height': src_h}, 'chip': CHIP, 'pads': []}
    for n in range(1, 11):
        px = bundles[n]
        if not px:
            print(f'P{n}: KEINE BAHN GEFUNDEN', file=sys.stderr)
            sys.exit(1)
        left = n % 2 == 1
        xs = [p % w for p in px]
        ys = [p // w for p in px]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        # Mittellinie: pro Spalte mittlere Höhe des Bündels, Pad → Chip
        cols = {}
        for p in px:
            cols.setdefault(p % w, []).append(p // w)
        line = []
        rng = range(x0, x1 + 1) if left else range(x1, x0 - 1, -1)
        for x in rng:
            if x in cols:
                c = cols[x]
                line.append((x, (min(c) + max(c)) / 2))
        # glätten (gleitender Mittelwert) und vereinfachen (Ramer-Douglas-Peucker)
        k = 7
        smooth = []
        for i in range(len(line)):
            win = line[max(0, i - k):i + k + 1]
            smooth.append((line[i][0], sorted(y for _, y in win)[len(win) // 2]))
        smooth[0], smooth[-1] = line[0], line[-1]
        pts = rdp(smooth, 1.6)
        # Maske als PNG (weiß, Alpha = Bahn), 1 px Rand
        mw, mh = x1 - x0 + 3, y1 - y0 + 3
        buf = bytearray(mw * mh)
        for p in px:
            buf[(p // w - y0 + 1) * mw + (p % w - x0 + 1)] = 255
        pgm = b'P5\n%d %d\n255\n' % (mw, mh) + bytes(buf)
        out = os.path.join(ASSETS, f'trace-p{n}.png')
        subprocess.run(['magick', 'pgm:-', '-morphology', 'Dilate', 'Disk:0.6', '-blur', '0x0.6',
                        '(', '+clone', '-fill', 'white', '-colorize', '100', ')', '+swap',
                        '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', out],
                       input=pgm, check=True)
        layout['pads'].append({
            'id': f'P{n}',
            'side': 'left' if left else 'right',
            'pad': {'x': LEFT_PAD_X if left else RIGHT_PAD_X, 'y': PAD_Y[(n - 1) // 2]},
            'mask': {'x': x0 - 1, 'y': y0 - 1, 'width': mw, 'height': mh},
            'path': [{'x': round(x, 1), 'y': round(y, 1)} for x, y in pts],
        })
        print(f'P{n}: {len(px)} px, {len(pts)} Knickpunkte, Maske {mw}×{mh}')

    # Hintergrund in voller Auflösung (nicht verkleinert)
    run('magick', SRC, '-strip', '-quality', '92', os.path.join(ASSETS, 'board.jpg'))
    print(f'Hintergrund: {src_w}×{src_h}, Spielfläche: {w}×{h}')
    with open(LAYOUT, 'w') as f:
        json.dump(layout, f, indent=1)
    print('geschrieben:', LAYOUT)


if __name__ == '__main__':
    main()
