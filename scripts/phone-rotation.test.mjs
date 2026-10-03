import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/native-background.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../videos/background/manifest.json', import.meta.url)));
const picker = source.slice(source.indexOf('  function nextPhoneClip('), source.indexOf('  function mountPhoneClip('));

test('phone rotation exhausts the clip library before repeating and keeps visible sources unique', () => {
  for (let run = 0; run < 100; run++) {
    const initial = [manifest.clips.find(c => c.featured), manifest.clips.find(c => c.id === 'ZVlqyBLVCso-3'), manifest.clips.find(c => c.id === 'pana-day-0')];
    const context = vm.createContext({ manifest, phoneActive: initial, phoneUsed: new Set(initial.map(c => c.src)) });
    vm.runInContext(picker, context);
    const seen = new Set(initial.map(c => c.src));
    for (let round = 0; round < 100 && seen.size < manifest.clips.length; round++) {
      let progress = false;
      for (let slot = 0; slot < 3 && seen.size < manifest.clips.length; slot++) {
        const clip = context.nextPhoneClip(slot);
        if (!clip) continue;
        progress = true;
        assert.ok(!seen.has(clip.src), 'no repeated clip before library exhaustion');
        seen.add(clip.src);
        assert.equal(new Set(context.phoneActive.map(c => c.sourceId)).size, 3);
        assert.ok(fs.existsSync(new URL('../' + clip.src, import.meta.url)));
      }
      assert.ok(progress, 'rotation cannot deadlock');
    }
    assert.equal(seen.size, manifest.clips.length);
    assert.ok(context.nextPhoneClip(0), 'a new cycle starts after the library finishes');
  }
});
