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
    // Every 'go' produces exactly one 'bestmove'. Counting both tells us which
    // search an output line belongs to, even after several quick 'stop's.
    this._goCount = 0;
    this._bestCount = 0;
    this._multipv = 1;
    this.on((line) => { if (line.startsWith('bestmove')) this._bestCount++; });
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

  // Set how many principal variations (candidate lines) the engine reports.
  async setMultiPV(n) {
    await this.ready;
    const v = Math.max(1, Math.min(16, n | 0));
    if (v === this._multipv) return;
    this._multipv = v;
    this.send('setoption name MultiPV value ' + v);
  }

  // Analyze a FEN. onInfo(info) is called with {depth, scoreCp, mate, pv, bestSoFar}.
  // Resolves with { bestmove, ponder, info, candidates } or null if superseded.
  // candidates is an array (best first) of { uci, scoreCp, mate, pv }, one per
  // MultiPV line, when multipv > 1 is requested.
  async analyze(fen, { depth = 14, movetime = 0, multipv = 1 } = {}, onInfo) {
    await this.ready;
    await this.setMultiPV(multipv);
    const token = ++this._token;
    this.send('stop');
    const myGo = ++this._goCount;

    return new Promise((resolve) => {
      let last = { depth: 0, scoreCp: null, mate: null, pv: [] };
      // Latest info line seen for each MultiPV rank (1 = best).
      const byRank = new Map();

      const onLine = (line) => {
        const isBest = line.startsWith('bestmove');
        if (token !== this._token) {
          // superseded by a newer call
          this.listeners = this.listeners.filter((f) => f !== onLine);
          resolve(null);
          return;
        }
        // Output from an older search that hasn't finished yet.
        if (isBest ? this._bestCount < myGo : this._bestCount < myGo - 1) return;

        if (line.startsWith('info') && line.includes(' pv ')) {
          const info = parseInfo(line);
          if (info) {
            byRank.set(info.multipv || 1, info);
            if ((info.multipv || 1) === 1) {
              last = info;
              if (onInfo) onInfo({ ...info, bestSoFar: info.pv[0] || null });
            }
          }
        } else if (isBest) {
          this.listeners = this.listeners.filter((f) => f !== onLine);
          const parts = line.split(/\s+/);
          const bestmove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
          const ponder = parts[3] || null;
          const candidates = [...byRank.keys()].sort((a, b) => a - b)
            .map((r) => byRank.get(r))
            .filter((i) => i.pv && i.pv.length)
            .map((i) => ({ uci: i.pv[0], scoreCp: i.scoreCp, mate: i.mate, pv: i.pv }));
          resolve({ bestmove, ponder, info: last, candidates });
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
  const out = { depth: 0, scoreCp: null, mate: null, pv: [], multipv: 1 };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === 'depth') out.depth = parseInt(toks[i + 1], 10);
    else if (t === 'multipv') out.multipv = parseInt(toks[i + 1], 10);
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
