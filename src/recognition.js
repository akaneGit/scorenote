
import { extractGlyphItems, detectKousaku, pitchAt, nearestStaff, noteLabel } from './music.js';

const mul = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point = (m,x,y) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const uniq = (values, tolerance = .65) => values.sort((a,b)=>a-b).filter((n,i,a)=>!i || n-a[i-1]>tolerance);
const mod = n => ((n%7)+7)%7;

export function extractGeometry(ops, OPS, viewport) {
  let ctm=[1,0,0,1,0,0], width=1;
  const stack=[], paths=[];
  for(let i=0;i<ops.fnArray.length;i++){
    const op=ops.fnArray[i], a=ops.argsArray[i];
    if(op===OPS.save || op===OPS.paintFormXObjectBegin) { stack.push({ctm:[...ctm],width}); if(op===OPS.paintFormXObjectBegin && a[0]) ctm=mul(ctm,a[0]); }
    else if(op===OPS.restore || op===OPS.paintFormXObjectEnd) { const previous=stack.pop(); if(previous) ({ctm,width}=previous); }
    else if(op===OPS.transform) ctm=mul(ctm,a.length===1?a[0]:a);
    else if(op===OPS.setLineWidth) width=a[0];
    else if(op===OPS.constructPath && a[2]?.length===4) {
      const b=a[2], points=[[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]].map(([x,y])=>viewport.convertToViewportPoint(...point(ctm,x,y)));
      const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
      paths.push({x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys),lineWidth:width*Math.hypot(ctm[0],ctm[1])});
    }
  }
  return paths;
}

export function findStaves(paths, pageWidth) {
  const lines=paths.filter(p=>p.x1-p.x0>Math.max(70,pageWidth*.15) && p.y1-p.y0<.65);
  const groups=[];
  for(const line of lines){
    let group=groups.find(g=>Math.abs(g.x0-line.x0)<2 && Math.abs(g.x1-line.x1)<2);
    if(!group) {group={x0:line.x0,x1:line.x1,ys:[]};groups.push(group);}
    group.ys.push((line.y0+line.y1)/2);
  }
  const staves=[];
  for(const group of groups){
    const ys=uniq(group.ys,.65);
    for(let i=0;i+4<ys.length;i++){
      const spacing=(ys[i+4]-ys[i])/4;
      if(spacing<2 || spacing>20 || ![1,2,3].every(j=>Math.abs(ys[i+j]-ys[i]-spacing*j)<.35)) continue;
      staves.push({x:group.x0,right:group.x1,top:ys[i],bottom:ys[i+4],spacing,clef:'unknown',bottomPitch:30,key:0,clefChanges:[]});
      i+=4;
    }
  }
  staves.sort((a,b)=>a.top-b.top || a.x-b.x);
  staves.forEach((s,i)=>{s.id=i;s.bars=uniq(paths.filter(p=>p.x1-p.x0<Math.max(2,s.spacing*.45) && p.x0>=s.x-1 && p.x0<=s.right+1 && p.y0<=s.top+s.spacing*.25 && p.y1>=s.bottom-s.spacing*.25 && staves.some(t=>Math.abs(t.top-p.y0)<s.spacing*.15) && staves.some(t=>Math.abs(t.bottom-p.y1)<s.spacing*.15)).map(p=>(p.x0+p.x1)/2),1.3);});
  return staves;
}

const namedSymbols = {
  'clefs.G':['clef','treble',32], 'clefs.F':['clef','bass',24], 'clefs.C':['clef','alto',28],
  gClef:['clef','treble',32], fClef:['clef','bass',24], cClef:['clef','alto',28],
  gClef8vb:['clef','treble',25],gClef8va:['clef','treble',39],fClef8vb:['clef','bass',17],
  'accidentals.sharp':['accidental',1], 'accidentals.flat':['accidental',-1], 'accidentals.natural':['accidental',0],
  'accidentals.doublesharp':['accidental',2], 'accidentals.flatflat':['accidental',-2],
  accidentalSharp:['accidental',1], accidentalFlat:['accidental',-1], accidentalNatural:['accidental',0],
  accidentalDoubleSharp:['accidental',2],accidentalDoubleFlat:['accidental',-2]
};
const smufl = {
  0xE050:'gClef',0xE062:'fClef',0xE05C:'cClef',0xE053:'gClef8va',0xE052:'gClef8vb',0xE064:'fClef8vb',0xE07A:'gClef',0xE07B:'cClef',0xE07C:'fClef',
  0xE0A0:'noteheadDoubleWhole',0xE0A1:'noteheadDoubleWholeSquare',0xE0A2:'noteheadWhole',0xE0A3:'noteheadHalf',0xE0A4:'noteheadBlack',
  0xE260:'accidentalFlat',0xE261:'accidentalNatural',0xE262:'accidentalSharp',0xE263:'accidentalDoubleSharp',0xE264:'accidentalDoubleFlat'
};

export function symbolName(item, fonts) {
  const font=fonts[item.fontName], family=typeof font==='string'?font:font?.name || '';
  const named=font?.differences?.[item.charCode] || font?.defaultEncoding?.[item.charCode] || '';
  if(/^(noteheads\.|clefs\.|accidentals\.|notehead|[gfc]Clef|accidental)/.test(named)) return named.replace(/_change$|Change$/,'');
  if(/Kousaku/i.test(family)) return ({'Ï':'noteheadBlack','ú':'noteheadHalf','&':'gClef'})[item.str] || '';
  // Private-use code points are meaningful only in a music font.
  if(/Bravura|Leland|Petaluma|Gonville|MuseJazz|MScore|MuseScore|Maestro|Finale|November|Sebastian|SMuFL/i.test(family)){
    const code=/^uni([A-Fa-f0-9]{4})/.exec(named);
    return smufl[code?parseInt(code[1],16):item.str?.codePointAt(0)] || '';
  }
  return '';
}

export function detectScore(items, fonts, viewport, paths=[]) {
  const warnings=[];
  if(viewport.rotation!==0) return {staves:[],notes:[],warnings:['回転ページの自動判定は未対応です。'],profile:'unsupported'};
  let staves=findStaves(paths,viewport.width);
  if(!staves.length){
    const fallback=detectKousaku(items,Object.fromEntries(Object.entries(fonts).map(([id,f])=>[id,typeof f==='string'?f:f.name])),viewport);
    staves=fallback.staves.map(s=>({...s,right:viewport.width-10,clef:'treble',bottomPitch:30,key:0,bars:[],clefChanges:[]}));
  }
  const symbols=[];
  for(const item of items) {
    const name=symbolName(item,fonts);
    let spec=namedSymbols[name];
    if(/^noteheads\.[su]?[012]$/.test(name) || /^notehead(Black|Half|Whole|DoubleWhole|DoubleWholeSquare)$/.test(name)) spec=['note'];
    if(!spec || !item.transform.every(Number.isFinite)) continue;
    const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
    const staff=nearestStaff(y,staves.filter(s=>x>=s.x-s.spacing*3 && x<=s.right+s.spacing*2));
    if(!staff || Math.abs(y-(staff.top+staff.bottom)/2)>staff.spacing*12) continue;
    symbols.push({kind:spec[0],value:spec[1],reference:spec[2],name,x,y,width:item.width,size:Math.hypot(item.transform[2],item.transform[3]),staffId:staff.id});
  }
  for(const staff of staves){
    const clefs=symbols.filter(s=>s.kind==='clef' && s.staffId===staff.id).sort((a,b)=>a.x-b.x);
    for(const clef of clefs){
      const bottomPitch=clef.reference-Math.round((staff.bottom-clef.y)/(staff.spacing/2));
      staff.clefChanges.push({x:clef.x,clef:clef.value,bottomPitch,width:clef.width});
    }
    if(clefs.length) Object.assign(staff,{clef:clefs[0].value,bottomPitch:staff.clefChanges[0].bottomPitch});
    else if(staff.clef==='unknown') warnings.push('音部記号を確定できない五線があります。');
  }
  const notes=[];
  for(const s of symbols.filter(s=>s.kind==='note')){
    const staff=staves[s.staffId];
    if(staff.clef==='unknown') continue;
    const current=staff.clefChanges.filter(c=>c.x<=s.x).at(-1) || staff;
    const pitch=pitchAt(s.y,{...staff,bottomPitch:current.bottomPitch});
    notes.push({id:'auto-'+notes.length,x:s.x+s.width/2,y:staff.bottom+staff.spacing*3,noteX:s.x+s.width/2,noteY:s.y,noteLeft:s.x,pitch,accidental:null,staffId:staff.id,source:'auto',clef:current.clef,keySignature:0,measureAccidental:null,grace:s.size<staff.spacing*3.35,width:s.width,confidence:'high'});
  }
  notes.sort((a,b)=>a.staffId-b.staffId || a.noteX-b.noteX || b.pitch-a.pitch);
  for(const staff of staves){
    const staffNotes=notes.filter(n=>n.staffId===staff.id), accidentals=symbols.filter(s=>s.staffId===staff.id && s.kind==='accidental').sort((a,b)=>a.x-b.x);
    if(!staffNotes.length) continue;
    const first=staffNotes[0], clef=staff.clefChanges[0];
    const keySymbols=accidentals.filter(a=>a.x+a.width<first.noteLeft-staff.spacing*1.1 && (!clef || a.x>clef.x+clef.width*.6));
    const keyOrderSharp=[3,0,4,1,5,2,6],keyOrderFlat=[6,2,5,1,4,0,3];
    let key=0;
    for(const a of keySymbols){
      const letter=mod(pitchAt(a.y,staff)), order=a.value===1?keyOrderSharp:keyOrderFlat;
      if((a.value!==1 && a.value!==-1) || (key && Math.sign(key)!==a.value) || letter!==order[Math.abs(key)]) break;
      key+=a.value;a.isKey=true;
    }
    staff.key=key;
    const assigned=new Map();
    for(const a of accidentals.filter(a=>!a.isKey)){
      const accidentalPitch=pitchAt(a.y,staff);
      const target=staffNotes.filter(n=>n.pitch===accidentalPitch && n.noteLeft>=a.x+a.width*.55 && n.noteLeft-a.x<staff.spacing*7).sort((n1,n2)=>n1.noteLeft-n2.noteLeft)[0];
      if(target) assigned.set(target.id,a.value);
      else warnings.push('対応する音符を確定できない臨時記号があります。');
    }
    let measure=-1, active=new Map();
    for(const note of staffNotes){
      const currentMeasure=staff.bars.filter(x=>x<note.noteLeft-staff.spacing*.25).length;
      if(currentMeasure!==measure){active=new Map();measure=currentMeasure;}
      if(assigned.has(note.id)) {active.set(note.pitch,assigned.get(note.id));note.explicitAccidental=assigned.get(note.id);}
      note.keySignature=key;note.measureAccidental=active.has(note.pitch)?active.get(note.pitch):null;note.measure=measure;
    }
  }
  return {staves,notes,warnings:[...new Set(warnings)],profile:notes.length?'vector':'unsupported',symbols};
}

export function chooseDefaults(detected) {
  const piano=detected.staves.some(s=>s.clef==='bass');
  return {size:piano?6:7.5,offset:piano?2.5:6.5,color:'#b34536',octave:false,key:'auto',scope:'all',autoLayout:true};
}

// Collision-free labels use a few rows in the free space after each staff.
// Existing PDF ink is checked from the rendered canvas; uncertain placements are reported.
export function layoutLabels(info, settings, canvas) {
  const scaleX=canvas.width/info.width,scaleY=canvas.height/info.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}), data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const stride=canvas.width+1, integral=new Uint32Array((canvas.width+1)*(canvas.height+1));
  for(let y=0;y<canvas.height;y++){let row=0;for(let x=0;x<canvas.width;x++){const k=(y*canvas.width+x)*4;row+=(data[k]+data[k+1]+data[k+2]<630 && data[k+3]>100)?1:0;integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}}
  const ink=rect=>{
    const x0=Math.max(0,Math.floor(rect.x0*scaleX)),x1=Math.min(canvas.width,Math.ceil(rect.x1*scaleX));
    const y0=Math.max(0,Math.floor(rect.y0*scaleY)),y1=Math.min(canvas.height,Math.ceil(rect.y1*scaleY));
    return integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0];
  };
  const overlap=(a,b)=>a.x0<b.x1+.8 && a.x1>b.x0-.8 && a.y0<b.y1+.8 && a.y1>b.y0-.8;
  const placed=[];
  let uncertain=0;
  for(const staff of info.staves){
    const next=info.staves.filter(s=>s.top>staff.bottom && Math.min(s.right,staff.right)>Math.max(s.x,staff.x)).sort((a,b)=>a.top-b.top)[0];
    const end=next?next.top-staff.spacing*.7:Math.min(info.height-12,staff.bottom+staff.spacing*10);
    const staffNotes=info.notes.filter(n=>n.staffId===staff.id).sort((a,b)=>a.noteX-b.noteX || b.pitch-a.pitch);
    // Keep labels in their own staff gap, including scores with two treble staves.
    const lower=staff.bottom+settings.size*.96+1;
    const upper=end-settings.size*.16;
    let base=Math.max(settings.size,Math.min(info.height-settings.size*.16-2,
      Math.max(lower,Math.min(upper,staff.bottom+staff.spacing*Math.min(settings.offset,2.5)))));
    // Simultaneous chord tones are grouped horizontally, high pitch to low pitch.
    const anchors=new Map();
    for(let i=0;i<staffNotes.length;){
      let j=i+1;while(j<staffNotes.length && Math.abs(staffNotes[j].noteX-staffNotes[i].noteX)<staff.spacing*.35) j++;
      const chord=staffNotes.slice(i,j).sort((a,b)=>b.pitch-a.pitch);
      if(chord.length>1){
        const widths=chord.map(n=>{ctx.font=settings.size*scaleX+'px ScoreJP';return ctx.measureText(noteLabel(n,settings.key,settings.octave)).width/scaleX;});
        let x=chord.reduce((sum,n)=>sum+n.noteX,0)/chord.length-(widths.reduce((a,b)=>a+b,0)+(chord.length-1)*2.2)/2;
        chord.forEach((n,k)=>{anchors.set(n.id,x+widths[k]/2);x+=widths[k]+2.2;n.chord=true;});
      }
      i=j;
    }
    if(settings.allowOverlap && upper>=lower){
      // Move the whole row together to avoid ledger notes and printed markings.
      const rows=[base];
      for(let y=lower;y<=upper;y+=1.8)rows.push(y);
      const preferred=base;
      const rowCost=y=>staffNotes.reduce((sum,n)=>{
        if(['treble','bass'].includes(settings.scope)&&n.clef!==settings.scope)return sum;
        const size=n.grace?settings.size*.85:settings.size;
        ctx.font=size*scaleX+'px ScoreJP';
        const width=ctx.measureText(noteLabel(n,settings.key,settings.octave)).width/scaleX;
        const x=Math.max(width/2+2,Math.min(info.width-width/2-2,anchors.get(n.id)??n.noteX));
        return sum+ink({x0:x-width/2-.3,x1:x+width/2+.3,y0:y-size*.96,y1:y+size*.16})*100;
      },Math.abs(y-preferred));
      base=rows.map(y=>({y,cost:rowCost(y)})).sort((a,b)=>a.cost-b.cost)[0].y;
    }
    for(const note of staffNotes){
      if(['treble','bass'].includes(settings.scope) && (note.clef || 'treble')!==settings.scope) continue;
      const size=note.grace?settings.size*.85:settings.size,label=noteLabel(note,settings.key,settings.octave);
      ctx.font=size*scaleX+'px ScoreJP';
      const width=ctx.measureText(label).width/scaleX;
      const candidates=[],anchor=anchors.get(note.id) ?? note.noteX;
      const offsets=settings.allowOverlap?[0]:[0,-1.8,1.8,-3.6,3.6,-5.4,5.4,7.2,9,10.8,12.6,14.4,16.2,18,20,22,24,28,32,36,40];
      for(const dy of offsets){
        const y=base+dy;
        if(y+1>end) continue;
        for(const dx of (settings.allowOverlap?[0]:[0,-staff.spacing*.55,staff.spacing*.55,-staff.spacing,staff.spacing,-staff.spacing*1.5,staff.spacing*1.5])){
          const x=Math.max(width/2+2,Math.min(info.width-width/2-2,anchor+dx)),rect={x0:x-width/2-.3,x1:x+width/2+.3,y0:y-size*.96,y1:y+size*.16};
          if(rect.y0<staff.bottom+1) continue;
          const collisions=placed.filter(p=>overlap(p,rect)).length;
          candidates.push({x,y,rect,cost:collisions*1e6+ink(rect)*100+Math.abs(dy)*.6+Math.abs(dx)});
        }
      }
      if(!candidates.length) { note.x=Math.max(width/2+2,Math.min(info.width-width/2-2,anchor)); note.y=Math.max(size,Math.min(info.height-2,base)); note.layoutWarning=true; uncertain++; continue; }
      candidates.sort((a,b)=>a.cost-b.cost);const best=candidates[0];
      note.x=best.x;note.y=best.y;note.layoutWarning=best.cost>=100;
      if(note.layoutWarning) uncertain++;
      placed.push(best.rect);
    }
  }
  return uncertain;
}

export function assertAutomaticScore(d,page=1){
 const prefix=page+'ページ目を自動判定できませんでした。';
 if(d.warnings?.length)throw new Error(prefix+d.warnings.join(' '));
 if(!d.notes?.length||!d.staves?.length)throw new Error(prefix+'音符と五線を読み取れません。画像のみのPDFや未対応の形式は扱えません。');
 if(d.staves.some(s=>s.clef==='unknown')||d.notes.some(n=>!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>69||!Number.isFinite(n.noteX)||!Number.isFinite(n.noteY)))throw new Error(prefix+'音部記号または音の高さを確定できません。');
}
