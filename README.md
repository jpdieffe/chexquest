# Chex Quest Together

[Play on GitHub Pages](https://jpdieffe.github.io/chexquest/)

The original DOS **Chex Quest** with online two-player cooperative play. Both devices run the original `CHEX.EXE`; the game's native multiplayer packets travel directly over a WebRTC data channel. Each player has their own view and sees the other Chex Warrior in the level.

## Play

1. Choose a starting level and challenge, then **Host co-op**.
2. Share the two-character room code or use **Invite**.
3. Your friend enters the code and chooses **Join friend**. Both games start together, with the warriors nearby and facing each other.
4. Explore, collect equipment, and zorch Flemoids together. Level exits advance both players.

All five original levels are included. **Play solo** runs the original single-player game. Co-op uses the original game rules; this is not deathmatch or a shared video stream.

### Controls

| Action | Computer | Phone |
| --- | --- | --- |
| Forward / backward | W / S | Up / down |
| Strafe | A / D | Left / right |
| Turn | Mouse or left/right arrows | Turn buttons |
| Zorch | Mouse click or F | ZORCH |
| Use doors / respawn | E or Space | Use / respawn |
| Run | Shift | Hold Run |
| Select owned weapon | 1–7 | Zorcher selector |
| Map | Tab | Map |
| Original menus | Escape | Menu, then the menu buttons |

Click the game or **Mouse look** to capture the mouse; Escape releases it. Turn phones sideways for the largest playable view. Touch controls support holding movement and firing together. **Full screen** requests landscape orientation where the browser supports it.

## Connection and session behavior

Keep both game tabs visible. A room accepts exactly two players. The original engine starts its network session with both players; it does not support joining an existing mission midway. After a disconnect, choose **Leave** and create a new room. The starting-level selector lets you restart from the level you reached.

On Android, allow the browser's **Nearby devices / Local network** permission and accept local-network prompts. Some routers, guest Wi-Fi, firewalls, and mobile networks block direct WebRTC connections. **Connection help** accepts an optional TURN relay or custom PeerServer; no relay service is bundled. Credentials remain in the current tab.

PeerJS signaling creates the connection; gameplay packets use WebRTC. GitHub Pages only serves the static game files. A TURN relay, when explicitly configured, relays those packets when a direct path is unavailable.

## Original game and compatibility patch

The supplied archive is preserved in `assets/chexquest-original.zip` (SHA-256 `961a2d7a7b4ead24e9359b0490a63ecceaad77e471bd6b29badb6cdd9c378f2f`). The deployed EXE and IWAD are byte-for-byte copies of the originals.

`scripts/game.py` generates a separate `COOP.WAD` that:

- Adds or relocates player-two starts near player one in all five levels. It checks clearance, floor/ceiling space, and line of sight. Three original levels had no second-player start.
- Faces the two players toward each other at spawn.
- Replaces oversized co-op result-screen labels with short labels built from the game's own font. Original map geometry, enemies, items, and gameplay remain intact.

The patch loads only for co-op. `IPXSETUP.EXE` from the open-source Vanilla Utilities launches the original executable's network mode. The emulator's supported `Net` interface is adapted to the room's WebRTC connection, without a separate IPX server to install.

The original launcher's intro/outro movies and installer are retained in the supplied archive but are not part of the browser launch sequence.

## Development and verification

Requires Node.js, Python 3, and installed Google Chrome for browser tests.

```sh
npm ci
npm run prepare:vendor
npm start
```

Open http://127.0.0.1:4175. The build copies pinned runtime dependencies and creates the browser game bundle under ignored `site/vendor/` and `site/game/`. GitHub Actions performs the same preparation before publishing `site/`.

```sh
npm run check
npm test
npm run test:browser
npm run test:network
npm run test:levels
npm run test:transitions
```

Tests cover original-file preservation, map patch integrity, protocol validation, solo startup, mobile layouts, two real browser connections, mutual player visibility, independent views, touch movement, firing, full-room rejection, and disconnect handling. Level-start tests run with normal enemies. Transition tests use an intercepted, unpublished fixture that starts beside original exit switches; its final-level exit bypasses the boss prerequisite to exercise the native finale action. They do not claim a complete manual campaign playthrough. Physical Android/iOS performance and every network configuration remain device-dependent.

## Credits and licenses

- Original Chex Quest by **Digital Café**, published by **Ralston Foods / General Mills**. Original game assets are separate from the open-source browser code's license.
- [js-dos emulators 8.5.2](https://github.com/caiiiycuk/emulators), GPL-2.0. Runtime license is shipped alongside the files in `site/vendor/`.
- [Vanilla Utilities 2.1.0](https://github.com/fragglet/vanilla-utilities/releases/tag/v2.1.0), by Simon Howard and contributors, based on id Software's network drivers. The release, corresponding source archive, and license are included in this repository.
- [PeerJS 1.5.5](https://github.com/peers/peerjs), MIT. Its license is shipped with the runtime.
- Melodic Spaceship documented [the original CHEX.EXE multiplayer mode and result-screen issue](https://www.chexquest.org/index.php?topic=5937.0). This project's compatibility PWAD is generated independently from the supplied game files.

Browser integration and patch-generation code: GPL-2.0; see `LICENSE`.
