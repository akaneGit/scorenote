import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { extractGlyphItems, noteLabel, pitchName } from './music.js';

import { extractGeometry, detectScore, chooseDefaults, layoutLabels, assertAutomaticScore } from './recognition.js';

const $ = id => document.getElementById(id);
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const assets = window.SCORE_ASSETS;
const workerURL = URL.createObjectURL(new Blob([decode(assets.worker)], { type: 'text/javascript' }));
pdfjs.GlobalWorkerOptions.workerSrc = workerURL;
const fontBytes = decode(assets.font);
const fontReady = new FontFace('ScoreJP', fontBytes).load().then(font => document.fonts.add(font));
let state = {pdf:null,pages:[],settings:{size:7.5,color:'#b34536',octave:false,key:'auto',offset:6.5,scope:'all'}};
let busy=false, blocked=true;
const say=(text,error=false)=>{ $('status').textContent=text; $('status').classList.toggle('error',error); };
const noteVisible=n=>!['treble','bass'].includes(state.settings.scope)||n.clef===state.settings.scope;
const countNotes=()=>state.pages.reduce((n,p)=>n+p.notes.filter(noteVisible).length,0);
function updateControls(){ $('export').disabled=busy||blocked||!state.pdf||!countNotes(); $('count').textContent=state.pdf?state.pages.length+'ページ · '+countNotes()+'音':'PDFを選んでスタート'; }
async function run(task){if(busy)return;busy=true;document.body.classList.add('busy');updateControls();try{await task();}catch(e){console.error(e);say(e.message||'処理できませんでした。',true);}finally{busy=false;document.body.classList.remove('busy');updateControls();}}
function syncSettings(){ $('font-size').value=state.settings.size;$('size-value').textContent=state.settings.size+' pt';$('scope').value=state.settings.scope;$('octave').checked=state.settings.octave;document.querySelectorAll('.swatch').forEach(e=>{e.classList.toggle('active',e.dataset.color===state.settings.color);e.setAttribute('aria-pressed',String(e.dataset.color===state.settings.color));}); }
function arrange(){let errors=0;for(const p of state.pages)errors+=layoutLabels(p,state.settings,p.canvas);blocked=errors>0;say(blocked?'音名を重ならずに自動配置できませんでした。文字サイズを小さくしてください。':countNotes()+'音を自動判定しました。固定ドで表示しています。',blocked);renderAnnotations();}
async function parsePDF(bytes, name) {
  if (bytes.length > 50 * 1024 * 1024) throw new Error('50MB以下のPDFを選んでください。');
  try { await PDFDocument.load(bytes); } catch(error) { throw new Error('PDFを読み込めません。破損したPDFや暗号化PDFは対象外です。'); }
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, fontExtraProperties: true, useSystemFonts: true }).promise;
  const pages = [];
  try {
    if (pdf.numPages > 50) throw new Error('このツールでは50ページ以内のPDFを扱えます。');
    for (let i = 1; i <= pdf.numPages; i++) {
      say(`楽譜を読み取っています… ${i} / ${pdf.numPages} ページ`);
      const page = await pdf.getPage(i), viewport = page.getViewport({ scale: 1 });
      const operators = await page.getOperatorList();
      const content = { items: extractGlyphItems(operators, pdfjs.OPS) };
      const fontNames = {};
      for (const item of content.items) {
        if (item.fontName && !fontNames[item.fontName]) {
          try { const font = page.commonObjs.get(item.fontName); fontNames[item.fontName] = { name: font?.name || '', differences: font?.differences, defaultEncoding: font?.defaultEncoding }; } catch { fontNames[item.fontName] = ''; }
        }
      }
      const paths = extractGeometry(operators, pdfjs.OPS, viewport);
      const detected = detectScore(content.items, fontNames, viewport, paths);
      assertAutomaticScore(detected, i);
      pages.push({ page, viewport, width: viewport.width, height: viewport.height, staves: structuredClone(detected.staves), notes: structuredClone(detected.notes), detected, content, fontNames });
    }
    return { pdf, bytes, name, pages, settings: chooseDefaults({ staves: pages.flatMap(p=>p.staves) }) };
  } catch (error) { await pdf.loadingTask.destroy(); throw error; }
}

async function openPDF(bytes,name){
 blocked=true; const previous=state.pdf;state.pdf=null;state.pages=[];$('pages').replaceChildren();$('file-info').hidden=true;$('document-title').textContent='楽譜を読み取り中';updateControls();
 if(previous)await previous.loadingTask.destroy();
 try{state=await parsePDF(bytes,name);syncSettings();await renderPages();arrange();$('file-name').textContent=name;$('file-detail').textContent=state.pages.length+'ページ';$('file-info').hidden=false;$('document-title').textContent=name;}
 catch(e){blocked=true;if(state.pdf)await state.pdf.loadingTask.destroy();state.pdf=null;state.pages=[];$('pages').replaceChildren();$('document-title').textContent='自動判定できませんでした';throw e;}
}
function displayScale(page) {
  const value = $('zoom').value;
  return value === 'fit' ? Math.min(2.6, Math.max(.25, ($('pages').clientWidth - 28) / page.width)) : Number(value);
}

async function renderPages() {
  $('pages').replaceChildren(); await fontReady;
  for (const [index, info] of state.pages.entries()) {
    const wrap = document.createElement('div'); wrap.className = 'page-wrap';
    const heading = document.createElement('div'); heading.className = 'page-heading'; heading.textContent = `PAGE ${String(index + 1).padStart(2, '0')}`;
    const el = document.createElement('div'); el.className = 'score-page'; el.dataset.page = index;
    const canvas = document.createElement('canvas');
    const scale = Math.min(3, Math.sqrt(10_000_000 / (info.width * info.height)));
    const viewport = info.page.getViewport({ scale }); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const layer = document.createElement('div'); layer.className = 'annotations';
    el.append(canvas, layer); wrap.append(heading, el); $('pages').append(wrap); info.element = el; info.layer = layer; info.canvas = canvas;
    await info.page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }

  resizePages();
}

function resizePages() {
  state.pages.forEach(page => { if (!page.element) return; const scale = displayScale(page); page.element.style.width = `${page.width * scale}px`; page.element.style.height = `${page.height * scale}px`; });
  renderAnnotations();
}

function renderAnnotations(){for(const p of state.pages){if(!p.layer)continue;p.layer.replaceChildren();if(blocked)continue;const scale=displayScale(p);for(const n of p.notes.filter(noteVisible)){const e=document.createElement('span');e.className='note';e.textContent=noteLabel(n,'auto',state.settings.octave);e.style.left=n.x*scale+'px';e.style.top=n.y*scale+'px';e.style.fontSize=(n.grace?state.settings.size*.85:state.settings.size)*scale+'px';e.style.color=state.settings.color;e.title=pitchName(n,'auto');p.layer.append(e);}}updateControls();}
async function createPDF() {
  if(blocked||!state.pdf||!countNotes())throw new Error('自動判定と配置が完了した楽譜だけを保存できます。');
  const doc = await PDFDocument.load(state.bytes); doc.registerFontkit(fontkit);
  // Full embedding avoids missing CJK glyph outlines in fontkit subsets.
  const font = await doc.embedFont(fontBytes, { subset: false });
  const hex = state.settings.color.slice(1), color = rgb(...[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255));
  for (const [i, info] of state.pages.entries()) {
    const page = doc.getPage(i);
    for (const note of info.notes.filter(noteVisible)) {
      const size = note.grace ? state.settings.size * .85 : state.settings.size;
      const label = noteLabel(note, state.settings.key, state.settings.octave), width = font.widthOfTextAtSize(label, size);
      const [x, y] = info.viewport.convertToPdfPoint(note.x - width / 2, note.y);
      page.drawText(label, { x, y, size, font, color, rotate: degrees(info.viewport.rotation) });
    }
  }
  return doc.save();
}

function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function fromFile(file) {
  if (!file) return;
  await openPDF(new Uint8Array(await file.arrayBuffer()), file.name);
}
$('export').addEventListener('click',()=>run(async()=>{
  const bytes=await createPDF();
  download(bytes,state.name.replace(/\.pdf$/i,'')+'_ドレミ付き.pdf','application/pdf');
  say('PDFをダウンロードしました。');
}));
$('file-input').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; run(() => fromFile(file)); });
$('drop-zone').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); $('file-input').click(); } });
$('drop-zone').addEventListener('dragover', event => { event.preventDefault(); $('drop-zone').classList.add('dragover'); });
$('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('dragover'));
$('drop-zone').addEventListener('drop', event => { event.preventDefault(); $('drop-zone').classList.remove('dragover'); run(() => fromFile(event.dataTransfer.files[0])); });
$('zoom').addEventListener('change',resizePages);
new ResizeObserver(()=>{if(!busy)resizePages();}).observe($('pages'));
for(const [id,key] of [['font-size','size'],['octave','octave'],['scope','scope']])$(id).addEventListener('input',()=>{if(busy)return;state.settings[key]=key==='size'?Number($(id).value):key==='octave'?$(id).checked:$(id).value;syncSettings();if(state.pdf)arrange();});
document.querySelectorAll('.swatch').forEach(e=>e.addEventListener('click',()=>{if(busy)return;state.settings.color=e.dataset.color;syncSettings();renderAnnotations();}));
window.doremi={ready:()=>!busy,createPDF,inspect:()=>({blocked,name:state.name,settings:{...state.settings},pages:state.pages.map(p=>({staves:structuredClone(p.staves),notes:p.notes.map(n=>({...n,label:noteLabel(n,'auto',state.settings.octave),pitchName:pitchName(n,'auto')}))}))})};
syncSettings();updateControls();
