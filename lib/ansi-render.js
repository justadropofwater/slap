// Light ANSI-to-blessed-tags converter for the terminal pane's PTY shell mode.
//
// This is NOT a full xterm-compatible terminal emulator. It maintains a
// "line buffer" that handles the most common shell behaviors:
//
//   * SGR (colors / bold / underline / inverse), basic 8 + 16 + 256 + truecolor
//   * \r        return to start of current line (overwrite)
//   * \n        commit current line to scrollback
//   * \b        delete previous character on the current line
//   * \x07      bell (dropped)
//   * CSI K / 0K   clear from cursor to end of line  (no-op for our model)
//   * CSI 1K       clear from start to cursor        (clear current line)
//   * CSI 2K       clear whole line                  (clear current line)
//
// Cursor-positioning CSI sequences (CSI nA/B/C/D, CSI ;H, CSI nm cursor moves,
// scroll regions, alt screen buffer) are dropped silently. Programs that
// depend on full cursor control -- vim, less, htop, fzf -- will not render
// correctly. Programs that emit colored output, write progress bars with \r,
// or use readline-style tab completion will render fine.
//
// For full TUI app support, swap this module for a cell-grid renderer that
// understands the alternate screen buffer; the TerminalPane public API stays
// the same.

var ANSI_FG_BASIC = {
  30: 'black', 31: 'red', 32: 'green', 33: 'yellow',
  34: 'blue', 35: 'magenta', 36: 'cyan', 37: 'white',
  90: 'lightblack', 91: 'lightred', 92: 'lightgreen', 93: 'lightyellow',
  94: 'lightblue', 95: 'lightmagenta', 96: 'lightcyan', 97: 'lightwhite',
};
var ANSI_BG_BASIC = {
  40: 'black', 41: 'red', 42: 'green', 43: 'yellow',
  44: 'blue', 45: 'magenta', 46: 'cyan', 47: 'white',
  100: 'lightblack', 101: 'lightred', 102: 'lightgreen', 103: 'lightyellow',
  104: 'lightblue', 105: 'lightmagenta', 106: 'lightcyan', 107: 'lightwhite',
};

function escapeBlessed(s) {
  // Avoid blessed parsing user-provided text as markup. Single-pass replace
  // so the `}` inside `{open}` (the substitution itself) doesn't match a
  // second pass.
  return s.replace(/[{}]/g, function (c) { return c === '{' ? '{open}' : '{close}'; });
}

function initialSgr() {
  return { fg: null, bg: null, bold: false, underline: false, inverse: false };
}

function copySgr(s) {
  return { fg: s.fg, bg: s.bg, bold: s.bold, underline: s.underline, inverse: s.inverse };
}

function sgrEqual(a, b) {
  return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold
    && a.underline === b.underline && a.inverse === b.inverse;
}

// Mutate `state` in place. Returns nothing.
function applySgrInPlace(state, params) {
  if (!params.length || (params.length === 1 && params[0] === 0)) {
    state.fg = null; state.bg = null;
    state.bold = false; state.underline = false; state.inverse = false;
    return;
  }
  var i = 0;
  while (i < params.length) {
    var n = params[i];
    if (n === 0) {
      state.fg = null; state.bg = null;
      state.bold = false; state.underline = false; state.inverse = false;
    } else if (n === 1) state.bold = true;
    else if (n === 22) state.bold = false;
    else if (n === 4) state.underline = true;
    else if (n === 24) state.underline = false;
    else if (n === 7) state.inverse = true;
    else if (n === 27) state.inverse = false;
    else if (n === 39) state.fg = null;
    else if (n === 49) state.bg = null;
    else if (ANSI_FG_BASIC[n]) state.fg = ANSI_FG_BASIC[n];
    else if (ANSI_BG_BASIC[n]) state.bg = ANSI_BG_BASIC[n];
    else if (n === 38 && params[i + 1] === 5) {
      state.fg = approx256(params[i + 2]);
      i += 2;
    } else if (n === 48 && params[i + 1] === 5) {
      state.bg = approx256(params[i + 2]);
      i += 2;
    } else if ((n === 38 || n === 48) && params[i + 1] === 2) {
      var rgb = approxRgb(params[i + 2], params[i + 3], params[i + 4]);
      if (n === 38) state.fg = rgb;
      else state.bg = rgb;
      i += 4;
    }
    i++;
  }
}

// Backwards-compat wrapper: takes state, returns new state. Used by the older
// chunkToTags pathway and by tests that exercise the SGR table directly.
function applySgr(state, params) {
  var out = copySgr(state);
  applySgrInPlace(out, params);
  return out;
}

function approx256(n) {
  if (n >= 0 && n <= 7) return ['black','red','green','yellow','blue','magenta','cyan','white'][n];
  if (n >= 8 && n <= 15) return ['lightblack','lightred','lightgreen','lightyellow','lightblue','lightmagenta','lightcyan','lightwhite'][n - 8];
  if (n >= 232) return n < 244 ? 'lightblack' : 'white';
  return 'white';
}

function approxRgb(r, g, b) {
  var bright = (r + g + b) > 384;
  if (r > 192 && g < 96 && b < 96) return bright ? 'lightred' : 'red';
  if (g > 192 && r < 96 && b < 96) return bright ? 'lightgreen' : 'green';
  if (b > 192 && r < 96 && g < 96) return bright ? 'lightblue' : 'blue';
  if (r > 192 && g > 192) return bright ? 'lightyellow' : 'yellow';
  if (r > 192 && b > 192) return bright ? 'lightmagenta' : 'magenta';
  if (g > 192 && b > 192) return bright ? 'lightcyan' : 'cyan';
  if (r + g + b < 96) return 'black';
  return bright ? 'lightwhite' : 'white';
}

function styleTags(state) {
  var open = '';
  var close = '';
  if (state.fg) { open += '{' + state.fg + '-fg}'; close = '{/' + state.fg + '-fg}' + close; }
  if (state.bg) { open += '{' + state.bg + '-bg}'; close = '{/' + state.bg + '-bg}' + close; }
  if (state.bold) { open += '{bold}'; close = '{/bold}' + close; }
  if (state.underline) { open += '{underline}'; close = '{/underline}' + close; }
  if (state.inverse) { open += '{inverse}'; close = '{/inverse}' + close; }
  return { open: open, close: close };
}

// ---------------------------------------------------------------------------
// Buffer API (primary)
// ---------------------------------------------------------------------------
//
// A buffer holds:
//   committed: rendered blessed-tagged string for fully-terminated lines,
//              each ending with '\n'. Bounded by maxCommittedLines so memory
//              stays flat for long-running tail / build commands.
//   cells:     array of {ch, sgr} cells for the line being built. We track
//              cells (not pre-rendered tags) so cursor moves -- \r, \b,
//              CSI K -- can update individual columns without disturbing
//              the rest of the line.
//   cursor:    0-indexed column within the current line. \r resets it to 0,
//              printable bytes overwrite cells[cursor] then advance, etc.
//              This is the minimal piece of "cursor state" required to
//              correctly render echoed prompts (echo cmd\r\n must preserve
//              "echo cmd" on the line) AND in-place progress redraws
//              ([10%]\r[50%]\r[100%] must show only [100%]).
//   sgr:       active SGR carried across feed() calls.
//
// Caller pattern:
//   var buf = ansi.createBuffer();
//   pty.onData(function (data) {
//     ansi.feed(buf, data);
//     widget.setContent(ansi.render(buf));
//     widget.setScrollPerc(100);
//   });

function createBuffer(opts) {
  opts = opts || {};
  return {
    committed: '',
    cells: [],
    cursor: 0,
    sgr: initialSgr(),
    maxCommittedLines: opts.maxCommittedLines != null ? opts.maxCommittedLines : 5000,
  };
}

function reset(buf) {
  buf.committed = '';
  buf.cells = [];
  buf.cursor = 0;
}

function feed(buf, input) {
  var i = 0;
  var n = input.length;
  while (i < n) {
    var ch = input[i];

    if (ch === '\x1b') {
      if (input[i + 1] === '[') {
        // CSI sequence
        var end = i + 2;
        while (end < n && !/[A-Za-z]/.test(input[end])) end++;
        if (end >= n) {
          // Incomplete CSI at chunk boundary -- drop and resume next chunk.
          break;
        }
        var paramStr = input.slice(i + 2, end);
        var finalCh = input[end];
        var params = paramStr.split(';').map(function (p) { return p === '' ? 0 : +p; });

        if (finalCh === 'm') {
          applySgrInPlace(buf.sgr, params);
        } else if (finalCh === 'K') {
          var k = params[0] || 0;
          if (k === 0) {
            // Erase from cursor to end of line.
            buf.cells.length = buf.cursor;
          } else if (k === 1) {
            // Erase from start of line to cursor (replace with spaces).
            for (var j = 0; j < buf.cursor && j < buf.cells.length; j++) {
              buf.cells[j] = { ch: ' ', sgr: copySgr(buf.sgr) };
            }
          } else if (k === 2) {
            // Erase whole line.
            buf.cells = [];
            buf.cursor = 0;
          }
        }
        // Every other CSI (cursor positioning, scroll, alt screen, OSC,
        // bracketed paste, terminfo init like CSI ?1034h) is silently
        // dropped.
        i = end + 1;
        continue;
      }
      // ESC followed by some other byte (OSC, character set selection,
      // 7-bit single-shift). Drop the ESC; the next iteration will process
      // the byte. Most of those bytes are harmless printable letters; the
      // visible artifact is acceptable for a non-emulator renderer.
      i++;
      continue;
    }

    if (ch === '\n') { commitLine(buf); i++; continue; }
    if (ch === '\r') { buf.cursor = 0; i++; continue; }
    if (ch === '\b') { if (buf.cursor > 0) buf.cursor--; i++; continue; }
    if (ch === '\x07') { i++; continue; }
    // Drop other C0 control bytes; keep TAB.
    if (ch < ' ' && ch !== '\t') { i++; continue; }

    // Printable: overwrite the cell at cursor, then advance.
    buf.cells[buf.cursor] = { ch: ch, sgr: copySgr(buf.sgr) };
    buf.cursor++;
    i++;
  }
  return buf;
}

function commitLine(buf) {
  buf.committed += renderCells(buf.cells) + '\n';
  buf.cells = [];
  buf.cursor = 0;
  if (buf.maxCommittedLines && buf.maxCommittedLines > 0) {
    // Count newlines; trim from the front when over budget.
    var count = 0;
    for (var i = 0; i < buf.committed.length; i++) {
      if (buf.committed.charCodeAt(i) === 10) count++;
    }
    if (count > buf.maxCommittedLines) {
      var drops = count - buf.maxCommittedLines;
      var idx = 0;
      while (drops-- > 0) {
        idx = buf.committed.indexOf('\n', idx) + 1;
      }
      buf.committed = buf.committed.slice(idx);
    }
  }
}

function renderCells(cells) {
  if (!cells.length) return '';
  // Compact runs of consecutive cells with equal SGR so we emit one open/
  // close tag pair per run rather than per character. Falsy cells (gaps
  // produced by cursor jumps we don't fully model) render as a space.
  var out = '';
  var runText = '';
  var runSgr = null;
  for (var i = 0; i < cells.length; i++) {
    var cell = cells[i];
    var ch = cell ? cell.ch : ' ';
    var sgr = cell ? cell.sgr : initialSgr();
    if (runSgr === null || !sgrEqual(runSgr, sgr)) {
      if (runText) {
        var tags = styleTags(runSgr);
        out += tags.open + escapeBlessed(runText) + tags.close;
      }
      runText = '';
      runSgr = sgr;
    }
    runText += ch;
  }
  if (runText) {
    var tags2 = styleTags(runSgr);
    out += tags2.open + escapeBlessed(runText) + tags2.close;
  }
  return out;
}

function render(buf) {
  return buf.committed + renderCells(buf.cells);
}

// ---------------------------------------------------------------------------
// Backwards-compat: chunkToTags
// ---------------------------------------------------------------------------
//
// Older callers (the pre-Phase-4 TerminalPane and existing ansi-render tests)
// expect a function that converts a single chunk to tagged markup with no
// notion of scrollback / current-line. Implement it on top of the buffer API.
function chunkToTags(input, prevState) {
  var buf = createBuffer({ maxCommittedLines: 0 });
  if (prevState) buf.sgr = copySgr(prevState);
  feed(buf, input);
  return [render(buf), buf.sgr];
}

module.exports = {
  // Buffer API (primary)
  createBuffer: createBuffer,
  feed: feed,
  render: render,
  reset: reset,

  // Legacy API
  chunkToTags: chunkToTags,

  // Test helpers
  _styleTags: styleTags,
  _applySgr: applySgr,
  _initialState: initialSgr,
  _escapeBlessed: escapeBlessed,
};
