// Board rendering, interaction (tap-to-move + drag) and the SVG arrow overlay.

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export class BoardView {
  constructor(root, { onUserMove, legalMovesFor }) {
    this.root = root;
    this.onUserMove = onUserMove;         // (from, to) => boolean (accepted?)
    this.legalMovesFor = legalMovesFor;   // (square) => [toSquares]
    this.flipped = false;
    this.selected = null;
    this.position = null;                 // chess.js board() array
    this.arrow = null;                    // { from, to }
    this.lastMove = null;                 // { from, to }
    this._build();
  }

  _build() {
    this.root.classList.add('cv-board');
    this.root.innerHTML = '';
    this.squares = {};
    this.grid = document.createElement('div');
    this.grid.className = 'cv-grid';
    this.root.appendChild(this.grid);

    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const name = FILES[f] + (r + 1);
        const sq = document.createElement('div');
        sq.className = 'cv-sq ' + (((r + f) % 2 === 0) ? 'dark' : 'light');
        sq.dataset.square = name;
        sq.addEventListener('pointerdown', (e) => this._onDown(e, name));
        this.squares[name] = sq;
      }
    }
    this._layout();

    // Overlay for arrows / move markers.
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 8 8');
    this.svg.classList.add('cv-overlay');
    this.svg.innerHTML = `<defs>
      <marker id="cv-arrowhead" markerWidth="2.6" markerHeight="2.6" refX="2.2" refY="1.3"
        orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L2.6,1.3 L0,2.6 L0.9,1.3 Z" fill="currentColor"/></marker>
    </defs>`;
    this.root.appendChild(this.svg);

    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
  }

  // (Re)append squares into the grid in current display order and record each
  // square's display column/row so geometry (arrows) stays consistent.
  _layout() {
    this.order = [];
    const ranks = this.flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const files = this.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    this._pos = {};
    let i = 0;
    for (let rr = 0; rr < 8; rr++) {
      for (let ff = 0; ff < 8; ff++) {
        const name = FILES[files[ff]] + (ranks[rr] + 1);
        this.grid.appendChild(this.squares[name]);
        this._pos[name] = { col: ff, row: rr };
        this.order[i++] = name;
      }
    }
  }

  flip() { this.flipped = !this.flipped; this._layout(); this._drawArrow(); }

  setPosition(boardArray, lastMove) {
    this.position = boardArray;
    this.lastMove = lastMove || null;
    this.selected = null;
    this.render();
  }

  render() {
    for (const name in this.squares) {
      const sq = this.squares[name];
      sq.classList.remove('sel', 'last', 'target', 'capture');
      // remove existing piece
      const old = sq.querySelector('.cv-piece');
      if (old) old.remove();
    }
    if (!this.position) return;

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = this.position[r][f];
        if (!cell) continue;
        const name = FILES[f] + (8 - r);
        const el = document.createElement('div');
        el.className = 'cv-piece ' + cell.color;
        el.textContent = GLYPH[cell.type];
        this.squares[name].appendChild(el);
      }
    }

    if (this.lastMove) {
      this.squares[this.lastMove.from]?.classList.add('last');
      this.squares[this.lastMove.to]?.classList.add('last');
    }
    if (this.selected) this._showSelection();
  }

  _showSelection() {
    this.squares[this.selected]?.classList.add('sel');
    const moves = this.legalMovesFor(this.selected) || [];
    for (const to of moves) {
      const sq = this.squares[to];
      if (!sq) continue;
      sq.classList.add(sq.querySelector('.cv-piece') ? 'capture' : 'target');
    }
  }

  _clearSelection() {
    this.squares[this.selected]?.classList.remove('sel');
    for (const name in this.squares) this.squares[name].classList.remove('target', 'capture');
    this.selected = null;
  }

  _squareFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const sq = el.closest('.cv-sq');
    return sq ? sq.dataset.square : null;
  }

  _onDown(e, name) {
    e.preventDefault();
    const piece = this.squares[name].querySelector('.cv-piece');

    if (this.selected && this.selected !== name) {
      const moves = this.legalMovesFor(this.selected) || [];
      if (moves.includes(name)) {
        const from = this.selected;
        this._clearSelection();
        this.onUserMove(from, name);
        return;
      }
    }

    if (piece) {
      // (re)select and start a potential drag
      if (this.selected) this._clearSelection();
      this.selected = name;
      this._showSelection();
      this._drag = {
        from: name, el: piece, moved: false,
        startX: e.clientX, startY: e.clientY,
      };
      piece.classList.add('dragging');
      piece.setPointerCapture?.(e.pointerId);
    } else if (this.selected) {
      this._clearSelection();
    }
  }

  _onMove(e) {
    if (!this._drag) return;
    const d = this._drag;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    d.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
  }

  _onUp(e) {
    if (!this._drag) return;
    const d = this._drag;
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    this._drag = null;
    if (!d.moved) return; // was a tap; selection already handled
    const target = this._squareFromPoint(e.clientX, e.clientY);
    if (target && target !== d.from) {
      const moves = this.legalMovesFor(d.from) || [];
      if (moves.includes(target)) {
        this._clearSelection();
        this.onUserMove(d.from, target);
        return;
      }
    }
    // dropped on an illegal square: keep selection visible
  }

  _center(square) {
    const p = this._pos[square];
    return { x: p.col + 0.5, y: p.row + 0.5 };
  }

  setArrow(from, to) {
    this.arrow = (from && to) ? { from, to } : null;
    this._drawArrow();
  }

  _drawArrow() {
    // remove old line
    const prev = this.svg.querySelector('.cv-arrow');
    if (prev) prev.remove();
    if (!this.arrow) return;
    const a = this._center(this.arrow.from);
    const b = this._center(this.arrow.to);
    // shorten so the head sits nicely inside the target square
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const ax = a.x + Math.cos(ang) * 0.18;
    const ay = a.y + Math.sin(ang) * 0.18;
    const bx = b.x - Math.cos(ang) * 0.36;
    const by = b.y - Math.sin(ang) * 0.36;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'cv-arrow');
    line.setAttribute('x1', ax); line.setAttribute('y1', ay);
    line.setAttribute('x2', bx); line.setAttribute('y2', by);
    line.setAttribute('marker-end', 'url(#cv-arrowhead)');
    this.svg.appendChild(line);
  }
}
