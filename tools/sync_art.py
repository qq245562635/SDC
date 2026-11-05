"""把 art/ 的正式美术同步到 WebGL 原型。

读 art/delivery/T002/assets.json，按 display_scale 缩到 1080p 显示尺寸，
写到 prototype/webgl/assets/art/，并生成 manifest.js：
  window.ART = { key: { w, h, o: [原点], b: [内容包围盒], d: 显示倍率, p?: [关节] } }
T004 的角色拆件（role=part）覆盖 T002 同名记录，另带骨骼数据（显示像素，相对图片左上）：
  j: 关节点，z: 层级，a?: 身体挂点 {neck, shoulder_l, ...}，hand?: 手，grip?: 握把，r?: 静止位置（相对脚底）
  window.RIGS = { 角色: { body: 身体静止位置, parts: [key...] } }
d = 1080p 显示像素 / 图片像素：一般缩好是 1；大 UI 面板保留原图，d = 0.5。
key = 文件名去掉类别前缀和 _01，例如 char_hero_idle_01.png → hero_idle。
游戏里再统一乘 1280/1920，所以图片不会被拉伸。

用法：python3 tools/sync_art.py [--art 某个工作区/art]
art/ 不在本地（例如 T002 还没合并）时，用 --art 指向主美分支的工作区。
"""
import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'prototype' / 'webgl' / 'assets' / 'art'
SKIP = ('char_lubu_riding_',)  # 骑战拆件只在主美交付里看，原型不用
FULL = ('ui_inventory_panel', 'ui_inventory_rarity_', 'ui_spiritcard_common', 'ui_spiritcard_rare', 'ui_spiritcard_epic')  # 会放大显示，保留原图


def key_of(name: str) -> str:
    stem = name[:-4]
    if stem.endswith('_01'):
        stem = stem[:-3]
    return stem.split('_', 1)[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--art', default=str(ROOT / 'art'))
    art = Path(ap.parse_args().art).resolve()
    meta = json.loads((art / 'delivery' / 'T002' / 'assets.json').read_text(encoding='utf-8'))
    t004 = art / 'delivery' / 'T004' / 'assets.json'
    rigs = {}
    if t004.exists():
        m4 = json.loads(t004.read_text(encoding='utf-8'))
        parts = {a['file']: a for a in m4['assets'] if a.get('role') == 'part'}
        for r in m4['rigs']:
            k = parts[r['parts'][0]]['display_scale']
            rigs[r['character']] = {'body': [round(v * k, 2) for v in r['body_rest_position']],
                                    'parts': [key_of(Path(f).name) for f in r['parts']]}
        meta['assets'] = [parts.pop(a['file'], a) for a in meta['assets']] + list(parts.values())

    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.iterdir():
        f.unlink()
    manifest, total = {}, 0
    for a in meta['assets']:
        name = Path(a['file']).name
        if name.startswith(SKIP):
            continue
        src = art / Path(a['file']).relative_to('art')
        im = Image.open(src)
        s = a['display_scale']
        if name.startswith(FULL):
            k, d = 1, s
        else:
            k, d = s, 1
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        w, h = im.size
        key = key_of(name)
        dst = OUT / f'{key}.png'
        im.save(dst, optimize=True)
        total += dst.stat().st_size
        ox, oy = a['origin_normalized']
        entry = {'w': w, 'h': h, 'o': [round(ox, 4), round(oy, 4)],
                 'b': [round(v * k) for v in a['content_bbox']], 'd': d}
        if 'joint_pivot_hint' in a:
            entry['p'] = [round(v, 4) for v in a['joint_pivot_hint']]
        if 'joint_pivot' in a:
            px = lambda v: [round(c * k, 2) for c in v]
            entry['j'] = px(a['joint_pivot'])
            entry['z'] = a['z']
            entry['r'] = px(a['rest_position'])
            for f in ('hand', 'grip'):
                if f in a:
                    entry[f] = px(a[f])
            if 'attach' in a:
                entry['a'] = {n: px(v) for n, v in a['attach'].items()}
        manifest[key] = entry

    js = '// tools/sync_art.py 生成，别手改\nwindow.ART = ' + json.dumps(manifest, separators=(',', ':')) + ';\n'
    js += 'window.RIGS = ' + json.dumps(rigs, separators=(',', ':')) + ';\n'
    (OUT / 'manifest.js').write_text(js, encoding='utf-8')
    print(f'{len(manifest)} 张，{total / 1024 / 1024:.2f} MB -> {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
