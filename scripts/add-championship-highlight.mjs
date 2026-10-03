import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [ffmpeg, source] = process.argv.slice(2);
const root = new URL('../', import.meta.url).pathname;
const file = `${root}videos/background/manifest.json`;
const manifest = JSON.parse(readFileSync(file));
function run(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio:'inherit'});
  if (r.status !== 0) throw Error('Encoding failed');
}
const clip = {id:'nba-trophy', sourceId:'b8TRAbiS3XY', featured:true,
  src:'videos/background/nba-trophy.mp4', start:430,
  href:'https://www.youtube.com/watch?v=b8TRAbiS3XY&t=430s',
  title:'NBA championship trophy and parade'};
run(['-ss','430','-i',source,'-t','8','-an','-vf','scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1,fps=20','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',root+clip.src]);
let index = manifest.clips.findIndex(c=>c.id===clip.id);
if(index<0) { index=manifest.clips.length; manifest.clips.push(clip); } else manifest.clips[index]=clip;
for (const [v, variant] of manifest.variants.entries()) {
  // Keep the required footage in a central column, visible in narrow desktop panels.
  variant.order[[1,2,5,6,9,10,13,14][v%8]]=index;
  const filters=variant.order.map((_,i)=>`[${i}:v]scale=320:180,fps=15[v${i}]`);
  const layout=variant.order.map((_,i)=>`${i%4*324}_${Math.floor(i/4)*184}`).join('|');
  filters.push(`${variant.order.map((_,i)=>`[v${i}]`).join('')}xstack=inputs=16:layout=${layout}:fill=black[out]`);
  variant.src=`videos/background/champion-wall-${v}.mp4`;
  run([...variant.order.flatMap(i=>['-i',root+manifest.clips[i].src]),'-filter_complex',filters.join(';'),'-map','[out]','-an','-t','8','-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',root+variant.src]);
  console.log(`Championship wall ${v+1} ready`);
}
writeFileSync(file,JSON.stringify(manifest,null,2));
