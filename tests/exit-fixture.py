"""Test-only spawn positions beside real exit switches, to exercise every transition.
The fixture is intercepted by Playwright and never served or deployed to players.
"""
import math
import pathlib
import struct
import sys
import zipfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from scripts.game import lumps, records, wad

with zipfile.ZipFile('site/game/chexquest.zip') as source:
    files = {n: source.read(n) for n in source.namelist()}
entries = lumps(files['COOP.WAD'])
for i, (name, _) in enumerate(entries):
    if not name.startswith('E1M'):
        continue
    data = dict(entries[i:i+11])
    vertices = records(data['VERTEXES'], '<hh')
    lines = records(data['LINEDEFS'], '<HHHHHHH')
    line = next(line for line in lines if (line[3] == 52 if name == 'E1M5' else line[3] == 11 and line[6] == 65535)
                and math.dist(vertices[line[0]], vertices[line[1]]) >= 32)
    a, b = vertices[line[0]], vertices[line[1]]
    length = math.dist(a, b)
    nx, ny = (b[1]-a[1])/length, -(b[0]-a[0])/length
    cx, cy = (a[0]+b[0])/2, (a[1]+b[1])/2
    angle = round(math.degrees(math.atan2(-ny, -nx))/45)*45 % 360
    things = [t for t in records(data['THINGS'], '<hhhhh') if t[3] not in (1, 2)]
    things += [(round(cx+nx*distance), round(cy+ny*distance), angle, player, 7)
               for player, distance in [(1, 40), (2, 88)]]
    if name == 'E1M5':
        # The real finale exit is behind the boss barrier. This fixture has no
        # enemies, so expose the same native exit action on the starting wall.
        # Only this intercepted test bundle receives this extra exit switch.
        things[-2:] = [(-2968, -224, 180, 1, 7), (-2920, -224, 180, 2, 7)]
        lines[1480] = (*lines[1480][:3], 11, *lines[1480][4:])
        entries[i+2] = ('LINEDEFS', b''.join(struct.pack('<HHHHHHH', *line) for line in lines))
    entries[i+1] = ('THINGS', b''.join(struct.pack('<hhhhh', *t) for t in things))
    print(name, things[-2:])
files['COOP.WAD'] = wad(entries)
with zipfile.ZipFile('test-results/exit-game.zip', 'w', zipfile.ZIP_DEFLATED) as target:
    for name, data in files.items():
        target.writestr(name, data)
