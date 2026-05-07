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

// Color names use the hyphenated `light-X` form, NOT `lightX`. blessed's
// _parseTags does `param.replace(/-/g, ' ')` and then matches against cases
// like `'light yellow fg'`. With no hyphen there's no internal space and no
// case match, so blessed leaves `{lightyellow-fg}` as literal text -- which
// is exactly the rendering bug fish prompt themes hit (they emit \033[93m,
// we used to convert that to {lightyellow-fg}, blessed didn't parse it,
// users saw the tag as visible characters).
var ANSI_FG_BASIC = {
  30: 'black', 31: 'red', 32: 'green', 33: 'yellow',
  34: 'blue', 35: 'magenta', 36: 'cyan', 37: 'white',
  90: 'light-black', 91: 'light-red', 92: 'light-green', 93: 'light-yellow',
  94: 'light-blue', 95: 'light-magenta', 96: 'light-cyan', 97: 'light-white',
};
var ANSI_BG_BASIC = {
  40: 'black', 41: 'red', 42: 'green', 43: 'yellow',
  44: 'blue', 45: 'magenta', 46: 'cyan', 47: 'white',
  100: 'light-black', 101: 'light-red', 102: 'light-green', 103: 'light-yellow',
  104: 'light-blue', 105: 'light-magenta', 106: 'light-cyan', 107: 'light-white',
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
  if (n >= 8 && n <= 15) return ['light-black','light-red','light-green','light-yellow','light-blue','light-magenta','light-cyan','light-white'][n - 8];
  if (n >= 232) return n < 244 ? 'light-black' : 'white';
  return 'white';
}

function approxRgb(r, g, b) {
  var bright = (r + g + b) > 384;
  if (r > 192 && g < 96 && b < 96) return bright ? 'light-red' : 'red';
  if (g > 192 && r < 96 && b < 96) return bright ? 'light-green' : 'green';
  if (b > 192 && r < 96 && g < 96) return bright ? 'light-blue' : 'blue';
  if (r > 192 && g > 192) return bright ? 'light-yellow' : 'yellow';
  if (r > 192 && b > 192) return bright ? 'light-magenta' : 'magenta';
  if (g > 192 && b > 192) return bright ? 'light-cyan' : 'cyan';
  if (r + g + b < 96) return 'black';
  return bright ? 'light-white' : 'white';
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
    // Bytes the renderer wants written BACK to the PTY in response to
    // capability queries (DA1, XTVERSION, kitty keyboard, DCS XTGETTCAP,
    // DSR). Without this, modern shells like fish wait 2s for a DA1
    // response and then print "fish could not read response to Primary
    // Device Attribute query" before degrading to a feature-reduced mode.
    // Caller pattern:
    //
    //   ansi.feed(buf, data);
    //   if (buf.responses) {
    //     pty.write(buf.responses);
    //     buf.responses = '';
    //   }
    responses: '',
  };
}

function reset(buf) {
  buf.committed = '';
  buf.cells = [];
  buf.cursor = 0;
  buf.responses = '';
}

function feed(buf, input) {
  var i = 0;
  var n = input.length;
  while (i < n) {
    var ch = input[i];

    if (ch === '\x1b') {
      var next = input[i + 1];
      if (next === '[') {
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
        } else if (finalCh === 'c') {
          // Device Attributes. DA1 = CSI c / CSI 0c (primary). DA2 =
          // CSI >c / CSI >0c (secondary). DA1 is what fish blocks 2s on.
          // Reply as "VT100 with Advanced Video Option" (?1;2c) for DA1
          // and a generic terminal type 0 / version 0 for DA2.
          if (paramStr[0] === '>') {
            buf.responses += '\x1b[>0;0;0c';
          } else {
            buf.responses += '\x1b[?1;2c';
          }
        } else if (finalCh === 'n') {
          // DSR: 5n -> "ready" (CSI 0n). 6n -> cursor position report
          // (CSI <row>;<col>R). We don't track row in the line-buffer
          // model; report row 1 and current column (1-indexed).
          var dsrParam = params[0] || 0;
          if (dsrParam === 5) buf.responses += '\x1b[0n';
          else if (dsrParam === 6) buf.responses += '\x1b[1;' + (buf.cursor + 1) + 'R';
        } else if (finalCh === 'u' && paramStr[0] === '?') {
          // Kitty keyboard protocol query (CSI ?u). Reply with "no flags
          // set" so the shell knows we don't speak the kitty protocol;
          // it then falls back to legacy keystroke encoding which our
          // pane already forwards correctly.
          buf.responses += '\x1b[?0u';
        } else if (finalCh === 'q' && paramStr[0] === '>') {
          // XTVERSION (CSI >q / CSI >0q). Reply with DCS > | <name> ST.
          buf.responses += '\x1bP>|slap-pty\x1b\\';
        }
        // Every other CSI (cursor positioning, scroll, alt screen,
        // bracketed paste, terminfo init like CSI ?1034h, etc.) is
        // silently dropped.
        i = end + 1;
        continue;
      }

      if (next === ']' || next === 'P' || next === 'X' || next === '^' || next === '_') {
        // String-class escape (OSC, DCS, SOS, PM, APC). Terminate at BEL
        // (\x07) or ST (ESC \). Modern shells emit OSC 7 / OSC 0 / OSC 8
        // (hyperlinks) / OSC 133 (semantic prompt marks); fish and zsh
        // also emit DCS terminfo queries via XTGETTCAP. None of these
        // are useful to the renderer for displaying content -- but DCS
        // XTGETTCAP DOES need a reply, otherwise fish times out on it
        // along with DA1.
        var stringStart = i + 2;
        var stringEnd = stringStart;
        var terminatorLen = 0;
        while (stringEnd < n) {
          if (input[stringEnd] === '\x07') { terminatorLen = 1; break; }
          if (input[stringEnd] === '\x1b' && input[stringEnd + 1] === '\\') {
            terminatorLen = 2;
            break;
          }
          stringEnd++;
        }
        if (terminatorLen === 0) break; // incomplete; pick up next chunk

        if (next === 'P') {
          // DCS payload format for XTGETTCAP query is `+q<hex-list>`,
          // optionally preceded by numeric params. Reply with
          // `DCS 0+r<hex-list> ST` -- the leading 0 means "invalid /
          // capability not supported", which is enough for fish to
          // accept and move on (instead of blocking on the timeout).
          var payload = input.slice(stringStart, stringEnd);
          var m = payload.match(/^[\d;]*\+q([0-9a-fA-F;]*)/);
          if (m) {
            buf.responses += '\x1bP0+r' + m[1] + '\x1b\\';
          }
        }

        i = stringEnd + terminatorLen;
        continue;
      }

      if (next != null) {
        // Single-byte ESC sequences: ESC = (DECPAM keypad mode), ESC >
        // (DECPNM normal keypad), ESC 7/8 (save/restore cursor), ESC c
        // (RIS reset), ESC D/E/H/M (IND/NEL/HTS/RI), ESC ( / ) / * / + 0
        // (character-set designation), and so on. The full grammar is
        // ESC plus exactly one byte; drop both. Without this guard the
        // second byte would leak as a visible character.
        i += 2;
        continue;
      }

      // Bare ESC at the very end of a chunk; drop it and pick up next
      // chunk. (We can't tell yet if it's the start of a CSI/OSC.)
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
