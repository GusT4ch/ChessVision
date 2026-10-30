# ChessVision

Tabuleiro de análise de xadrez como **PWA** (app web instalável), com o motor
**Stockfish 16** rodando direto no navegador via WebAssembly. Você move as peças
e o Stockfish mostra uma **seta com o melhor lance**, além da avaliação da
posição e da linha principal — tudo offline, sem servidor.

## Funciona assim

- Mova qualquer peça (toque-e-toque ou arrastar). Só lances legais são aceitos.
- A cada lance, o motor calcula e desenha uma **seta** para o melhor lance.
- Barra de avaliação + placar (ex.: `+0.8`, `M3`) e linha principal em notação SAN.
- Botões: **Nova** partida, **Voltar** (desfazer), **Girar** tabuleiro,
  **Melhor lance** (forçar análise), carregar/copiar **FEN**.
- Profundidade de análise ajustável e seta automática ligável/desligável.

## Rodar localmente

Precisa ser servido por HTTP (módulos ES + service worker não funcionam via `file://`):

```bash
cd ChessVision
python3 -m http.server 8000
# abra http://localhost:8000
```

## Instalar no iPhone (adicionar à Tela de Início)

1. Hospede a pasta em HTTPS (ex.: GitHub Pages, Netlify, Vercel).
2. Abra o site no **Safari** do iPhone.
3. Toque em **Compartilhar → Adicionar à Tela de Início**.
4. O ícone aparece como app; abre em tela cheia e funciona offline.

> Observação: para um `.ipa` assinado instalável fora da App Store seria
> necessário macOS + Xcode + conta de desenvolvedor Apple. Esta versão é um
> PWA, que não exige nada disso e roda no iPhone pelo Safari.

## Estrutura

```
index.html              interface
styles.css              estilos (tema escuro, mobile-first)
js/app.js               liga tabuleiro + motor + regras
js/board.js             render do tabuleiro, interação e seta (SVG)
js/engine.js            wrapper UCI do Stockfish (Web Worker)
js/chess.js             chess.js (regras/validação de lances)
engine/                 Stockfish 16 single-thread (WASM + rede NNUE)
sw.js                   service worker (cache offline)
manifest.webmanifest    metadados do PWA
icons/                  ícones do app
```

## Créditos / Licenças

- Motor: [Stockfish](https://stockfishchess.org/) via
  [stockfish.js](https://github.com/nmrugg/stockfish.js) — **GPLv3**
  (ver `engine/STOCKFISH-LICENSE.txt`).
- Peças: conjunto **Staunty**, por sadsnake1 (via [Lichess](https://github.com/lichess-org/lila)) —
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (uso não comercial).
- Regras: [chess.js](https://github.com/jhlywa/chess.js) — BSD-2-Clause.
