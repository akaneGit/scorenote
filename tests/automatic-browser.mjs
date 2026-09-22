import {chromium} from 'playwright-core';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'),headless:true});
try{
 const page=await browser.newPage({offline:!process.env.SCORENOTE_URL});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SCORENOTE_URL||pathToFileURL(path.resolve('ScoreNote.html')).href);
 await page.waitForFunction(()=>window.doremi?.ready());
 await page.context().setOffline(true);
 assert.equal(await page.locator('#allow-overlap').count(),0);
 assert.equal(await page.locator('#chord-layout').inputValue(),'horizontal');
 assert.equal(await page.locator('#tool-staff,#tool-add,#key,#inspector,#sample,#save-project').count(),0);
 assert.equal(await page.locator('#export').isDisabled(),true);
 const open=async(buffer,name)=>{await page.locator('#file-input').setInputFiles({name,mimeType:'application/pdf',buffer});await page.waitForFunction(()=>window.doremi.ready());};
 const blank=await PDFDocument.create();blank.addPage();const blankBytes=Buffer.from(await blank.save());
 // Optional private local regressions. The PDFs are not part of the repository.
 for(const file of process.argv.slice(2)){
  const buffer=await fs.readFile(file);await open(buffer,path.basename(file));
  assert.equal(await page.locator('#export').isDisabled(),false,await page.locator('#status').innerText());
  const info=await page.evaluate(()=>window.doremi.inspect());assert.ok(info.pages.every(p=>p.notes.length>0));console.log(path.basename(file),info.pages.reduce((n,p)=>n+p.notes.length,0),'notes');
  await page.locator('#chord-layout').selectOption('vertical');
  const vertical=await page.evaluate(()=>window.doremi.inspect());
  for(const p of vertical.pages){
   const chords=p.notes.filter(n=>n.chord);
   for(const n of chords){
    const partners=chords.filter(m=>m.id!==n.id&&m.staffId===n.staffId&&Math.abs(m.x-n.x)<.01);
    assert.ok(partners.length>0,'chord tones must share the same x position');
    for(const m of partners)if(n.pitch>m.pitch)assert.ok(n.y<m.y,'higher chord tones must be above lower tones');
   }
  }
  await page.locator('#font-size').fill('16');
  await page.locator('#octave').check();
  assert.equal(await page.locator('#export').isDisabled(),false,'overlaps must not prevent saving');
  assert.ok(await page.locator('.note').count()>0);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
  assert.equal(await download.failure(),null);
  assert.equal(download.suggestedFilename(),path.basename(file).replace(/\.pdf$/i,'')+'_ドレミ付き.pdf');
  const saved=await fs.readFile(await download.path());
  const exported=await PDFDocument.load(saved);
  assert.equal(exported.getPageCount(),info.pages.length);
  assert.ok(saved.length>buffer.length);
  await page.waitForFunction(()=>window.doremi.ready());
  await page.locator('#chord-layout').selectOption('horizontal');
  const horizontal=await page.evaluate(()=>window.doremi.inspect());
  for(const p of horizontal.pages)for(const staff of p.staves){
   const notes=p.notes.filter(n=>n.staffId===staff.id);
   assert.ok(new Set(notes.map(n=>n.y)).size<=1,'horizontal labels must share a baseline');
  }
  const mixed=await PDFDocument.load(buffer);mixed.addPage();await open(Buffer.from(await mixed.save()),'mixed.pdf');
  assert.equal(await page.locator('#export').isDisabled(),true);assert.equal(await page.locator('.note').count(),0);
  await open(buffer,'recovery.pdf');assert.equal(await page.locator('#export').isDisabled(),false);
 }
 for(const [bytes,name] of [[blankBytes,'blank.pdf'],[Buffer.from('invalid'),'broken.pdf']]){
  await open(bytes,name);assert.equal(await page.locator('#export').isDisabled(),true);assert.equal(await page.locator('.note').count(),0);
  assert.ok(await page.evaluate(async()=>{try{await window.doremi.createPDF();return false;}catch{return true;}}));
  assert.ok((await page.locator('#status').getAttribute('class')).includes('error'));
 }
 assert.deepEqual(errors,[]);console.log('Offline browser checks passed');
}finally{await browser.close();}
