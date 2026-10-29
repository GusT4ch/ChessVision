// Wrapper around the Stockfish (single-threaded WASM) engine running in a Worker.
// Exposes a small UCI-based API and an analyze() that streams info and resolves
// with the best move for the current position.

export class Engine {
  constructor(path = 'engine/stockfish-nnue-16-single.js') {
    this.worker = new Worker(path);
    this.listeners = [];
    this.worker.onmessage = (e) => {
      const line = typeof e.data === 'string'
        ? e.data
        : (e.data && e.data.data) || '';
      if (!line) return;
      for (const fn of this.listeners) fn(line);
    };
    this._token = 0;
    this.ready = this._handshake();
  }

  on(fn) { this.listeners.push(fn); }

  send(cmd) { this.worker.postMessage(cmd); }

  _handshake() {
    return new Promise((resolve) => {
      const onLine = (line) => {
        if (line.includes('uciok')) {
          this.listeners = this.listeners.filter((f) => f !== onLine);
          this.send('setoption name Use NNUE value true');
          this.send('isready');
          resolve();
        }
      };
      this.on(onLine);
      this.send('uci');
    });
  }

  async setSkill(level) {
    await this.ready;
    const lvl = Math.max(0, Math.min(20, level | 0));
    this.send('setoption name Skill Level value ' + lvl);
  }

  // Analyze a FEN. onInfo(info) is called with {depth, scoreCp, mate, pv, bestSoFar}.
  // Resolves with { bestmove, ponder, info } or null if superseded by a newer call.
  async analyze(fen, { depth = 14, movetime = 0 } = {}, onInfo) {
    await this.ready;
    const token = ++this._token;
    this.send('stop');

    return new Promise((resolve) => {
      let last = { depth: 0, scoreCp: null, mate: null, pv: [] };

      const onLine = (line) => {
        if (token !== this._token) return; // superseded

        if (line.startsWith('info') && line.includes(' pv ')) {
          const info = parseInfo(line);
          if (info) {
            last = info;
            if (onInfo) onInfo({ ...info, bestSoFar: info.pv[0] || null });
          }
        } else if (line.startsWith('bestmove')) {
          this.listeners = this.listeners.filter((f) => f !== onLine);
          const parts = line.split(/\s+/);
          const bestmove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
          const ponder = parts[3] || null;
          resolve({ bestmove, ponder, info: last });
        }
      };

      this.on(onLine);
      this.send('position fen ' + fen);
      this.send(movetime > 0 ? 'go movetime ' + movetime : 'go depth ' + depth);
    });
  }

  stop() { this.send('stop'); }
}

function parseInfo(line) {
  const toks = line.split(/\s+/);
  const out = { depth: 0, scoreCp: null, mate: null, pv: [] };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === 'depth') out.depth = parseInt(toks[i + 1], 10);
    else if (t === 'score') {
      const kind = toks[i + 1];
      const val = parseInt(toks[i + 2], 10);
      if (kind === 'cp') out.scoreCp = val;
      else if (kind === 'mate') out.mate = val;
    } else if (t === 'pv') {
      out.pv = toks.slice(i + 1).filter(Boolean);
      break;
    }
  }
  return out;
}
