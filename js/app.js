import { Chess } from './chess.js';
import { Engine } from './engine.js';
import { BoardView } from './board.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const game = new Chess();
const engine = new Engine();

const $ = (id) => document.getElementById(id);

const board = new BoardView($('board'), {
  onUserMove: (from, to) => tryMove(from, to),
  legalMovesFor: (sq) => game.moves({ square: sq, verbose: true }).map((m) => m.to),
});

let thinkMs = 1000; // time budget per analysis; keeps phones responsive
let autoArrow = true;

// Accuracy mode: when on, "Jogar dica" plays the best move only `accuracy`% of
// the time; the rest of the time it plays a weaker candidate line instead.
let accuracyMode = false;
let accuracy = 70; // percent
const MULTIPV = 10; // how many candidate lines to request from the engine

// Engine scores (cp, from side-to-move perspective) as a single number, with
// mates mapped to very large values so they compare correctly.
function scoreVal(c) {
  if (c.mate != null) return c.mate > 0 ? 100000 - c.mate : -100000 - c.mate;
  return c.scoreCp || 0;
}

// Pick a move from the engine's ranked candidates (best first) honouring the
// accuracy setting. With probability `accuracy`% returns the best move; the
// rest of the time it deliberately plays a weaker move. The lower the accuracy,
// the larger the centipawn loss allowed — this is what actually drops the
// "accuracy" that sites like chess.com/lichess report (they score how far each
// move is from best, not merely whether it was THE best move).
function chooseByAccuracy(candidates) {
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0].uci;
  if (Math.random() * 100 < accuracy) return candidates[0].uci;

  const best = scoreVal(candidates[0]);
  // How bad a move we allow when "missing", scaled by the accuracy setting.
  // At 90% ~60cp, 70% ~180cp, 50% ~300cp, 30% ~420cp of allowed loss.
  const maxLoss = Math.max(40, (100 - accuracy) * 6);
  const minLoss = 15; // must be a real, noticeable mistake

  const alts = candidates.slice(1).map((c) => ({ uci: c.uci, loss: best - scoreVal(c) }));
  let pool = alts.filter((a) => a.loss >= minLoss && a.loss <= maxLoss);
  // Fall back to whatever weaker moves exist if none land in the window.
  if (!pool.length) pool = alts.filter((a) => a.loss >= minLoss);
  if (!pool.length) pool = alts;
  if (!pool.length) return candidates[0].uci;

  // Bias toward the larger allowed losses so the mistake actually registers,
  // while still occasionally picking a smaller one.
  const weights = pool.map((a) => a.loss + 20);
  const total = weights.reduce((x, y) => x + y, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].uci;
  }
  return pool[pool.length - 1].uci;
}

function refresh(lastMove) {
  board.setPosition(game.board(), lastMove);
  updateStatus();
  renderMoves();
}

// English SAN -> Portuguese piece letters (N=C, Q=D, R=T, K=R; B stays B).
const PT = { N: 'C', Q: 'D', R: 'T', K: 'R' };
const pt = (san) => san.replace(/[NQRK]/g, (c) => PT[c]);

function renderMoves() {
  const box = $('moves');
  const h = game.history();
  if (!h.length) { box.innerHTML = '<span class="empty">Nenhum lance ainda</span>'; return; }
  let html = '';
  h.forEach((san, i) => {
    if (i % 2 === 0) html += `<span class="num">${i / 2 + 1}.</span>`;
    html += `<span class="mv${i === h.length - 1 ? ' cur' : ''}">${pt(san)}</span>`;
  });
  box.innerHTML = html;
  box.scrollLeft = box.scrollWidth;
}

function clearAnalysis(msg) {
  setEval(null);
  $('bestmove').textContent = '\u2014';
  $('bestline').textContent = msg || '';
  $('evaldepth').textContent = '';
}

function updateStatus() {
  const el = $('status');
  if (game.isCheckmate()) {
    el.textContent = 'Xeque-mate — ' + (game.turn() === 'w' ? 'pretas' : 'brancas') + ' venceram';
  } else if (game.isStalemate()) {
    el.textContent = 'Afogamento (empate)';
  } else if (game.isInsufficientMaterial()) {
    el.textContent = 'Empate — material insuficiente';
  } else if (game.isDraw()) {
    el.textContent = 'Empate';
  } else {
    el.textContent = (game.turn() === 'w' ? 'Brancas' : 'Pretas') + ' a jogar'
      + (game.inCheck() ? ' — xeque!' : '');
  }
}

function tryMove(from, to, promo) {
  // Auto-queen on promotion for simplicity.
  const moves = game.moves({ square: from, verbose: true });
  const m = moves.find((x) => x.to === to);
  if (!m) return false;
  const opts = { from, to };
  if (m.promotion) opts.promotion = promo || 'q';
  const made = game.move(opts);
  if (!made) return false;
  board.setArrow(null, null);
  refresh({ from, to });
  if (autoArrow) analyze();
  return true;
}

let analyzing = false;
async function analyze() {
  if (game.isGameOver()) {
    clearAnalysis('Fim de jogo');
    return null;
  }
  analyzing = true;
  setThinking(true);
  const fen = game.fen();
  const turn = game.turn();

  const res = await engine.analyze(fen, { movetime: thinkMs }, (info) => {
    renderEval(info, turn);
    if (autoArrow && info.bestSoFar) drawMoveArrow(info.bestSoFar);
  });

  if (!res) return null; // superseded by a newer analysis
  analyzing = false;
  setThinking(false);
  if (game.fen() !== fen) return null; // position changed meanwhile
  // keep the printed line consistent with the final best move / arrow
  if (res.bestmove && res.info.pv[0] !== res.bestmove) {
    res.info.pv = [res.bestmove, ...res.info.pv];
  }
  renderEval(res.info, turn);
  if (res.bestmove) drawMoveArrow(res.bestmove);
  lastBest = { fen, uci: res.bestmove };
  return res.bestmove;
}

// Best move for the current position, reusing the last finished analysis.
let lastBest = null;
let playing = false;

// Decide the move for the current position under accuracy mode. Cached per FEN
// so the hint arrow and "Jogar dica" agree on the same move, and flashes a
// visible note about what was chosen. Returns the chosen uci (or null).
let accPick = null; // { fen, uci, best, candidates }
async function decideAccuracyMove(announce) {
  const fen = game.fen();
  if (accPick && accPick.fen === fen) {
    if (announce) flashAccuracy(accPick);
    return accPick.uci;
  }
  setThinking(true);
  const res = await engine.analyze(fen, { movetime: thinkMs, multipv: MULTIPV });
  setThinking(false);
  if (!res || game.fen() !== fen) return null;
  const uci = chooseByAccuracy(res.candidates) || res.bestmove;
  accPick = { fen, uci, best: res.bestmove, candidates: res.candidates || [] };
  if (announce) flashAccuracy(accPick);
  return uci;
}

function flashAccuracy(pick) {
  const cands = pick.candidates || [];
  if (cands.length <= 1) {
    flash('Acurácia: só 1 lance candidato');
  } else if (pick.uci === pick.best) {
    flash('Acurácia: melhor lance');
  } else {
    const chosen = cands.find((c) => c.uci === pick.uci);
    const loss = chosen ? (scoreVal(cands[0]) - scoreVal(chosen)) / 100 : 0;
    flash('Acurácia: imprecisão proposital (-' + loss.toFixed(1) + ')');
  }
}

// Show a hint arrow. In accuracy mode it points to the move the mode would
// actually play (which may be a deliberate inaccuracy); otherwise the best move.
async function showHint() {
  if (game.isGameOver()) { analyze(); return; }
  if (accuracyMode) {
    const uci = await decideAccuracyMove(true);
    if (uci && game.fen() === accPick.fen) drawMoveArrow(uci);
  } else {
    analyze();
  }
}

async function playBest() {
  if (playing || game.isGameOver()) return;
  playing = true;
  try {
    const fen = game.fen();
    let uci;
    if (accuracyMode) {
      uci = await decideAccuracyMove(true);
      if (!uci || game.fen() !== fen) return;
    } else {
      uci = (lastBest && lastBest.fen === fen) ? lastBest.uci : await analyze();
    }
    if (uci && game.fen() === fen) tryMove(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
  } finally {
    playing = false;
  }
}

function drawMoveArrow(uci) {
  if (!uci || uci.length < 4) return;
  board.setArrow(uci.slice(0, 2), uci.slice(2, 4));
}

function renderEval(info, turn) {
  if (!info) return;
  let cp = info.scoreCp;
  let mate = info.mate;
  // Scores are from side-to-move perspective; convert to White's perspective.
  const sign = turn === 'w' ? 1 : -1;
  if (mate != null) setEval({ mate: mate * sign });
  else if (cp != null) setEval({ cp: cp * sign });
  else return;
  const sans = pvToSan(info.pv);
  $('bestmove').textContent = sans[0] || '\u2014';
  $('bestline').textContent = sans.slice(1).join(' ');
  $('evaldepth').textContent = info.depth ? 'prof. ' + info.depth : '';
}

function pvToSan(pv) {
  if (!pv || !pv.length) return [];
  const tmp = new Chess(game.fen());
  const sans = [];
  for (const uci of pv.slice(0, 8)) {
    let mv = null;
    try { mv = tmp.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined }); }
    catch { break; }
    if (!mv) break;
    sans.push(pt(mv.san));
  }
  return sans;
}

function setEval(score) {
  const bar = $('evalfill');
  const label = $('evalscore');
  if (!score) { bar.style.height = '50%'; label.textContent = '0.0'; label.classList.remove('neg'); return; }
  if (score.mate != null) {
    const whiteWinning = score.mate > 0;
    bar.style.height = whiteWinning ? '100%' : '0%';
    label.textContent = (whiteWinning ? '' : '-') + 'M' + Math.abs(score.mate);
    label.classList.toggle('neg', !whiteWinning);
    return;
  }
  const cp = score.cp;
  // sigmoid-ish mapping to 0..100% for the bar
  const pct = 50 + 50 * (2 / (1 + Math.exp(-cp / 400)) - 1);
  bar.style.height = Math.max(2, Math.min(98, pct)) + '%';
  const val = (cp / 100).toFixed(1);
  label.textContent = (cp > 0 ? '+' : '') + val;
  label.classList.toggle('neg', cp < 0);
}

function setThinking(on) {
  $('spinner').classList.toggle('on', on);
}

// ---- Controls ----
$('btn-flip').addEventListener('click', () => board.flip());

$('btn-undo').addEventListener('click', () => {
  const undone = game.undo();
  if (!undone) return;
  board.setArrow(null, null);
  const h = game.history({ verbose: true });
  const lm = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  refresh(lm);
  if (autoArrow) analyze();
});

$('btn-new').addEventListener('click', () => {
  game.reset();
  accPick = null;
  board.setArrow(null, null);
  refresh(null);
  clearAnalysis('Mova uma pe\u00e7a para analisar');
});

$('btn-hint').addEventListener('click', () => showHint());
$('btn-play').addEventListener('click', () => playBest());

$('depth').addEventListener('input', (e) => {
  thinkMs = parseFloat(e.target.value) * 1000;
  $('depthval').textContent = e.target.value + ' s';
});

$('auto').addEventListener('change', (e) => {
  autoArrow = e.target.checked;
  if (!autoArrow) board.setArrow(null, null);
});

$('accmode').addEventListener('change', (e) => {
  accuracyMode = e.target.checked;
  $('accrow').classList.toggle('off', !accuracyMode);
});

$('acc').addEventListener('input', (e) => {
  accuracy = parseInt(e.target.value, 10);
  $('accval').textContent = accuracy + '%';
});

$('btn-loadfen').addEventListener('click', () => {
  const fen = prompt('Cole um FEN:', game.fen());
  if (!fen) return;
  try {
    const test = new Chess(fen);
    game.load(fen);
    board.setArrow(null, null);
    refresh(null);
    if (autoArrow) analyze();
  } catch (err) {
    alert('FEN inválido.');
  }
});

$('btn-copyfen').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(game.fen()); flash('FEN copiado'); }
  catch { prompt('FEN:', game.fen()); }
});

function flash(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1400);
}

// ---- Boot ----
const BUILD = 'build v11 · acurácia';
$('build').textContent = BUILD;
refresh(null);
engine.ready.then(() => {
  $('enginestate').textContent = 'Motor pronto';
  $('enginestate').parentElement.classList.add('ready');
  engine.setSkill(20);
});

// PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// expose for debugging
window.__cv = { game, engine, board };
