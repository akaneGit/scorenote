import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const licenses = [['pdfjs-dist','LICENSE'], ['pdf-lib','LICENSE.md']];
await fs.mkdir('licenses', { recursive: true });
for (const [pkg, file] of licenses) {
  await fs.copyFile(path.join('node_modules', pkg, file), path.join('licenses', pkg.replaceAll('/', '-') + '-' + file));
}

await fs.mkdir('dist', { recursive: true });
const worker = await fs.readFile('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'utf8');
const font = await fs.readFile('assets/ZenKakuGothicNew-Regular.ttf');
const bundle = await build({ entryPoints: ['src/app.js'], bundle: true, minify: false, write: false, format: 'iife', target: 'chrome120', define: { 'process.env.NODE_ENV': '"production"' } });
await fs.writeFile('dist/app.js', bundle.outputFiles[0].text);
const css = await fs.readFile('src/style.css', 'utf8');
const icon = 'data:image/png;base64,' + (await fs.readFile('assets/scorenote-icon.png')).toString('base64');
const template = (await fs.readFile('src/index.html', 'utf8')).replaceAll('__SCORENOTE_ICON__', icon);
const data = `window.SCORE_ASSETS=${JSON.stringify({worker: Buffer.from(worker).toString('base64'), font: font.toString('base64')})};`;
const noticeFiles=['THIRD_PARTY_NOTICES.md','assets/OFL-ZenKakuGothicNew.txt',...(await fs.readdir('licenses')).filter(f=>f!=='@pdf-lib-fontkit-README.md').sort().map(f=>'licenses/'+f)];
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const notices=(await Promise.all(noticeFiles.map(async f=>f+'\n'+await fs.readFile(f,'utf8')))).join('\n\n');
const license=await fs.readFile('LICENSE','utf8');
const licensedTemplate=template.replace('</footer>','</footer><details style="margin:16px"><summary>このアプリのライセンス</summary><pre style="white-space:pre-wrap">'+escape(license)+'</pre></details><details style="margin:16px"><summary>使用ライブラリ・フォントのライセンス</summary><pre style="white-space:pre-wrap">'+escape(notices)+'</pre></details>');
const html = licensedTemplate.replace('<!-- STYLES -->', `<style>${css}</style>`).replace('<!-- SCRIPTS -->', () => `<script>${data}</script><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
await fs.writeFile('ScoreNote.html', html);
console.log(`Built ScoreNote.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);

