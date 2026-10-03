import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [ffmpeg, source] = process.argv.slice(2);
if (!ffmpeg || !source) throw new Error('Provide ffmpeg and the downloaded source video.');
const out = new URL('../videos/background/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
function run(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Video encoding failed');
}
const starts = [15, 35, 75, 110, 180, 240, 280, 385, 413, 445, 490, 585, 660, 700, 735, 800];
const clips = starts.map((start, i) => ({
  id: `nba-${i}`, src: `videos/background/clip-${i}.mp4`,
  href: `https://www.youtube.com/watch?v=b8TRAbiS3XY&t=${start}s`,
  title: 'NBA championship journey', start
}));
for (const [i, clip] of clips.entries()) {
  run(['-ss', String(clip.start), '-i', source, '-t', '8', '-an', '-vf', 'scale=640:360:force_original_aspect_ratio=increase,crop=640:360,setsar=1,fps=20', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}clip-${i}.mp4`]);
  console.log(`Clip ${i + 1}/16 ready`);
}
const variants = [];
for (let v = 0; v < 4; v++) {
  const order = Array.from({ length: 16 }, (_, i) => (i * 5 + v * 3) % 16);
  const args = order.flatMap(i => ['-i', `${out}clip-${i}.mp4`]);
  const filters = order.map((_, i) => `[${i}:v]scale=320:180,fps=15[v${i}]`);
  const layout = order.map((_, i) => `${i % 4 * 324}_${Math.floor(i / 4) * 184}`).join('|');
  filters.push(`${order.map((_, i) => `[v${i}]`).join('')}xstack=inputs=16:layout=${layout}:fill=black[out]`);
  run([...args, '-filter_complex', filters.join(';'), '-map', '[out]', '-an', '-t', '8', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}wall-${v}.mp4`]);
  variants.push({ src: `videos/background/wall-${v}.mp4`, order });
  console.log(`Mosaic ${v + 1}/4 ready`);
}
writeFileSync(`${out}manifest.json`, JSON.stringify({ clips, variants, width: 1292, height: 732 }, null, 2));
