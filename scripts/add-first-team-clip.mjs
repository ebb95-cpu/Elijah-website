import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const [ffmpeg,source]=process.argv.slice(2);
const root=new URL('../',import.meta.url).pathname;
const file=root+'videos/background/manifest.json',m=JSON.parse(readFileSync(file));
function run(args){const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});if(r.status!==0)throw Error('Encoding failed');}
const portrait='/tmp/elijah-first-team-portrait.mp4';
run(['-ss','9','-i',source,'-t','2.1','-an','-c:v','libx264','-preset','fast','-crf','24',portrait]);
const src='videos/background/first-team-trophy.mp4';
run(['-stream_loop','-1','-i',portrait,'-t','8','-filter_complex','[0:v]split=2[bg][fg];[bg]scale=640:360:force_original_aspect_ratio=increase,crop=640:360,boxblur=20:2[blur];[fg]scale=-2:360[front];[blur][front]overlay=(W-w)/2:0,setsar=1,fps=20[out]','-map','[out]','-an','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',root+src]);
const clip={id:'first-team-trophy',sourceId:'uploaded-eb-first-team',src,title:'Elijah Bryant holding his First Team All-EuroLeague trophy'};
const existing=m.clips.findIndex(c=>c.id===clip.id);if(existing<0)m.clips.push(clip);else m.clips[existing]=clip;
const additions=[
 ['xpQVrnmWQMU','BRUTAL Life of a EuroLeague Player',120],
 ['5_s3kuLV6nY',"Inside ZALGIRIS _ One of Europe's Toughest Stadiums",180],
 ['-gIR8eO3oPE','Training for my EuroLeague Season _ A Week in the Life',180]
];
for(const [id,title,start] of additions){
 const src=`videos/background/extra-${id}.mp4`;
 run(['-ss',String(start),'-i',`/Users/elijahbryant/Downloads/${title}.mp4`,'-t','8','-vf','scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1,fps=20','-an','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',root+src]);
 const entry={id:`extra-${id}`,sourceId:id,src,title,href:`https://www.youtube.com/watch?v=${id}&t=${start}s`};
 const index=m.clips.findIndex(c=>c.id===entry.id);
 if(index<0)m.clips.push(entry);else m.clips[index]=entry;
}
const groups=[...new Set(m.clips.map(c=>c.sourceId))];
if(groups.length!==12)throw Error('Expected twelve distinct sources');
const cells=Array.from({length:12},(_,i)=>({x:i%4*324,y:Math.floor(i/4)*184,width:320,height:180}));
m.width=1292;m.height=548;m.variants=[];
for(let v=0;v<8;v++){
 const order=groups.map(id=>{const indices=m.clips.map((c,i)=>c.sourceId===id?i:-1).filter(i=>i>=0);return indices.find(i=>m.clips[i].featured)??indices[v%indices.length];});
 const rotated=order.slice(v).concat(order.slice(0,v));
 const trophy=rotated.findIndex(i=>m.clips[i].featured),target=[1,6,9][v%3];
 [rotated[trophy],rotated[target]]=[rotated[target],rotated[trophy]];
 const filters=cells.map((_,i)=>`[${i}:v]scale=320:180,setsar=1,fps=15[v${i}]`);
 filters.push(`${cells.map((_,i)=>`[v${i}]`).join('')}xstack=inputs=12:layout=${cells.map(c=>`${c.x}_${c.y}`).join('|')}:fill=black[out]`);
 const wall=`videos/background/twelve-wall-${v}.mp4`;
 run([...rotated.flatMap(i=>['-i',root+m.clips[i].src]),'-filter_complex',filters.join(';'),'-map','[out]','-an','-t','8','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',root+wall]);
 m.variants.push({src:wall,order:rotated,cells});console.log(`Awards wall ${v+1}/8 ready`);
}
writeFileSync(file,JSON.stringify(m,null,2));
