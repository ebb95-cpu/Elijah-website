import { writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [ffmpeg, downloads] = process.argv.slice(2);
if (!ffmpeg || !downloads) throw Error('Provide ffmpeg and the downloads directory.');
const out = new URL('../videos/background/', import.meta.url).pathname;
const sources = [
  ['ZVlqyBLVCso', 'Euroleague Final 4 in Serbia', [240, 800, 1500, 2200]],
  ['JuB5TOBGuoY', 'Leaving Israel for the NBA!', [100, 280, 440, 600]],
  ['z67K4GkYcLQ', 'FULL Shooting Workout', [180, 440, 760, 1100]],
  ['yvupQzsyWxk', 'Cyprus with Milwaukee Bucks!', [110, 300, 500, 740]],
  ['dZ0QLLrw1gk', 'Pre-Season with Anadolu Efes', [180, 580, 1000, 1450]],
  ['GGl1BLJ_RoU', 'I Had the Best Game of My EuroLeague Career', [70, 190, 310, 440]],
  ['jD2vnfjKxEQ', 'EuroLeague Basketball Travel', [80, 180, 300, 420]]
];
function run(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw Error('Encoding failed');
}
const clips = [0, 4, 10, 14].map(i => ({
  id: `nba-${i}`, sourceId: 'b8TRAbiS3XY', src: `videos/background/clip-${i}.mp4`,
  href: `https://www.youtube.com/watch?v=b8TRAbiS3XY&t=${[15,35,75,110,180,240,280,385,413,445,490,585,660,700,735,800][i]}s`, title: 'NBA championship journey'
}));
const files = readdirSync(downloads);
for (const [id, prefix, starts] of sources) {
  const file = files.find(n => n.toLowerCase().startsWith(prefix.toLowerCase()) && n.endsWith('.mp4'));
  if (!file) { console.log(`Not downloaded yet: ${prefix}`); continue; }
  for (const [i, start] of starts.entries()) {
    const name = `${id}-${i}.mp4`;
    run(['-ss', String(start), '-i', `${downloads}/${file}`, '-t', '8', '-an', '-vf', 'scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1,fps=20', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}${name}`]);
    clips.push({ id: `${id}-${i}`, sourceId: id, src: `videos/background/${name}`, href: `https://www.youtube.com/watch?v=${id}&t=${start}s`, title: file.slice(0, -4), start });
  }
  console.log(`Prepared four clips: ${prefix}`);
}
const variants = [];
for (let v = 0; v < 8; v++) {
  // Interleave source videos so each wall contains the full range of subjects.
  const groups = clips.length / 4;
  const order = Array.from({length:16}, (_, i) => ((i + v) % groups) * 4 + (Math.floor(i / groups) + v) % 4);
  const args = order.flatMap(i => ['-i', new URL(`../${clips[i].src}`, import.meta.url).pathname]);
  const filters = order.map((_, i) => `[${i}:v]scale=320:180,fps=15[v${i}]`);
  const layout = order.map((_, i) => `${i % 4 * 324}_${Math.floor(i / 4) * 184}`).join('|');
  filters.push(`${order.map((_, i) => `[v${i}]`).join('')}xstack=inputs=16:layout=${layout}:fill=black[out]`);
  const name = `mixed-wall-${v}.mp4`;
  run([...args, '-filter_complex', filters.join(';'), '-map', '[out]', '-an', '-t', '8', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}${name}`]);
  variants.push({src:`videos/background/${name}`, order});
  console.log(`Mixed wall ${v + 1}/8 ready`);
}
writeFileSync(`${out}manifest.json`, JSON.stringify({clips, variants, width:1292, height:732}, null, 2));
