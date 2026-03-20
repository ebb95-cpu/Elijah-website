/* ── Ask Elijah — Scheduled Web Ingestion ──
   Searches the web for articles, podcasts, interviews about Elijah Bryant.
   Trusted domains auto-ingest. Unknown domains go to admin review queue.
   Runs daily via Netlify Scheduled Functions. */

const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');

let pinecone, pineconeIndex, supabase;

const PINECONE_HOST = 'https://askelijah-5jj8obh.svc.aped-4627-b74a.pinecone.io';

function initClients() {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    pineconeIndex = pinecone.index(process.env.PINECONE_INDEX || 'askelijah', PINECONE_HOST);
  }
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
}

// ── Trusted domains that auto-ingest ──
const TRUSTED_DOMAINS = [
  'espn.com', 'nba.com', 'basketball-reference.com',
  'eurohoops.net', 'euroleague.net', 'eurobasket.com',
  'byucougars.com', 'byutv.org', 'deseret.com', 'ksl.com',
  'sports-reference.com', 'realgm.com', 'hoopshype.com',
  'sportando.basketball', 'talkbasket.net',
  'youtube.com', 'podcasts.apple.com', 'open.spotify.com',
  'twitter.com', 'x.com', 'instagram.com',
  'linkedin.com', 'theplayerstribune.com',
  'si.com', 'bleacherreport.com', 'theathletic.com',
  'basketball.realgm.com', 'proballers.com',
  'foxsports.com', 'cbssports.com', 'nbcsports.com'
];

// ── Search queries to find content about Elijah ──
const SEARCH_QUERIES = [
  '"Elijah Bryant" basketball',
  '"Elijah Bryant" interview',
  '"Elijah Bryant" podcast',
  '"Elijah Bryant" article',
  'Elijah Bryant BYU basketball',
  'Elijah Bryant EuroLeague',
  'Elijah Bryant NBA'
];

// ── Check if domain is trusted ──
function isDomainTrusted(url) {
  try {
    var hostname = new URL(url).hostname.replace('www.', '');
    return TRUSTED_DOMAINS.some(function (d) {
      return hostname === d || hostname.endsWith('.' + d);
    });
  } catch (e) {
    return false;
  }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch (e) { return ''; }
}

// ── Search via Brave Search API ──
async function searchBrave(query) {
  var apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    console.log('No BRAVE_SEARCH_API_KEY set, skipping web search');
    return [];
  }

  var res = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=10&freshness=pw', {
    headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json' }
  });

  if (!res.ok) {
    console.error('Brave search error:', res.status);
    return [];
  }

  var data = await res.json();
  var results = (data.web && data.web.results) || [];

  return results.map(function (r) {
    return {
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
      domain: getDomain(r.url),
      published: r.page_age || null
    };
  });
}

// ── Fetch article text from URL ──
async function fetchArticleText(url) {
  try {
    var res = await fetch(url, {
      headers: { 'User-Agent': 'AskElijah-Bot/1.0 (content indexer)' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return '';
    var html = await res.text();

    // Strip HTML to get text content
    var text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Only keep text that mentions Elijah (relevance filter)
    if (!text.toLowerCase().includes('elijah bryant') && !text.toLowerCase().includes('elijah')) {
      return '';
    }

    // Truncate to ~5000 chars to keep processing manageable
    return text.substring(0, 5000);
  } catch (e) {
    console.error('Failed to fetch article:', url, e.message);
    return '';
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
      var lastBreak = chunk.lastIndexOf('. ');
      if (lastBreak > maxChars * 0.5) {
        end = start + lastBreak + 2;
        chunk = text.slice(start, end);
      }
    }
    chunks.push(chunk.trim());
    start = end - overlapChars;
  }

  return chunks.filter(function (c) { return c.length > 50; });
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
    if (!res.ok) {
      console.error('Voyage embed error:', res.status);
      continue;
    }
    var data = await res.json();
    if (data.data) {
      data.data.forEach(function (d) { allEmbeddings.push(d.embedding); });
    }
  }
  return allEmbeddings;
}

// ── Upsert vectors to Pinecone ──
async function upsertToPinecone(chunks, embeddings, metadata) {
  var vectors = [];
  for (var i = 0; i < chunks.length; i++) {
    if (!embeddings[i]) continue;
    var id = 'web-' + metadata.urlHash + '-' + i;
    vectors.push({
      id: id,
      values: embeddings[i],
      metadata: {
        text: chunks[i],
        title: metadata.title,
        source_type: 'web-article',
        source_url: metadata.url,
        domain: metadata.domain,
        url: metadata.url
      }
    });
  }

  if (vectors.length === 0) return 0;

  // Batch upsert (max 100 at a time)
  for (var i = 0; i < vectors.length; i += 100) {
    await pineconeIndex.upsert(vectors.slice(i, i + 100));
  }

  return vectors.length;
}

// ── Simple hash for URL-based IDs ──
function hashUrl(url) {
  var hash = 0;
  for (var i = 0; i < url.length; i++) {
    var chr = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ── Check if URL already ingested ──
async function isAlreadyIngested(url) {
  var { data } = await supabase
    .from('ingestion_log')
    .select('id')
    .eq('source_url', url)
    .limit(1);
  return data && data.length > 0;
}

// ── Main handler ──
exports.handler = async function (event) {
  console.log('Starting web ingestion...');
  initClients();

  var totalDiscovered = 0;
  var totalIngested = 0;
  var totalPending = 0;
  var totalSkipped = 0;

  // Run all search queries
  var allResults = [];
  for (var q = 0; q < SEARCH_QUERIES.length; q++) {
    var query = SEARCH_QUERIES[q];
    console.log('Searching:', query);
    var results = await searchBrave(query);
    allResults = allResults.concat(results);

    // Small delay between searches to be respectful
    if (q < SEARCH_QUERIES.length - 1) {
      await new Promise(function (r) { setTimeout(r, 500); });
    }
  }

  // Deduplicate by URL
  var seen = {};
  var uniqueResults = [];
  allResults.forEach(function (r) {
    if (!seen[r.url]) {
      seen[r.url] = true;
      uniqueResults.push(r);
    }
  });

  totalDiscovered = uniqueResults.length;
  console.log('Found ' + totalDiscovered + ' unique results');

  // Process each result
  for (var i = 0; i < uniqueResults.length; i++) {
    var result = uniqueResults[i];

    // Skip if already ingested
    var exists = await isAlreadyIngested(result.url);
    if (exists) {
      totalSkipped++;
      continue;
    }

    var trusted = isDomainTrusted(result.url);

    if (trusted) {
      // Auto-ingest trusted sources
      console.log('Auto-ingesting (trusted):', result.domain, '-', result.title);

      var articleText = await fetchArticleText(result.url);
      if (!articleText || articleText.length < 100) {
        // Use search description as fallback
        articleText = result.title + '. ' + result.description;
      }

      var chunks = chunkText(articleText);
      if (chunks.length === 0) {
        totalSkipped++;
        continue;
      }

      var embeddings = await embedChunks(chunks);
      var vectorCount = await upsertToPinecone(chunks, embeddings, {
        title: result.title,
        url: result.url,
        domain: result.domain,
        urlHash: hashUrl(result.url)
      });

      // Log to ingestion_log
      await supabase.from('ingestion_log').insert({
        source_type: 'web-article',
        source_url: result.url,
        title: result.title,
        status: 'done',
        chunks_created: vectorCount,
        metadata: JSON.stringify({
          domain: result.domain,
          description: result.description,
          trusted: true,
          auto_ingested: true
        })
      });

      totalIngested++;
    } else {
      // Queue untrusted sources for admin review
      console.log('Queuing for review:', result.domain, '-', result.title);

      await supabase.from('ingestion_log').insert({
        source_type: 'web-article',
        source_url: result.url,
        title: result.title,
        status: 'pending-review',
        chunks_created: 0,
        metadata: JSON.stringify({
          domain: result.domain,
          description: result.description,
          trusted: false,
          auto_ingested: false
        })
      });

      totalPending++;
    }
  }

  var summary = {
    discovered: totalDiscovered,
    ingested: totalIngested,
    pendingReview: totalPending,
    skipped: totalSkipped
  };

  console.log('Web ingestion complete:', JSON.stringify(summary));

  return {
    statusCode: 200,
    body: JSON.stringify(summary)
  };
};
