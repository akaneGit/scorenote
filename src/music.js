export const SOLFEGE = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const mod = (n, d) => ((n % d) + d) % d;

// Diatonic index: C0 = 0; the lowest line of a treble staff is E4 = 30.
export function pitchAt(y, staff) {
  return (staff.bottomPitch ?? 30) + Math.round((staff.bottom - y) / (staff.spacing / 2));
}

export function keyAccidental(diatonic, key = 0) {
  const order = key > 0 ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3];
  return order.slice(0, Math.abs(key)).includes(mod(diatonic, 7)) ? Math.sign(key) : 0;
}

export function resolvedAccidental(note, key = 'auto') { return note.accidental ?? note.measureAccidental ?? keyAccidental(note.pitch, key === 'auto' ? (note.keySignature ?? 0) : key); }

export function noteLabel(note, key = 0, octave = false) {
  const accidental = resolvedAccidental(note, key);
  const suffix = ({ '-2': '♭♭', '-1': '♭', 0: '', 1: '♯', 2: '♯♯' })[accidental] ?? '';
  return SOLFEGE[mod(note.pitch, 7)] + suffix + (octave ? Math.floor(note.pitch / 7) : '');
}

export function pitchName(note, key = 0) {
  return LETTERS[mod(note.pitch, 7)] + ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' })[resolvedAccidental(note, key)] + Math.floor(note.pitch / 7);
}

export function nearestStaff(y, staves) {
  return staves.reduce((best, staff) => !best || Math.abs((staff.top + staff.bottom) / 2 - y) < Math.abs((best.top + best.bottom) / 2 - y) ? staff : best, null);
}

// This profile is intentionally limited to the font observed in the supplied score.
// Kousaku maps its filled and hollow noteheads to U+00CF and U+00FA.
export function detectKousaku(items, fontNames, viewport) {
  const music = items.filter(item => /Kousaku/i.test(fontNames[item.fontName] || '') && item.str?.trim());
  const staves = music.filter(item => item.str === '&').map((item, i) => {
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const spacing = Math.hypot(item.transform[2], item.transform[3]) / 4;
    return { id: i, x, top: y - spacing * 3, bottom: y + spacing, spacing };
  }).sort((a, b) => a.top - b.top);
  staves.forEach((staff, i) => { staff.id = i; });
  const notes = [];
  if (viewport.rotation !== 0) return { staves: [], notes: [] };
  for (const item of music) {
    if (!/^[Ïú]+$/.test(item.str)) continue;
    for (let i = 0; i < item.str.length; i++) {
      const [x, y] = viewport.convertToViewportPoint(item.transform[4] + item.width * (i + 0.5) / item.str.length, item.transform[5]);
      const staff = nearestStaff(y, staves);
      if (!staff || Math.abs(y - (staff.top + staff.bottom) / 2) > staff.spacing * 10) continue;
      notes.push({ id: `auto-${notes.length}`, x, y: staff.bottom + staff.spacing * 6.5,
        noteX: x, noteY: y, pitch: pitchAt(y, staff), accidental: null, staffId: staff.id, source: 'auto' });
    }
  }
  notes.sort((a, b) => a.staffId - b.staffId || a.noteX - b.noteX);
  return { staves, notes };
}

const matrix = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
const identity = () => [1, 0, 0, 1, 0, 0];

// TextContent can merge adjacent notes at different staff heights.
// Replay text operators to preserve each glyph's original position.
export function extractGlyphItems(operators, OPS) {
  let state = { ctm: identity(), tm: identity(), line: identity(), fontName: '', size: 0, hScale: 1, charSpace: 0, wordSpace: 0, leading: 0, rise: 0 };
  const stack = [], items = [];
  const move = (x, y) => { state.line = matrix(state.line, [1,0,0,1,x,y]); state.tm = [...state.line]; };
  const show = glyphs => {
    for (const glyph of glyphs) {
      if (typeof glyph === 'number') { state.tm = matrix(state.tm, [1,0,0,1,-glyph * state.size * state.hScale / 1000,0]); continue; }
      if (!glyph) continue;
      const transform = matrix(state.ctm, matrix(state.tm, [state.size * state.hScale,0,0,state.size,0,state.rise]));
      items.push({ str: glyph.unicode, charCode: glyph.originalCharCode, fontChar: glyph.fontChar, fontName: state.fontName, transform, width: Math.hypot(transform[0], transform[1]) * glyph.width / 1000 });
      const advance = (glyph.width * state.size / 1000 + state.charSpace + (glyph.isSpace ? state.wordSpace : 0)) * state.hScale;
      state.tm = matrix(state.tm, [1,0,0,1,advance,0]);
    }
  };
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i], args = operators.argsArray[i];
    switch (op) {
      case OPS.save: stack.push(structuredClone(state)); break;
      case OPS.restore: if (stack.length) state = stack.pop(); break;
      case OPS.transform: state.ctm = matrix(state.ctm, args.length === 1 ? args[0] : args); break;
      case OPS.paintFormXObjectBegin: stack.push(structuredClone(state)); if (args[0]) state.ctm = matrix(state.ctm, args[0]); break;
      case OPS.paintFormXObjectEnd: if (stack.length) state = stack.pop(); break;
      case OPS.beginText: state.tm = identity(); state.line = identity(); break;
      case OPS.setFont: [state.fontName, state.size] = args; break;
      case OPS.setTextMatrix: state.tm = Array.from(args.length === 1 ? args[0] : args); state.line = [...state.tm]; break;
      case OPS.moveText: move(...args); break;
      case OPS.setLeadingMoveText: state.leading = -args[1]; move(...args); break;
      case OPS.setLeading: state.leading = args[0]; break;
      case OPS.setHScale: state.hScale = args[0] / 100; break;
      case OPS.setCharSpacing: state.charSpace = args[0]; break;
      case OPS.setWordSpacing: state.wordSpace = args[0]; break;
      case OPS.setTextRise: state.rise = args[0]; break;
      case OPS.nextLine: move(0, -state.leading); break;
      case OPS.showText: case OPS.showSpacedText: show(args[0]); break;
      case OPS.nextLineShowText: move(0, -state.leading); show(args[0]); break;
      case OPS.nextLineSetSpacingShowText: state.wordSpace = args[0]; state.charSpace = args[1]; move(0, -state.leading); show(args[2]); break;
    }
  }
  return items;
}
