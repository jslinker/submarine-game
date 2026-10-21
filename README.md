# submarine-game
Point and click submarine exploration game.

A playable static prototype using the original blockout images. Explore the captain’s quarters, mess hall, and control room; collect evidence, inspect the logbook, and restore emergency power.

## Play

https://jslinker.github.io/submarine-game/

Click scene hotspots and movement buttons. **H** reveals hotspots, **M** opens the map, **↑** advances along the corridor, and **↓** turns around. Inventory items can be inspected. Progress saves in this browser; Restart clears it after confirmation.

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

The current puzzle is provisional: take the mess hall logbook, inspect it for a key, and use the emergency control in the control room. The pistol and cartridge are optional evidence. The vent and basement are inspectable dead ends. Restored power completes the prototype; exploration remains available. There is no combat or audio yet.

Original JPGs are retained in their source folders. When both captain items are taken, the game combines the left and right portions of the supplied removal variants at runtime. No original art is modified.
