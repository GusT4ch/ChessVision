# ChessVision

A chess analysis board as a **PWA** (installable web app), with the
**Stockfish 16** engine running right in the browser via WebAssembly. Move the
pieces and Stockfish draws an **arrow for the best move**, along with the
position evaluation and the principal line — all offline, no server needed.

**Live:** https://gust4ch.github.io/ChessVision/

## How it works

- Move any piece (tap-tap or drag). Only legal moves are accepted.
- After every move, the engine calculates and draws an **arrow** for the best move.
- Evaluation bar and score (e.g. `+0.8`, `M3`), plus the principal line in
  algebraic notation.
- Buttons: **Nova** (new game), **Voltar** (undo), **Girar** (flip board),
  **Dica** (show hint) and **Jogar dica** (play the best move).
- Settings: adjustable analysis time, auto-arrow on/off, load/copy **FEN**.

## Run locally

It must be served over HTTP (ES modules and the service worker don't work from `file://`):

```bash
cd ChessVision
python3 -m http.server 8000
# open http://localhost:8000
```

## Install on iPhone (Add to Home Screen)

1. Host the folder over HTTPS (e.g. GitHub Pages, Netlify, Vercel).
2. Open the site in **Safari** on the iPhone.
3. Tap **Share → Add to Home Screen**.
4. The icon shows up like an app; it opens full screen and works offline.

> Note: a signed `.ipa` installable outside the App Store requires macOS,
> Xcode and an Apple developer account. This version is a PWA, which needs
> none of that and runs on the iPhone through Safari.

## Project structure

```
index.html              UI
styles.css              styles (dark theme, mobile-first)
js/app.js               wires board + engine + rules together
js/board.js             board rendering, interaction and arrow (SVG)
js/engine.js            Stockfish UCI wrapper (Web Worker)
js/chess.js             chess.js (rules / move validation)
engine/                 Stockfish 16 single-threaded (WASM + NNUE network)
pieces/                 piece images (SVG)
sw.js                   service worker (offline cache)
manifest.webmanifest    PWA metadata
icons/                  app icons
```

## Credits / Licenses

- Engine: [Stockfish](https://stockfishchess.org/) via
  [stockfish.js](https://github.com/nmrugg/stockfish.js) — **GPLv3**
  (see `engine/STOCKFISH-LICENSE.txt`).
- Pieces: **Staunty** set by sadsnake1 (via [Lichess](https://github.com/lichess-org/lila)) —
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial use).
- Rules: [chess.js](https://github.com/jhlywa/chess.js) — BSD-2-Clause.
