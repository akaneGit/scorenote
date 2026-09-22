import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pitchAt, keyAccidental, noteLabel, extractGlyphItems, detectKousaku } from '../src/music.js';

test('treble staff lines, spaces, and ledger notes', () => {
  const staff = { bottom: 100, spacing: 10 };
  assert.equal(pitchAt(100, staff), 30); // E4
  assert.equal(pitchAt(60, staff), 38); // F5
  assert.equal(pitchAt(110, staff), 28); // C4, ledger below
  assert.equal(pitchAt(35, staff), 43); // D6, above
});

test('key signatures, naturals, double accidentals, and octaves', () => {
  assert.equal(keyAccidental(38, 1), 1);
  assert.equal(keyAccidental(35, 1), 0);
  assert.equal(keyAccidental(41, -1), -1);
  assert.equal(noteLabel({ pitch: 41, accidental: null }, -1, true), 'シ♭5');
  assert.equal(noteLabel({ pitch: 41, accidental: 0 }, -1), 'シ');
  assert.equal(noteLabel({ pitch: 35, accidental: 2 }, 0), 'ド♯♯');
  assert.equal(noteLabel({ pitch: 35, accidental: -2 }, 0), 'ド♭♭');
  assert.equal(noteLabel({ pitch: 42, accidental: null }, 0, true), 'ド6');
});

test('operator extraction keeps nearby notes at different heights separate', () => {
  const operators = {
    fnArray: [OPS.transform, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.setTextMatrix, OPS.showText],
    argsArray: [[.75,0,0,.75,0,0],null,['f',20],[1,0,0,1,100,100],[[{unicode:'Ï',width:316}]],[1,0,0,1,110,104],[[{unicode:'Ï',width:316}]]]
  };
  const items = extractGlyphItems(operators, OPS);
  assert.equal(items.length, 2);
  assert.equal(items[0].transform[4], 75);
  assert.equal(items[1].transform[5], 78);
});


import {assertAutomaticScore} from '../src/recognition.js';
test('automatic mode refuses missing, uncertain or invalid recognition',()=>{
 const good={staves:[{clef:'treble'}],notes:[{pitch:30,noteX:10,noteY:20}],warnings:[]};
 assert.doesNotThrow(()=>assertAutomaticScore(good));
 for(const bad of [{...good,notes:[]},{...good,staves:[]},{...good,warnings:['unknown symbol']},{...good,staves:[{clef:'unknown'}]},{...good,notes:[{pitch:NaN,noteX:10,noteY:20}]}])assert.throws(()=>assertAutomaticScore(bad,2),/2ページ目/);
});
