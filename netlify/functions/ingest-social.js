/* ── Ask Elijah — Scheduled Social Media Ingestion ── */
/* Runs daily via Netlify Scheduled Functions */
/* Placeholder — social APIs require OAuth tokens set up per-platform */
const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');

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

// ── Chunk text ──
function chunkText(text, maxTokens) {
  maxTokens = maxTokens || 300;
  var maxChars = maxTokens * 4;
  var chunks = [];
  var start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxChars).trim());
    start += maxChars - 100;
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

// ── Instagram (via Graph API — requires access token) ──
async function fetchInstagramPosts() {
  var token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return [];

  try {
    var res = await fetch(
      'https://graph.instagram.com/me/media?fields=id,caption,timestamp,permalink&access_token=' + token
    );
    var data = await res.json();
    return (data.data || []).map(function (post) {
      return {
        id: post.id,
        text: post.caption || '',
        url: post.permalink || '',
        published: post.timestamp,
        platform: 'instagram'
      };
    });
  } catch (e) {
    console.error('Instagram fetch failed:', e.message);
    return [];
  }
}

// ── Twitter/X (via API v2 — requires bearer token) ──
async function fetchTweets() {
  var token = process.env.TWITTER_BEARER_TOKEN;
  var userId = process.env.TWITTER_USER_ID;
  if (!token || !userId) return [];

  try {
    var res = await fetch(
      'https://api.twitter.com/2/users/' + userId + '/tweets?max_results=20&tweet.fields=created_at',
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    var data = await res.json();
    return (data.data || []).map(function (tweet) {
      return {
        id: tweet.id,
        text: tweet.text || '',
        url: 'https://twitter.com/i/status/' + tweet.id,
        published: tweet.created_at,
        platform: 'twitter'
      };
    });
  } catch (e) {
    console.error('Twitter fetch failed:', e.message);
    return [];
  }
}

// ── Check if already ingested ──
async function isAlreadyIngested(sourceUrl) {
  var { data } = await supabase
    .from('ingestion_log')
    .select('id')
    .eq('source_url', sourceUrl)
    .eq('status', 'done')
    .limit(1);
  return data && data.length > 0;
}

// ── Main handler ──
exports.handler = async function () {
  initClients();

  var allPosts = [];

  // Fetch from all connected platforms
  var [instaPosts, tweets] = await Promise.all([
    fetchInstagramPosts(),
    fetchTweets()
  ]);

  allPosts = allPosts.concat(instaPosts, tweets);

  if (allPosts.length === 0) {
    console.log('No social media posts to process');
    return { statusCode: 200, body: 'No posts found' };
  }

  var processed = 0;

  for (var post of allPosts) {
    if (!post.text || post.text.length < 10) continue;
    if (await isAlreadyIngested(post.url)) continue;

    try {
      var chunks = chunkText(post.text);
      var embeddings = await embedChunks(chunks);

      var vectors = chunks.map(function (chunk, i) {
        return {
          id: post.platform + '-' + post.id + '-' + i,
          values: embeddings[i],
          metadata: {
            text: chunk,
            title: post.platform + ' post',
            url: post.url,
            source_type: post.platform,
            source_id: post.id,
            published: post.published
          }
        };
      });

      for (var i = 0; i < vectors.length; i += 100) {
        await pineconeIndex.upsert(vectors.slice(i, i + 100));
      }

      await supabase.from('ingestion_log').insert({
        source_type: post.platform,
        source_url: post.url,
        status: 'done',
        chunks_created: chunks.length
      });

      processed++;
    } catch (err) {
      console.error('Failed to process', post.platform, 'post:', err.message);
      await supabase.from('ingestion_log').insert({
        source_type: post.platform,
        source_url: post.url,
        status: 'failed',
        chunks_created: 0
      });
    }
  }

  console.log('Social ingestion complete:', processed, 'posts processed');
  return {
    statusCode: 200,
    body: JSON.stringify({ processed: processed })
  };
};
