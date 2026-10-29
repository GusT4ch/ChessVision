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

let analysisDepth = 14;
let autoArrow = true;

function refresh(lastMove) {
  board.setPosition(game.board(), lastMove);
  updateStatus();
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

function tryMove(from, to) {
  // Auto-queen on promotion for simplicity.
  const moves = game.moves({ square: from, verbose: true });
  const m = moves.find((x) => x.to === to);
  if (!m) return false;
  const opts = { from, to };
  if (m.promotion) opts.promotion = 'q';
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
    setEval(null);
    $('bestline').textContent = '';
    return;
  }
  analyzing = true;
  setThinking(true);
  const fen = game.fen();
  const turn = game.turn();

  const res = await engine.analyze(fen, { depth: analysisDepth }, (info) => {
    renderEval(info, turn);
    if (autoArrow && info.bestSoFar) drawMoveArrow(info.bestSoFar);
  });

  analyzing = false;
  setThinking(false);
  if (game.fen() !== fen) return; // position changed meanwhile
  // keep the printed line consistent with the final best move / arrow
  if (res.bestmove && res.info.pv[0] !== res.bestmove) {
    res.info.pv = [res.bestmove, ...res.info.pv];
  }
  renderEval(res.info, turn);
  if (res.bestmove) drawMoveArrow(res.bestmove);
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
  if (mate != null) {
    setEval({ mate: mate * sign });
    $('bestline').textContent = pvToSan(info.pv);
  } else if (cp != null) {
    setEval({ cp: cp * sign });
    $('bestline').textContent = pvToSan(info.pv);
  }
}

function pvToSan(pv) {
  if (!pv || !pv.length) return '';
  const tmp = new Chess(game.fen());
  const sans = [];
  for (const uci of pv.slice(0, 8)) {
    const mv = tmp.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
    if (!mv) break;
    sans.push(mv.san);
  }
  return sans.join(' ');
}

function setEval(score) {
  const bar = $('evalfill');
  const label = $('evallabel');
  if (!score) { bar.style.height = '50%'; label.textContent = ''; return; }
  if (score.mate != null) {
    const whiteWinning = score.mate > 0;
    bar.style.height = whiteWinning ? '100%' : '0%';
    label.textContent = 'M' + Math.abs(score.mate);
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
  board.setArrow(null, null);
  refresh(null);
  setEval(null);
  $('bestline').textContent = '';
});

$('btn-hint').addEventListener('click', () => analyze());

$('depth').addEventListener('input', (e) => {
  analysisDepth = parseInt(e.target.value, 10);
  $('depthval').textContent = analysisDepth;
});

$('auto').addEventListener('change', (e) => {
  autoArrow = e.target.checked;
  if (!autoArrow) board.setArrow(null, null);
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
refresh(null);
engine.ready.then(() => {
  $('enginestate').textContent = 'Motor pronto';
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
