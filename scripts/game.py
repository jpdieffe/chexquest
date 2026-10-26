"""Build a separate co-op PWAD; never modify the supplied EXE or IWAD."""
import hashlib
import json
import math
import pathlib
import struct
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent


def lumps(data):
    count, directory = struct.unpack_from('<ii', data, 4)
    result = []
    for i in range(count):
        offset, size, name = struct.unpack_from('<ii8s', data, directory + i * 16)
        result.append((name.rstrip(b'\0').decode('ascii'), data[offset:offset + size]))
    return result


def wad(entries):
    body = bytearray()
    directory = bytearray()
    for name, data in entries:
        directory.extend(struct.pack('<ii8s', 12 + len(body), len(data), name.encode()))
        body.extend(data)
    return struct.pack('<4sii', b'PWAD', len(entries), 12 + len(body)) + body + directory


def records(data, fmt):
    return list(struct.iter_unpack(fmt, data))


def spawn_pair(entries):
    data = dict(entries)
    things = records(data['THINGS'], '<hhhhh')
    vertices = records(data['VERTEXES'], '<hh')
    lines = records(data['LINEDEFS'], '<HHHHHHH')
    sides = records(data['SIDEDEFS'], '<hh8s8s8sH')
    sectors = records(data['SECTORS'], '<hh8s8shhh')
    segs = records(data['SEGS'], '<HHHHHH')
    subsectors = records(data['SSECTORS'], '<HH')
    nodes = records(data['NODES'], '<hhhhhhhhhhhhHH')
    p1 = next(t for t in things if t[3] == 1)

    def sector_at(x, y):
        child = len(nodes) - 1
        while not child & 0x8000:
            node = nodes[child]
            nx, ny, dx, dy = node[:4]
            side = int((y - ny) * dx >= (x - nx) * dy)
            child = node[12 + side]
        seg = segs[subsectors[child & 0x7fff][1]]
        return sides[lines[seg[3]][5 + seg[4]]][-1]

    def distance(x, y, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0, min(1, ((x-a[0])*dx + (y-a[1])*dy) / (dx*dx + dy*dy or 1)))
        return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)

    floor = sectors[sector_at(p1[0], p1[1])][0]

    def crosses_line(x, y, line):
        a, b = vertices[line[0]], vertices[line[1]]
        rx, ry = x-p1[0], y-p1[1]
        sx, sy = b[0]-a[0], b[1]-a[1]
        denominator = rx*sy-ry*sx
        if not denominator:
            return False
        ax, ay = a[0]-p1[0], a[1]-p1[1]
        t, u = (ax*sy-ay*sx)/denominator, (ax*ry-ay*rx)/denominator
        return 0 < t < 1 and 0 <= u <= 1

    chosen = None
    for radius in (80, 64, 96, 112):
        for turn in (0, 45, -45, 90, -90, 135, -135, 180):
            angle = (p1[2] + turn) % 360
            x = p1[0] + round(math.cos(math.radians(angle)) * radius)
            y = p1[1] + round(math.sin(math.radians(angle)) * radius)
            sector = sectors[sector_at(x, y)]
            if sector[0] != floor or sector[1] - sector[0] < 56:
                continue
            if any(distance(x, y, vertices[line[0]], vertices[line[1]]) < 24 for line in lines):
                continue
            if any(crosses_line(x, y, line) for line in lines):
                continue
            # Stay in the same convex room region: the joining player must be visible.
            if any(sector_at(round(p1[0]+(x-p1[0])*t/8), round(p1[1]+(y-p1[1])*t/8)) != sector_at(p1[0], p1[1]) for t in range(1, 9)):
                continue
            chosen = (x, y, (angle + 180) % 360, 2, 7)
            p1 = (p1[0], p1[1], angle, 1, p1[4])
            break
        if chosen:
            break
    if not chosen:
        raise ValueError('No safe nearby co-op start found')
    updated = [p1 if t[3] == 1 else t for t in things if t[3] != 2] + [chosen]
    return b''.join(struct.pack('<hhhhh', *t) for t in updated), [p1, chosen]


def label_patch(iwad, text):
    """Short, readable labels made from the game's own original font patches."""
    glyphs = [iwad[f'STCFN{ord(c):03}'] for c in text]
    sizes = [struct.unpack_from('<hh', glyph) for glyph in glyphs]
    width, height = sum(w-1 for w, _ in sizes)+1, max(h for _, h in sizes)
    if width > 48:
        raise ValueError('Co-op result label exceeds its column')
    pixels = [[None for _ in range(height)] for _ in range(width)]
    cursor = 0
    for glyph, (w, h) in zip(glyphs, sizes):
        for x in range(w):
            offset = struct.unpack_from('<I', glyph, 8+x*4)[0]
            while glyph[offset] != 255:
                top, length = glyph[offset:offset+2]
                for y, color in enumerate(glyph[offset+3:offset+3+length], top):
                    if y < height:
                        pixels[cursor+x][y] = color
                offset += length+4
        cursor += w-1
    columns = []
    for column in pixels:
        encoded, y = bytearray(), 0
        while y < height:
            if column[y] is None:
                y += 1
                continue
            top = y
            while y < height and column[y] is not None:
                y += 1
            encoded.extend(bytes([top, y-top, 0])+bytes(column[top:y])+b'\0')
        columns.append(bytes(encoded)+b'\xff')
    output = bytearray(struct.pack('<hhhh', width, height, 0, 0))
    offset = 8+width*4
    for column in columns:
        output.extend(struct.pack('<I', offset))
        offset += len(column)
    return bytes(output) + b''.join(columns)


def build():
    original = ROOT/'assets/chexquest-original.zip'
    with zipfile.ZipFile(original) as archive:
        exe = archive.read('Chex/chex.exe')
        iwad = archive.read('Chex/chex.wad')
        config = archive.read('Chex/DEFAULT.CFG').decode('ascii').replace('\r', '')
    entries = lumps(iwad)
    patch, starts = [], {}
    for level in range(1, 6):
        name = f'E1M{level}'
        index = next(i for i, (n, _) in enumerate(entries) if n == name)
        map_entries = entries[index:index+11]
        things, starts[name] = spawn_pair(map_entries)
        patch.extend((n, things if n == 'THINGS' else d) for n, d in map_entries)
    for name, text in {'WIOSTK':'ZORCH', 'WIOSTI':'ITEMS', 'WIOSTS':'SECRETS', 'WISCRT2':'SECRETS', 'WIFRGS':'FRAGS'}.items():
        patch.append((name, label_patch(dict(entries), text)))
    # DOS scan codes: W/S, A/D strafe, arrows turn, E use, Ctrl fire, Shift run.
    settings = dict(key_up=17, key_down=31, key_strafeleft=30, key_straferight=32,
                    key_use=18, use_mouse=1, snd_musicdevice=3, snd_sfxdevice=3,
                    screenblocks=10, snd_channels=8, mouse_sensitivity=4)
    lines = []
    for line in config.splitlines():
        key = line.split()[0] if line.split() else ''
        lines.append(f'{key}\t\t{settings[key]}' if key in settings else line)
    config = ('\r\n'.join(lines)+'\r\n').encode('ascii')
    with zipfile.ZipFile(ROOT/'assets/vanilla-utilities-2.1.0.zip') as utility:
        driver = utility.read('IPXSETUP.EXE')
    output = ROOT/'site/game'
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output/'chexquest.zip', 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name, data in [('CHEX.EXE', exe), ('CHEX.WAD', iwad), ('DEFAULT.CFG', config),
                           ('IPXSETUP.EXE', driver), ('COOP.WAD', wad(patch))]:
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, data)
    manifest = {'originalArchiveSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                'exeSha256': hashlib.sha256(exe).hexdigest(), 'iwadSha256': hashlib.sha256(iwad).hexdigest(),
                'coopSpawns': starts, 'patchLabels': [n for n, _ in patch if n.startswith('WI')]}
    (output/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print('Prepared original Chex Quest and co-op compatibility patch for all five levels.')


if __name__ == '__main__':
    build()
