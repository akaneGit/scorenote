import fs from 'node:fs/promises';
// An explicit allowlist keeps user scores and local regression fixtures out.
const files=['README.md','COPYRIGHT.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','build.mjs','prepare-release.mjs','.gitignore','src/app.js','src/music.js','src/recognition.js','src/index.html','src/style.css','tests/automatic.test.mjs','tests/automatic-browser.mjs','.github/ISSUE_TEMPLATE/bug_report.md','.github/workflows/pages.yml','assets/ZenKakuGothicNew-Regular.ttf','assets/OFL-ZenKakuGothicNew.txt'];
for(const file of await fs.readdir('licenses'))if(file!=='@pdf-lib-fontkit-README.md')files.push('licenses/'+file);
const path=await import('node:path');const target='release/source';
const releaseRoot=path.resolve('release');
const sourceRoot=path.resolve(target);
if(path.dirname(sourceRoot)!==releaseRoot)throw new Error('Invalid release source directory');
await fs.rm(sourceRoot,{recursive:true,force:true});
for(const file of files){const dest=path.join(target,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(file,dest);}
await fs.copyFile('ScoreNote.html',path.join(releaseRoot,'ScoreNote.html'));
console.log('Source-only publication staging: '+target+' ('+files.length+' files). No user PDFs or generated outputs.');
