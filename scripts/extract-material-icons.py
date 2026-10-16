"""Writes src/constants/material-icons.ts: the Material Symbols the app uses on Android (the
font expo-symbols draws), as vector paths, so components/icon.tsx can draw them centered.

Run it after using a new Android icon name (otherwise that icon falls back to the font):
  pip install fonttools
  python scripts/extract-material-icons.py . src/constants/material-icons.ts
"""
import json
import re
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

root = Path(sys.argv[1])
out = Path(sys.argv[2])
symbols = json.loads((root / 'node_modules/expo-symbols/build/android/symbols.json').read_text(encoding='utf-8'))
fonts_dir = root / 'node_modules/@expo-google-fonts/material-symbols'

# Every android symbol name used in the app, and whether any use is bold.
names = set()
bold = set()
for path in (root / 'src').rglob('*.tsx'):
    text = path.read_text(encoding='utf-8')
    for m in re.finditer(r"<(?:Icon|SymbolView)[^>]*?android: '([a-z_0-9]+)'[^>]*?>", text, re.S):
        names.add(m.group(1))
        if 'weight="bold"' in m.group(0):
            bold.add(m.group(1))
    # Names passed through props (icon={{ ios: ..., android: ... }}).
    for m in re.finditer(r"android: '([a-z_0-9]+)'", text):
        names.add(m.group(1))


def outlines(font_file, wanted):
    font = TTFont(font_file)
    upm = font['head'].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    result = {}
    for name in sorted(wanted):
        code = symbols.get(name)
        if code is None or code not in cmap:
            print(f'missing: {name}', file=sys.stderr)
            continue
        pen = SVGPathPen(glyphs)
        # Font units (y up, baseline at 0, icon in 0..upm) -> a 0..upm box with y down.
        glyphs[cmap[code]].draw(TransformPen(pen, (1, 0, 0, -1, 0, upm)))
        result[name] = pen.getCommands()
    return upm, result


upm, regular = outlines(fonts_dir / '400Regular/MaterialSymbols_400Regular.ttf', names)
upm_bold, bolds = outlines(fonts_dir / '700Bold/MaterialSymbols_700Bold.ttf', bold)
assert upm == upm_bold

lines = [
    '// Material Symbols (the font expo-symbols draws on Android), as vector paths: drawn exactly in',
    "// the middle of their box, unlike the font's glyphs. Generated from the app's icons;",
    '// add a name here when a new Android icon is used (see components/icon.tsx).',
    '',
    f'export const ICON_BOX = {upm}',
    '',
    'export const MATERIAL_ICONS: Record<string, string> = {',
]
lines += [f"  {json.dumps(n)}: {json.dumps(d)}," for n, d in sorted(regular.items())]
lines += ['}', '', 'export const MATERIAL_ICONS_BOLD: Record<string, string> = {']
lines += [f"  {json.dumps(n)}: {json.dumps(d)}," for n, d in sorted(bolds.items())]
lines += ['}', '']
out.write_text('\n'.join(lines).replace('"', "'"), encoding='utf-8')
print(f'{len(regular)} regular, {len(bolds)} bold, box {upm}')
