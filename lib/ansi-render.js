// Light ANSI-to-blessed-tags converter for the terminal pane's PTY shell mode.
//
// This is NOT a full terminal emulator. It renders linear scrollback with
// SGR color/style support and a small set of common control characters
// (\r, \n, \b, BEL). CSI sequences other than SGR (cursor positioning,
// clear-screen, etc.) are dropped silently. That means programs that
// expect a real terminal -- vim, less, htop, fzf -- won't render
// correctly. Programs that just emit colored text (git, ls --color, npm,
// most CLIs) work fine.
//
// For full-screen TUI support, a heavier renderer (term.js / xterm) can
// replace this module without changing the TerminalPane shell-mode shape.

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

// Apply a single SGR parameter list to a state object. Returns updated state.
function applySgr(state, params) {
  if (!params.length || (params.length === 1 && params[0] === 0)) {
    return { fg: null, bg: null, bold: false, underline: false, inverse: false };
  }
  var i = 0;
  while (i < params.length) {
    var n = params[i];
    if (n === 0) { state = { fg: null, bg: null, bold: false, underline: false, inverse: false }; }
    else if (n === 1) state.bold = true;
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
      // 256-color FG: 38;5;N (we just degrade to nearest basic name on common ranges)
      state.fg = approx256(params[i + 2]);
      i += 2;
    } else if (n === 48 && params[i + 1] === 5) {
      state.bg = approx256(params[i + 2]);
      i += 2;
    } else if ((n === 38 || n === 48) && params[i + 1] === 2) {
      // Truecolor 38;2;R;G;B -- collapse to nearest basic by quadrant.
      var rgb = approxRgb(params[i + 2], params[i + 3], params[i + 4]);
      if (n === 38) state.fg = rgb;
      else state.bg = rgb;
      i += 4;
    }
    i++;
  }
  return state;
}

function approx256(n) {
  // 0-7 -> basic; 8-15 -> light; otherwise round to nearest basic.
  if (n >= 0 && n <= 7) return ['black','red','green','yellow','blue','magenta','cyan','white'][n];
  if (n >= 8 && n <= 15) return ['lightblack','lightred','lightgreen','lightyellow','lightblue','lightmagenta','lightcyan','lightwhite'][n - 8];
  // Grayscale 232-255 -> white/black.
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

// Parse a chunk of bytes and return blessed-tagged markup ready for setContent.
// `prevState` is the SGR state carried across calls (mutated and returned via
// the second tuple element).
function chunkToTags(input, prevState) {
  var state = prevState || { fg: null, bg: null, bold: false, underline: false, inverse: false };
  var out = '';
  var run = '';
  var current = state;

  function flushRun() {
    if (!run) return;
    var tags = styleTags(current);
    out += tags.open + escapeBlessed(run) + tags.close;
    run = '';
  }

  for (var i = 0; i < input.length; i++) {
    var ch = input[i];
    if (ch === '\x1b') {
      flushRun();
      // CSI?
      if (input[i + 1] === '[') {
        var end = i + 2;
        while (end < input.length && !/[A-Za-z]/.test(input[end])) end++;
        if (end >= input.length) {
          // Incomplete CSI at end of chunk; bail and stash for next chunk.
          out += '\x1b' + input.slice(i + 1);
          i = input.length;
          break;
        }
        var paramStr = input.slice(i + 2, end);
        var finalCh = input[end];
        if (finalCh === 'm') {
          var params = paramStr.split(';').map(function (p) { return p === '' ? 0 : +p; });
          state = applySgr(state, params);
          current = state;
        }
        // All other CSI sequences silently dropped (cursor positioning, clear,
        // bracketed paste, etc.).
        i = end;
        continue;
      }
      // Other escape introducers: drop the byte.
      continue;
    }
    if (ch === '\r') {
      flushRun();
      // Approximate carriage return by emitting a real CR. blessed.Log will
      // render it; for plain BaseWidget content, the CR is consumed by the
      // shell-mode wrapper via line splitting.
      out += '\r';
      continue;
    }
    if (ch === '\b') {
      flushRun();
      // Backspace: drop the last character of the run we already emitted.
      if (out.length) out = out.replace(/.$/, '');
      continue;
    }
    if (ch === '\x07') {
      // Bell -- drop.
      continue;
    }
    run += ch;
  }
  flushRun();
  return [out, state];
}

module.exports = {
  chunkToTags: chunkToTags,
  // exposed for tests
  _styleTags: styleTags,
  _applySgr: applySgr,
  _initialState: function () { return { fg: null, bg: null, bold: false, underline: false, inverse: false }; },
};
