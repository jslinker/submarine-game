# submarine-game
Point and click submarine exploration game.

A playable static prototype using the original blockout images. Explore the captain’s quarters, mess hall, and control room; unlock the mess hall, find the notebook key, and collect a pistol and cartridge.

## Play

https://jslinker.github.io/submarine-game/

Click scene hotspots and movement buttons. **H** reveals hotspots, **M** opens the map, **↑** advances along the corridor, and **↓** turns around. **R** looks up and **F** looks down; **Esc** returns to looking ahead from an inspection view. The hallway also has a Step backward control. Look down at the basement hatch and up beneath the vent; other positions explain when there is nothing to inspect. In the captain’s quarters and mess hall, turn around to face the outro view, then click the door to return to the passage. Turn around again to face into the room. Inventory items can be inspected. Progress saves in this browser; Restart clears it after confirmation.

The game uses a fixed **1920×1080 logical viewport**, uniformly scaled to fit the available browser window with letterboxing. Scene images and interaction coordinates remain in that fixed coordinate system. It never stretches or crops to another aspect ratio.

## Development

No runtime dependencies or installation required. Use Node.js 22+ and Python 3:

```sh
npm run dev
# Open http://127.0.0.1:5173
npm test
npm run build
```

`dist/` contains only the public site files. All asset URLs are relative so the game works under the GitHub Pages `/submarine-game/` project path.

## Deployment

GitHub Pages is configured to use **GitHub Actions**. `.github/workflows/pages.yml` tests, builds, and deploys pushes to `main`, with a manual workflow trigger also available. The repository’s default branch is `main`.

## Prototype scope

Start in the hall and turn around to knock on the door behind you. A voice says he is locked inside and needs the key. Press the control-room button to unlock the mess hall. Take the notebook there, inspect it for the key, then return to unlock the captain’s quarters. Collect the gun and bullet; both remain separate inventory items.

The gun and bullet cannot be loaded or used yet. The vent and basement remain inspectable dead ends. There is no audio yet. This gameplay revision uses a new save slot (`submarine-game-v2`) so old puzzle progress cannot bypass the new locks.

Original JPGs are retained in their source folders. When both captain items are taken, the game combines the left and right portions of the supplied removal variants at runtime. No original art is modified.
