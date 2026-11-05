"""从概念图切出原型用的精灵。

用法：python3 tools/extract_sprites.py
做法：按透明度找出每张图里的独立物体（连通区域），按从上到下、从左到右排序，
再按下面 PICKS 里的编号挑出需要的物体，缩放后存到 prototype/webgl/assets/。
换了概念图后，先运行 `python3 tools/extract_sprites.py --list` 看每个物体的编号再改 PICKS。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art/concept/batch1"
OUT = ROOT / "prototype/webgl/assets"

# (源文件, 物体编号, 输出名, 输出高度 px)
PICKS = [
    ("char_hero_01.png", 1, "hero_side", 160),
    ("char_hero_01.png", 0, "hero_front", 160),
    ("char_soldier_01.png", 1, "soldier_blue", 140),
    ("char_soldier_01.png", 11, "soldier_yellow", 140),
    ("char_soldier_01.png", 21, "soldier_red", 140),
    ("env_tent_01.png", 0, "tent_blue", 190),
    ("env_tent_01.png", 2, "tent_yellow", 190),
    ("env_tent_01.png", 4, "tent_red", 190),
    ("prop_chest_01.png", 0, "chest_wood", 56),
    ("prop_chest_01.png", 1, "chest_wood_open", 64),
    ("prop_chest_01.png", 2, "chest_bronze", 60),
    ("prop_chest_01.png", 3, "chest_bronze_open", 66),
    ("prop_chest_01.png", 4, "chest_lacquer", 62),
    ("prop_chest_01.png", 5, "chest_lacquer_open", 70),
]


def components(path, scale=2, min_area=3000):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)[:, :, 3]
    small = a[::scale, ::scale] > 24
    h, w = small.shape
    label = np.zeros((h, w), np.int32)
    boxes = []
    n = 0
    for y in range(h):
        for x in range(w):
            if small[y, x] and not label[y, x]:
                n += 1
                stack = [(y, x)]
                label[y, x] = n
                y0 = y1 = y
                x0 = x1 = x
                cnt = 0
                while stack:
                    cy, cx = stack.pop()
                    cnt += 1
                    y0, y1, x0, x1 = min(y0, cy), max(y1, cy), min(x0, cx), max(x1, cx)
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not label[ny, nx]:
                                label[ny, nx] = n
                                stack.append((ny, nx))
                if cnt * scale * scale >= min_area:
                    boxes.append((x0 * scale, y0 * scale, (x1 + 1) * scale, (y1 + 1) * scale, n))
    # 按行分组排序：中心 y 相差小于平均高度一半视为同一行
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], []
    for b in boxes:
        if cur and (b[1] + b[3]) / 2 - (cur[0][1] + cur[0][3]) / 2 > (cur[0][3] - cur[0][1]) * 0.5:
            rows.append(cur)
            cur = []
        cur.append(b)
    if cur:
        rows.append(cur)
    ordered = [b for r in rows for b in sorted(r, key=lambda b: b[0])]
    return im, ordered, label, scale


def main():
    if "--list" in sys.argv:
        for f in sorted({p[0] for p in PICKS}):
            _, boxes, _, _ = components(SRC / f)
            print(f)
            for i, b in enumerate(boxes):
                print(f"  {i:2d} {b[:4]}  {b[2]-b[0]}x{b[3]-b[1]}")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    cache = {}
    for f, idx, name, height in PICKS:
        if f not in cache:
            cache[f] = components(SRC / f)
        im, boxes, label, scale = cache[f]
        x0, y0, x1, y1, n = boxes[idx]
        # 只保留这个物体自己的像素，去掉相邻物体露进来的碎片
        m = label == n
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
        full = np.repeat(np.repeat(m, scale, 0), scale, 1)[: im.height, : im.width]
        arr = np.array(im)
        arr[:, :, 3] = np.where(full, arr[:, :, 3], 0)
        only = Image.fromarray(arr)
        crop = only.crop((max(0, x0 - 4), max(0, y0 - 4), min(im.width, x1 + 4), min(im.height, y1 + 4)))
        crop = crop.crop(crop.getbbox())
        w = round(crop.width * height / crop.height)
        crop.resize((w, height), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)
        print(f"{name}.png  {w}x{height}")
    key = Image.open(SRC / "key_art_01.png").convert("RGB")
    key.thumbnail((1280, 720), Image.LANCZOS)
    key.save(OUT / "key_art.jpg", quality=82)
    print("key_art.jpg", key.size)


if __name__ == "__main__":
    main()
