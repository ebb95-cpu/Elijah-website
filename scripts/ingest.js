#!/usr/bin/env node
/* ── Ask Elijah — Bulk Ingestion CLI ──
 *
 * Usage:
 *   node scripts/ingest.js --channel UC_CHANNEL_ID
 *   node scripts/ingest.js --video VIDEO_ID
 *   node scripts/ingest.js --video VIDEO_ID,VIDEO_ID2
 *
 * Requires env vars:
 *   PINECONE_API_KEY, PINECONE_INDEX, VOYAGE_API_KEY
 *   YOUTUBE_API_KEY (optional, for comments)
 */

const { Pinecone } = require('@pinecone-database/pinecone');
const { YoutubeTranscript } = require('youtube-transcript');

// ── Parse args ──
const args = process.argv.slice(2);
let channelId = null;
let videoIds = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--channel' && args[i + 1]) channelId = args[++i];
  if (args[i] === '--video' && args[i + 1]) videoIds = args[++i].split(',');
}

if (!channelId && videoIds.length === 0) {
  console.log('Usage:');
  console.log('  node scripts/ingest.js --channel UC_CHANNEL_ID');
  console.log('  node scripts/ingest.js --video VIDEO_ID');
  console.log('  node scripts/ingest.js --video VIDEO_ID1,VIDEO_ID2');
  process.exit(1);
}

// ── Validate env ──
const required = ['PINECONE_API_KEY', 'VOYAGE_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error('Missing env var:', key);
    process.exit(1);
  }
}

// ── Init clients ──
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX || 'ask-elijah');

// ── Fetch channel videos from RSS ──
async function fetchChannelVideos(chId) {
  const rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + chId;
  const res = await fetch(rssUrl);
  const xml = await res.text();

  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const vid = (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
    const title = (entry.match(/<title>(.*?)<\/title>/) || [])[1];
    if (vid) entries.push({ videoId: vid, title: title || 'Untitled' });
  }

  console.log('Found', entries.length, 'videos from channel RSS');
  return entries;
}

// ── Fetch comments ──
async function fetchComments(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    const url = 'https://www.googleapis.com/youtube/v3/commentThreads'
      + '?part=snippet&videoId=' + videoId
      + '&maxResults=100&order=relevance&key=' + apiKey;
    const res = await fetch(url);
    const data = await res.json();
    return (data.items || []).map(i => i.snippet.topLevelComment.snippet.textOriginal);
  } catch (e) {
    console.log('  Could not fetch comments:', e.message);
    return [];
  }
}

// ── Chunk text ──
function chunkText(text) {
  const maxChars = 2000; // ~500 tokens
  const overlap = 200;
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;
    let chunk = text.slice(start, end);
    if (end < text.length) {
      const bp = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('\n'));
      if (bp > maxChars * 0.5) {
        chunk = chunk.slice(0, bp + 1);
        end = start + bp + 1;
      }
    }
    if (chunk.trim().length > 20) chunks.push(chunk.trim());
    start = end - overlap;
  }

  return chunks;
}

// ── Embed via Voyage AI ──
async function embedBatch(chunks) {
  const all = [];
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.VOYAGE_API_KEY
      },
      body: JSON.stringify({ input: batch, model: 'voyage-3-lite' })
    });
    const data = await res.json();
    if (data.data) {
      all.push(...data.data.map(d => d.embedding));
    } else {
      console.error('  Embedding error:', JSON.stringify(data).slice(0, 200));
      // Fill with zeros to keep alignment
      all.push(...batch.map(() => new Array(512).fill(0)));
    }
  }
  return all;
}

// ── Process one video ──
async function processVideo(videoId, title) {
  const url = 'https://www.youtube.com/watch?v=' + videoId;
  console.log('\n📹 Processing:', title || videoId);

  // 1. Fetch transcript
  let transcript;
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    transcript = items.map(t => t.text).join(' ');
    console.log('  Transcript:', transcript.length, 'chars');
  } catch (e) {
    console.log('  No transcript available:', e.message);
    return { chunks: 0 };
  }

  if (transcript.length < 50) {
    console.log('  Transcript too short, skipping');
    return { chunks: 0 };
  }

  // 2. Chunk
  const chunks = chunkText(transcript);
  console.log('  Chunks:', chunks.length);

  // 3. Embed
  const embeddings = await embedBatch(chunks);
  console.log('  Embeddings generated');

  // 4. Upsert to Pinecone
  const vectors = chunks.map((chunk, i) => ({
    id: 'yt-' + videoId + '-chunk-' + i,
    values: embeddings[i],
    metadata: {
      text: chunk,
      title: title || videoId,
      url: url,
      source_type: 'youtube',
      source_id: videoId,
      chunk_index: i
    }
  }));

  for (let i = 0; i < vectors.length; i += 100) {
    await pineconeIndex.upsert(vectors.slice(i, i + 100));
  }
  console.log('  Stored in Pinecone');

  // 5. Comments
  const comments = await fetchComments(videoId);
  const questions = comments.filter(c => c.includes('?'));
  let commentChunks = 0;

  if (questions.length > 0) {
    const qText = 'Audience questions from "' + (title || videoId) + '":\n\n'
      + questions.slice(0, 20).map((q, i) => (i + 1) + '. ' + q).join('\n');

    const qChunks = chunkText(qText);
    const qEmbed = await embedBatch(qChunks);
    const qVectors = qChunks.map((chunk, i) => ({
      id: 'yt-comments-' + videoId + '-' + i,
      values: qEmbed[i],
      metadata: {
        text: chunk,
        title: 'Audience Q: ' + (title || videoId),
        url: url,
        source_type: 'youtube-comments',
        source_id: videoId
      }
    }));

    for (let i = 0; i < qVectors.length; i += 100) {
      await pineconeIndex.upsert(qVectors.slice(i, i + 100));
    }
    commentChunks = qChunks.length;
    console.log('  Comments:', questions.length, 'questions →', commentChunks, 'chunks');
  }

  return { chunks: chunks.length + commentChunks };
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════');
  console.log('  Ask Elijah — Bulk Ingestion');
  console.log('═══════════════════════════════');

  let videos = [];

  if (channelId) {
    videos = await fetchChannelVideos(channelId);
  } else {
    videos = videoIds.map(id => ({ videoId: id, title: '' }));
  }

  let totalChunks = 0;
  let processed = 0;
  let errors = 0;

  for (const video of videos) {
    try {
      const result = await processVideo(video.videoId, video.title);
      totalChunks += result.chunks;
      processed++;
    } catch (err) {
      console.error('  ERROR:', err.message);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════');
  console.log('  Done!');
  console.log('  Videos processed:', processed);
  console.log('  Errors:', errors);
  console.log('  Total chunks:', totalChunks);
  console.log('═══════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
