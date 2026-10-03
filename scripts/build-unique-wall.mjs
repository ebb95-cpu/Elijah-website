import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const [ffmpeg,source]=process.argv.slice(2);
const root=new URL('../',import.meta.url).pathname;
const file=root+'videos/background/manifest.json';
const m=JSON.parse(readFileSync(file));
function run(args){const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});if(r.status!==0)throw Error('Encoding failed');}
for(const [i,start] of [90,240,420,600].entries()){
 const src=`videos/background/pana-day-${i}.mp4`;
 run(['-ss',String(start),'-i',source,'-t','8','-an','-vf','scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1,fps=20','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',root+src]);
 const c={id:`pana-day-${i}`,sourceId:'Ys1Kia_u6Uk',src,start,href:`https://www.youtube.com/watch?v=Ys1Kia_u6Uk&t=${start}s`,title:'Preparing for Panathinaikos - A FULL DAY with Elijah Bryant'};
 const existing=m.clips.findIndex(x=>x.id===c.id);if(existing<0)m.clips.push(c);else m.clips[existing]=c;
}
const groups=[...new Set(m.clips.map(c=>c.sourceId))];
if(groups.length!==8)throw Error('Expected eight unique sources');
const cells=Array.from({length:8},(_,i)=>i<6?{x:i%3*324,y:Math.floor(i/3)*184,width:320,height:180}:{x:(i-6)*486,y:368,width:482,height:180});
m.width=968;m.height=548;m.variants=[];
for(let v=0;v<8;v++){
 const order=groups.map(id=>{const indices=m.clips.map((c,i)=>c.sourceId===id?i:-1).filter(i=>i>=0);return indices.find(i=>m.clips[i].featured)??indices[v%indices.length];});
 const rotated=order.slice(v).concat(order.slice(0,v));
 const trophy=rotated.findIndex(i=>m.clips[i].featured), target=[1,4,6,7][v%4];
 [rotated[trophy],rotated[target]]=[rotated[target],rotated[trophy]];
 const filters=cells.map((c,i)=>`[${i}:v]scale=${c.width}:${c.height}:force_original_aspect_ratio=increase,crop=${c.width}:${c.height},setsar=1,fps=15[v${i}]`);
 filters.push(`${cells.map((_,i)=>`[v${i}]`).join('')}xstack=inputs=8:layout=${cells.map(c=>`${c.x}_${c.y}`).join('|')}:fill=black[out]`);
 const src=`videos/background/unique-wall-${v}.mp4`;
 run([...rotated.flatMap(i=>['-i',root+m.clips[i].src]),'-filter_complex',filters.join(';'),'-map','[out]','-an','-t','8','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',root+src]);
 m.variants.push({src,order:rotated,cells});console.log(`Unique wall ${v+1}/8`);
}
writeFileSync(file,JSON.stringify(m,null,2));
