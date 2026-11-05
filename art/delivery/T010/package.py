"""Normalize generated sprites without repainting or replacing their alpha."""
import hashlib
import json
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / 'art' / 'char'
OUT.mkdir(parents=True, exist_ok=True)
assets = []
for state in ('idle', 'walk', 'loaded'):
    name = f'char_baoju_{state}_01.png'
    source = HERE / 'sources' / name
    im = Image.open(source).convert('RGBA')
    # One shared source-space scale and foot-plane anchor for all three poses.
    # The generated alpha is retained; no background removal or recoloring.
    scaled = im.resize((415, 276), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (384, 320))
    canvas.paste(scaled, (16, 30))
    dst = OUT / name
    canvas.save(dst, optimize=True)
    bbox = canvas.getchannel('A').point(lambda a: 255 if a >= 32 else 0).getbbox()
    assets.append({
        'file': dst.relative_to(ROOT).as_posix(), 'requirement': 'T010',
        'role': 'pose_reference' if state == 'walk' else 'sprite',
        'state': state, 'size_px': [384, 320], 'display_scale': 0.5,
        'origin_normalized': [0.5, 0.9375],
        'content_bbox': list(bbox), 'content_bbox_alpha_threshold': 32,
        'facing': 'right', 'mirror_x': True,
        'source': source.relative_to(ROOT).as_posix(),
        'sha256': hashlib.sha256(dst.read_bytes()).hexdigest(),
    })
manifest = {
    'task': 'T010', 'generator': 'built-in imagegen',
    'base_commit': '2b33845b655c9e402005e755b339db44566be34b',
    'units': 'pixels at 2x display scale',
    'notes': [
        'Three state key poses; walk is a pose reference, not a seamless animation loop.',
        'Shared canvas, source scale and ground-plane anchor [192, 300]. Mirror for left facing.',
        'Visible silhouette bounds use alpha >= 32; generated antialiased alpha is preserved.',
        'Size and anchor are proposed art delivery choices: detailed T010 specs are not yet in docs/03.',
        'No runtime files changed. Programmer must extend sync_art.py to read T010/assets.json.',
    ],
    'assets': assets,
}
(HERE / 'assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
checks = []
for item in assets:
    path = ROOT / item['file']
    im = Image.open(path)
    assert im.mode == 'RGBA' and im.size == (384, 320)
    assert im.getchannel('A').getextrema()[0] == 0
    assert path.stat().st_size < 20 * 1024 * 1024
    assert item['content_bbox'][0] > 0 and item['content_bbox'][2] < 384
    assert item['content_bbox'][1] > 0 and item['content_bbox'][3] < 320
    checks.append({'file': item['file'], 'rgba': True, 'transparent': True,
                   'visible_silhouette_not_clipped': True, 'bytes': path.stat().st_size})
(HERE / 'validation.json').write_text(json.dumps({'checks': checks}, indent=2) + '\n', encoding='utf-8')
print(json.dumps(checks, indent=2))
