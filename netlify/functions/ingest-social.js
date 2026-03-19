/* ── Ask Elijah — Scheduled Social Media Ingestion ── */
/* Runs daily at 7 AM UTC via Netlify Scheduled Functions */
/* Supports: Instagram, Twitter/X, LinkedIn, TikTok */
const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');

let pinecone, pineconeIndex, supabase;

const PINECONE_HOST = 'https://askelijah-5jj8obh.svc.aped-4627-b74a.pinecone.io';

function initClients() {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    pineconeIndex = pinecone.index(
      process.env.PINECONE_INDEX || 'askelijah',
      PINECONE_HOST
    );
  }
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
}

// ── Chunk text ──
function chunkText(text, maxTokens) {
  maxTokens = maxTokens || 300;
  var maxChars = maxTokens * 4;
  var overlapChars = 100;
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

// ── Instagram (via Graph API) ──
async function fetchInstagramPosts() {
  var token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return [];

  try {
    // Fetch recent media with captions
    var res = await fetch(
      'https://graph.instagram.com/me/media?fields=id,caption,timestamp,permalink,media_type&limit=50&access_token=' + token
    );
    var data = await res.json();
    if (data.error) {
      console.error('Instagram API error:', data.error.message);
      return [];
    }
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

// ── Twitter/X (via API v2) ──
async function fetchTweets() {
  var token = process.env.TWITTER_BEARER_TOKEN;
  var userId = process.env.TWITTER_USER_ID;
  if (!token || !userId) return [];

  try {
    var res = await fetch(
      'https://api.twitter.com/2/users/' + userId + '/tweets?max_results=100&tweet.fields=created_at,text&exclude=retweets,replies',
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    var data = await res.json();
    if (data.errors) {
      console.error('Twitter API error:', data.errors[0].message);
      return [];
    }
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

// ── LinkedIn (via API v2 — requires OAuth access token) ──
async function fetchLinkedInPosts() {
  var token = process.env.LINKEDIN_ACCESS_TOKEN;
  var personId = process.env.LINKEDIN_PERSON_ID;
  if (!token || !personId) return [];

  try {
    // Fetch user's posts via LinkedIn UGC Posts API
    var res = await fetch(
      'https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn%3Ali%3Aperson%3A' + personId + ')&count=50',
      {
        headers: {
          'Authorization': 'Bearer ' + token,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    var data = await res.json();
    if (!data.elements) {
      console.error('LinkedIn API returned no elements');
      return [];
    }

    return data.elements.map(function (post) {
      var text = '';
      // Extract text from specificContent
      if (post.specificContent &&
          post.specificContent['com.linkedin.ugc.ShareContent'] &&
          post.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary) {
        text = post.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text || '';
      }
      // Fallback: try the newer format
      if (!text && post.commentary) {
        text = post.commentary || '';
      }

      var postId = (post.id || '').replace('urn:li:ugcPost:', '').replace('urn:li:share:', '');

      return {
        id: postId || 'li-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        text: text,
        url: 'https://www.linkedin.com/feed/update/urn:li:ugcPost:' + postId,
        published: post.created ? new Date(post.created.time).toISOString() : '',
        platform: 'linkedin'
      };
    }).filter(function (p) { return p.text.length > 0; });
  } catch (e) {
    console.error('LinkedIn fetch failed:', e.message);
    return [];
  }
}

// ── TikTok (via Display API v2) ──
async function fetchTikTokPosts() {
  var token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) return [];

  try {
    // TikTok API v2 — fetch user's public videos
    var res = await fetch('https://open.tiktokapis.com/v2/video/list/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        max_count: 20
      })
    });
    var data = await res.json();

    if (data.error && data.error.code !== 'ok') {
      console.error('TikTok API error:', data.error.message);
      return [];
    }

    var videos = (data.data && data.data.videos) || [];
    return videos.map(function (video) {
      var text = video.title || video.video_description || '';
      // Include hashtags if present
      if (video.hashtag_names && video.hashtag_names.length > 0) {
        text += '\n\nHashtags: #' + video.hashtag_names.join(' #');
      }

      return {
        id: video.id,
        text: text,
        url: video.share_url || ('https://www.tiktok.com/@user/video/' + video.id),
        published: video.create_time ? new Date(video.create_time * 1000).toISOString() : '',
        platform: 'tiktok'
      };
    }).filter(function (p) { return p.text.length > 0; });
  } catch (e) {
    console.error('TikTok fetch failed:', e.message);
    return [];
  }
}

// ── TikTok fallback: scrape public page for video descriptions ──
async function fetchTikTokFromPage() {
  var username = process.env.TIKTOK_USERNAME;
  if (!username) return [];

  try {
    var res = await fetch('https://www.tiktok.com/@' + username, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AskElijahBot/1.0)'
      }
    });
    var html = await res.text();

    // Extract video data from __UNIVERSAL_DATA_FOR_REHYDRATION__
    var dataMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!dataMatch) return [];

    var jsonData = JSON.parse(dataMatch[1]);
    var itemList = null;

    // Navigate the nested structure to find video items
    try {
      var defaultScope = jsonData['__DEFAULT_SCOPE__'];
      var webapp = defaultScope['webapp.user-detail'];
      itemList = webapp.userInfo && webapp.userInfo.items;
      if (!itemList) {
        // Alternative path
        itemList = defaultScope['webapp.video-detail'] && defaultScope['webapp.video-detail'].itemInfo && [defaultScope['webapp.video-detail'].itemInfo.itemStruct];
      }
    } catch (e) {}

    if (!itemList || !Array.isArray(itemList)) return [];

    return itemList.map(function (item) {
      var text = item.desc || '';
      return {
        id: item.id || ('tt-' + Date.now()),
        text: text,
        url: 'https://www.tiktok.com/@' + username + '/video/' + item.id,
        published: item.createTime ? new Date(item.createTime * 1000).toISOString() : '',
        platform: 'tiktok'
      };
    }).filter(function (p) { return p.text.length > 10; });
  } catch (e) {
    console.error('TikTok page scrape failed:', e.message);
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

  // Fetch from all connected platforms in parallel
  var results = await Promise.all([
    fetchInstagramPosts(),
    fetchTweets(),
    fetchLinkedInPosts(),
    fetchTikTokPosts()
  ]);

  allPosts = allPosts.concat(results[0], results[1], results[2], results[3]);

  // TikTok fallback: if API returned nothing, try page scrape
  if (results[3].length === 0) {
    var scraped = await fetchTikTokFromPage();
    allPosts = allPosts.concat(scraped);
  }

  // Log which platforms returned data
  var platformCounts = {};
  allPosts.forEach(function (p) {
    platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
  });
  console.log('Social media fetch results:', JSON.stringify(platformCounts));

  if (allPosts.length === 0) {
    console.log('No social media posts to process (check API tokens in env vars)');
    return { statusCode: 200, body: 'No posts found' };
  }

  var processed = 0;
  var skipped = 0;
  var errors = 0;

  for (var post of allPosts) {
    if (!post.text || post.text.length < 10) continue;
    if (await isAlreadyIngested(post.url)) {
      skipped++;
      continue;
    }

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
      errors++;
      await supabase.from('ingestion_log').insert({
        source_type: post.platform,
        source_url: post.url,
        status: 'failed',
        chunks_created: 0
      });
    }
  }

  console.log('Social ingestion complete:', processed, 'processed,', skipped, 'skipped,', errors, 'errors');
  return {
    statusCode: 200,
    body: JSON.stringify({ processed: processed, skipped: skipped, errors: errors, platforms: platformCounts })
  };
};
