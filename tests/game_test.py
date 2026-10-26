import math
import pathlib
import struct
import sys
import unittest
import zipfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from scripts.game import lumps, records


class GameBundle(unittest.TestCase):
    def test_original_game_preserved_and_patch_complete(self):
        with zipfile.ZipFile('assets/chexquest-original.zip') as source, zipfile.ZipFile('site/game/chexquest.zip') as bundle:
            self.assertEqual(source.read('Chex/chex.exe'), bundle.read('CHEX.EXE'))
            self.assertEqual(source.read('Chex/chex.wad'), bundle.read('CHEX.WAD'))
            original = lumps(bundle.read('CHEX.WAD'))
            patch = lumps(bundle.read('COOP.WAD'))
        for level in range(1, 6):
            name = f'E1M{level}'
            i = next(i for i, (n, _) in enumerate(patch) if n == name)
            j = next(i for i, (n, _) in enumerate(original) if n == name)
            self.assertEqual(patch[i+2:i+11], original[j+2:j+11], 'Original geometry and map data remain intact')
            things = records(patch[i+1][1], '<hhhhh')
            players = [next(t for t in things if t[3] == number) for number in (1, 2)]
            self.assertGreaterEqual(math.dist(players[0][:2], players[1][:2]), 64)
            self.assertLessEqual(math.dist(players[0][:2], players[1][:2]), 113)
            self.assertEqual((players[0][2]+180)%360, players[1][2])
            self.assertEqual([t for t in things if t[3] not in (1, 2)], [t for t in records(original[j+1][1], '<hhhhh') if t[3] not in (1, 2)])
        for name in ('WIOSTK', 'WIOSTI', 'WIOSTS', 'WISCRT2', 'WIFRGS'):
            self.assertLessEqual(struct.unpack_from('<h', dict(patch)[name])[0], 48)


if __name__ == '__main__':
    unittest.main()
