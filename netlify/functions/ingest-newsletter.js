/* ── Ask Elijah — Scheduled Newsletter Ingestion ── */
/* Runs daily at 8 AM UTC via Netlify Scheduled Functions */
/* Checks all newsletter sources in knowledge_items for new posts */
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

// ── Simple string hash for generating IDs ──
function hashString(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ── Resolve RSS feed URL from newsletter URL ──
function resolveNewsletterFeed(url) {
  url = url.trim().replace(/\/$/, '');
  if (/\/(feed|rss)$/i.test(url)) return url;
  if (url.includes('beehiiv.com')) return url + '/feed';
  if (url.includes('substack.com')) return url + '/feed';
  return url + '/feed';
}

// ── Parse RSS/Atom XML ──
function parseNewsletterRSS(xml) {
  var posts = [];

  // Try RSS 2.0 format (<item>)
  var itemRegex = /<item>([\s\S]*?)<\/item>/g;
  var match;
  while ((match = itemRegex.exec(xml)) !== null) {
    var item = match[1];
    var title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    var link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    var content = (item.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/) || [])[1] ||
                  (item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || '';
    var pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';

    if (title && (content || link)) {
      posts.push({
        title: title.trim(),
        url: link.trim(),
        content: content,
        published: pubDate
      });
    }
  }

  // Try Atom format (<entry>) if no RSS items found
  if (posts.length === 0) {
    var entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    while ((match = entryRegex.exec(xml)) !== null) {
      var entry = match[1];
      var title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
      var link = (entry.match(/<link[^>]*href="([^"]*)"/) || [])[1] || '';
      var content = (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] ||
                    (entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || '';
      var published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1] ||
                      (entry.match(/<updated>([\s\S]*?)<\/updated>/) || [])[1] || '';

      if (title && (content || link)) {
        posts.push({
          title: title.trim(),
          url: link.trim(),
          content: content,
          published: published
        });
      }
    }
  }

  return posts;
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

// ── Load newsletter sources from database ──
async function getNewsletterSources() {
  var sources = [];

  // From env var
  if (process.env.NEWSLETTER_URL) {
    sources.push(process.env.NEWSLETTER_URL);
  }

  // From knowledge_items table (added via admin dashboard)
  try {
    var { data } = await supabase
      .from('knowledge_items')
      .select('source_url')
      .eq('type', 'Newsletter');

    if (data && data.length > 0) {
      data.forEach(function (item) {
        if (item.source_url && sources.indexOf(item.source_url) === -1) {
          sources.push(item.source_url);
        }
      });
    }
  } catch (e) {
    console.error('Failed to load newsletter sources from DB:', e.message);
  }

  return sources;
}

// ── Main handler ──
exports.handler = async function () {
  initClients();

  var newsletterUrls = await getNewsletterSources();
  if (newsletterUrls.length === 0) {
    console.log('No newsletter sources configured');
    return { statusCode: 200, body: 'No newsletters configured' };
  }

  var totalProcessed = 0;
  var totalSkipped = 0;
  var totalErrors = 0;

  for (var nlUrl of newsletterUrls) {
    console.log('Checking newsletter:', nlUrl);

    try {
      var feedUrl = resolveNewsletterFeed(nlUrl);
      var res = await fetch(feedUrl);
      if (!res.ok) {
        console.error('Failed to fetch RSS for', nlUrl, '- status:', res.status);
        totalErrors++;
        continue;
      }

      var xml = await res.text();
      var posts = parseNewsletterRSS(xml);
      console.log('Found', posts.length, 'posts in', nlUrl);

      for (var post of posts) {
        // Skip already ingested
        if (await isAlreadyIngested(post.url)) {
          totalSkipped++;
          continue;
        }

        try {
          // Strip HTML tags
          var text = post.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (text.length < 50) continue;

          var chunks = chunkText(text);
          var embeddings = await embedChunks(chunks);

          var vectors = chunks.map(function (chunk, i) {
            return {
              id: 'newsletter-' + hashString(post.url) + '-chunk-' + i,
              values: embeddings[i],
              metadata: {
                text: chunk,
                title: post.title,
                url: post.url,
                source_type: 'newsletter',
                published: post.published,
                chunk_index: i
              }
            };
          });

          for (var i = 0; i < vectors.length; i += 100) {
            await pineconeIndex.upsert(vectors.slice(i, i + 100));
          }

          await supabase.from('ingestion_log').insert({
            source_type: 'newsletter',
            source_url: post.url,
            status: 'done',
            chunks_created: chunks.length
          });

          totalProcessed++;
        } catch (err) {
          console.error('Failed to ingest newsletter post:', post.url, err.message);
          totalErrors++;
          await supabase.from('ingestion_log').insert({
            source_type: 'newsletter',
            source_url: post.url,
            status: 'failed',
            chunks_created: 0
          });
        }
      }
    } catch (feedErr) {
      console.error('Newsletter feed error for', nlUrl, ':', feedErr.message);
      totalErrors++;
    }
  }

  console.log('Newsletter ingestion complete:', totalProcessed, 'processed,', totalSkipped, 'skipped,', totalErrors, 'errors');
  return {
    statusCode: 200,
    body: JSON.stringify({
      processed: totalProcessed,
      skipped: totalSkipped,
      errors: totalErrors,
      sources: newsletterUrls.length
    })
  };
};
