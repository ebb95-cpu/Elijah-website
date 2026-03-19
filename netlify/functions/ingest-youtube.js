/* ── Ask Elijah — Scheduled YouTube Ingestion ── */
/* Runs daily via Netlify Scheduled Functions */
const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');
const { YoutubeTranscript } = require('youtube-transcript');

let pinecone, pineconeIndex, supabase;

function initClients() {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    pineconeIndex = pinecone.index(process.env.PINECONE_INDEX || 'askelijah');
  }
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
}

// ── Fetch channel RSS for new videos ──
async function fetchNewVideos(channelId) {
  var rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
  var res = await fetch(rssUrl);
  var xml = await res.text();

  // Simple XML parsing for video entries
  var entries = [];
  var entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  var match;
  while ((match = entryRegex.exec(xml)) !== null) {
    var entry = match[1];
    var videoId = (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
    var title = (entry.match(/<title>(.*?)<\/title>/) || [])[1];
    var published = (entry.match(/<published>(.*?)<\/published>/) || [])[1];

    if (videoId && title) {
      entries.push({
        videoId: videoId,
        title: title,
        published: published,
        url: 'https://www.youtube.com/watch?v=' + videoId
      });
    }
  }

  return entries;
}

// ── Fetch YouTube comments via Data API ──
async function fetchVideoComments(videoId) {
  var apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  var comments = [];
  var url = 'https://www.googleapis.com/youtube/v3/commentThreads'
    + '?part=snippet&videoId=' + videoId
    + '&maxResults=100&order=relevance&key=' + apiKey;

  try {
    var res = await fetch(url);
    var data = await res.json();
    if (data.items) {
      data.items.forEach(function (item) {
        var text = item.snippet.topLevelComment.snippet.textOriginal;
        comments.push(text);
      });
    }
  } catch (e) {
    console.error('Failed to fetch comments for', videoId, e.message);
  }

  return comments;
}

// ── Extract questions from comments ──
function extractQuestions(comments) {
  return comments.filter(function (c) {
    // Has question mark or starts with question words
    return c.includes('?') ||
      /^(how|what|why|when|where|who|can|do|does|is|are|should|would|could)\b/i.test(c.trim());
  });
}

// ── Chunk text ──
function chunkText(text, maxTokens) {
  maxTokens = maxTokens || 500;
  var maxChars = maxTokens * 4;
  var overlapChars = 200;
  var chunks = [];
  var start = 0;

  while (start < text.length) {
    var end = start + maxChars;
    var chunk = text.slice(start, end);
    if (end < text.length) {
      var bp = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('\n'));
      if (bp > maxChars * 0.5) {
        chunk = chunk.slice(0, bp + 1);
        end = start + bp + 1;
      }
    }
    chunks.push(chunk.trim());
    start = end - overlapChars;
  }

  return chunks.filter(function (c) { return c.length > 20; });
}

// ── Embed chunks via Voyage AI ──
async function embedChunks(chunks) {
  var allEmbeddings = [];
  for (var i = 0; i < chunks.length; i += 20) {
    var batch = chunks.slice(i, i + 20);
    var res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.VOYAGE_API_KEY
      },
      body: JSON.stringify({ input: batch, model: 'voyage-3-lite' })
    });
    var data = await res.json();
    allEmbeddings = allEmbeddings.concat(data.data.map(function (d) { return d.embedding; }));
  }
  return allEmbeddings;
}

// ── Check if video already ingested ──
async function isAlreadyIngested(videoId) {
  var { data } = await supabase
    .from('ingestion_log')
    .select('id')
    .eq('source_url', 'https://www.youtube.com/watch?v=' + videoId)
    .eq('status', 'done')
    .limit(1);
  return data && data.length > 0;
}

// ── Resolve channel ID from URL or handle ──
async function resolveChannelId(input) {
  input = input.trim();
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(input)) return input;
  var m = input.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (m) return m[1];
  var handle = null;
  m = input.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/);
  if (m) handle = m[1];
  else if (input.startsWith('@')) handle = input.slice(1);

  // Method 1: YouTube Data API (most reliable)
  if (handle && process.env.YOUTUBE_API_KEY) {
    try {
      var apiUrl = 'https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=' + encodeURIComponent(handle) + '&key=' + process.env.YOUTUBE_API_KEY;
      var res = await fetch(apiUrl);
      var data = await res.json();
      if (data.items && data.items.length > 0) return data.items[0].id;
      apiUrl = 'https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=' + encodeURIComponent(handle) + '&key=' + process.env.YOUTUBE_API_KEY;
      res = await fetch(apiUrl);
      data = await res.json();
      if (data.items && data.items.length > 0) return data.items[0].id;
    } catch (e) {
      console.error('YouTube API resolve failed for @' + handle, e.message);
    }
  }

  // Method 2: Scrape YouTube page (fallback)
  if (handle) {
    try {
      var res = await fetch('https://www.youtube.com/@' + handle, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      var html = await res.text();
      var cidMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
      if (cidMatch) return cidMatch[1];
      cidMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
      if (cidMatch) return cidMatch[1];
    } catch (e) {}
  }

  try {
    var res = await fetch(input, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    var html = await res.text();
    var cidMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
    if (cidMatch) return cidMatch[1];
  } catch (e) {}
  return null;
}

// ── Load channel IDs from env vars + database ──
async function getChannelIds() {
  var ids = [process.env.YOUTUBE_CHANNEL_ID, process.env.YOUTUBE_CHANNEL_ID_2].filter(Boolean);

  // Also load channels added via the admin dashboard
  try {
    var { data } = await supabase
      .from('knowledge_items')
      .select('source_url')
      .eq('type', 'YouTube Channel');

    if (data && data.length > 0) {
      for (var item of data) {
        var resolved = await resolveChannelId(item.source_url);
        if (resolved && ids.indexOf(resolved) === -1) {
          ids.push(resolved);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load channels from DB:', e.message);
  }

  return ids;
}

// ── Main handler ──
exports.handler = async function (event) {
  initClients();

  var channelIds = await getChannelIds();
  if (channelIds.length === 0) {
    console.log('No YouTube channels configured');
    return { statusCode: 200, body: 'No channel configured' };
  }

  try {
    // Fetch videos from all channels
    var videos = [];
    for (var chId of channelIds) {
      var chVideos = await fetchNewVideos(chId);
      videos = videos.concat(chVideos);
    }
    var processed = 0;
    var errors = 0;

    for (var v of videos) {
      // Skip already ingested
      if (await isAlreadyIngested(v.videoId)) continue;

      try {
        // 1. Fetch transcript
        var transcriptItems = await YoutubeTranscript.fetchTranscript(v.videoId);
        var fullTranscript = transcriptItems.map(function (t) { return t.text; }).join(' ');

        if (fullTranscript.length < 50) continue;

        // 2. Chunk and embed transcript
        var chunks = chunkText(fullTranscript);
        var embeddings = await embedChunks(chunks);

        // 3. Upsert transcript chunks to Pinecone
        var vectors = chunks.map(function (chunk, i) {
          return {
            id: 'yt-' + v.videoId + '-chunk-' + i,
            values: embeddings[i],
            metadata: {
              text: chunk,
              title: v.title,
              url: v.url,
              source_type: 'youtube',
              source_id: v.videoId,
              published: v.published,
              chunk_index: i
            }
          };
        });

        for (var i = 0; i < vectors.length; i += 100) {
          await pineconeIndex.upsert(vectors.slice(i, i + 100));
        }

        // 4. Fetch and process comments
        var comments = await fetchVideoComments(v.videoId);
        var questions = extractQuestions(comments);

        if (questions.length > 0) {
          var questionsText = 'Audience questions from "' + v.title + '":\n\n' +
            questions.slice(0, 20).map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n');

          var qChunks = chunkText(questionsText, 300);
          var qEmbeddings = await embedChunks(qChunks);

          var qVectors = qChunks.map(function (chunk, i) {
            return {
              id: 'yt-comments-' + v.videoId + '-' + i,
              values: qEmbeddings[i],
              metadata: {
                text: chunk,
                title: 'Audience Questions: ' + v.title,
                url: v.url,
                source_type: 'youtube-comments',
                source_id: v.videoId
              }
            };
          });

          for (var j = 0; j < qVectors.length; j += 100) {
            await pineconeIndex.upsert(qVectors.slice(j, j + 100));
          }
        }

        // 5. Log success
        await supabase.from('ingestion_log').insert({
          source_type: 'youtube',
          source_url: v.url,
          status: 'done',
          chunks_created: chunks.length + (questions.length > 0 ? 1 : 0)
        });

        processed++;
      } catch (videoErr) {
        console.error('Failed to process video:', v.videoId, videoErr.message);
        errors++;
        await supabase.from('ingestion_log').insert({
          source_type: 'youtube',
          source_url: v.url,
          status: 'failed',
          chunks_created: 0
        });
      }
    }

    console.log('YouTube ingestion complete:', processed, 'videos processed,', errors, 'errors');
    return {
      statusCode: 200,
      body: JSON.stringify({ processed: processed, errors: errors })
    };

  } catch (err) {
    console.error('YouTube ingestion failed:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
