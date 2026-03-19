/* ── Ask Elijah — Admin Knowledge API ── */
/* Dashboard endpoint to view ingestion log + Pinecone stats */
const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');
const { YoutubeTranscript } = require('youtube-transcript');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

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

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body)
  };
}

// ── Auth check — verify Supabase JWT and admin email ──
async function verifyAdmin(event) {
  var authHeader = event.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return false;

  try {
    var { data } = await supabase.auth.getUser(token);
    return data && data.user && data.user.email === process.env.ADMIN_EMAIL;
  } catch (e) {
    return false;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  initClients();

  // Auth check
  var isAdmin = await verifyAdmin(event);
  if (!isAdmin) {
    return respond(401, { error: 'Unauthorized' });
  }

  var action = event.queryStringParameters && event.queryStringParameters.action;

  try {
    if (action === 'list') {
      return await handleList();
    } else if (action === 'stats') {
      return await handleStats();
    } else if (action === 'search') {
      var body = JSON.parse(event.body || '{}');
      return await handleSearch(body.query);
    } else if (action === 'questions') {
      return await handleQuestions();
    } else if (action === 'add-source') {
      var body = JSON.parse(event.body || '{}');
      return await handleAddSource(body);
    } else if (action === 'ingest-video') {
      var body = JSON.parse(event.body || '{}');
      return await handleIngestVideo(body);
    } else if (action === 'list-sources') {
      return await handleListSources();
    } else if (action === 'save-item') {
      var body = JSON.parse(event.body || '{}');
      return await handleSaveItem(body);
    } else if (action === 'delete-item') {
      var body = JSON.parse(event.body || '{}');
      return await handleDeleteItem(body);
    } else {
      return respond(400, { error: 'Unknown action. Use: list, stats, search, questions, add-source, ingest-video, list-sources, save-item, delete-item' });
    }
  } catch (err) {
    console.error('Admin knowledge error:', err);
    return respond(500, { error: err.message });
  }
};

// ── List all ingestion log entries ──
async function handleList() {
  var { data: items, error } = await supabase
    .from('ingestion_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return respond(500, { error: error.message });

  // Also get knowledge_items if any
  var { data: manualItems } = await supabase
    .from('knowledge_items')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200);

  return respond(200, {
    ingestion_log: items || [],
    knowledge_items: manualItems || [],
    total: (items || []).length + (manualItems || []).length
  });
}

// ── Pinecone index stats ──
async function handleStats() {
  var stats = await pineconeIndex.describeIndexStats();

  // Count by source type from ingestion log
  var { data: typeCounts } = await supabase
    .from('ingestion_log')
    .select('source_type, status')
    .eq('status', 'done');

  var byType = {};
  (typeCounts || []).forEach(function (row) {
    byType[row.source_type] = (byType[row.source_type] || 0) + 1;
  });

  return respond(200, {
    pinecone: {
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || 0,
      namespaces: stats.namespaces || {}
    },
    ingestion: {
      byType: byType,
      totalSources: (typeCounts || []).length
    }
  });
}

// ── Search Pinecone vectors by text (for debugging) ──
async function handleSearch(query) {
  if (!query) return respond(400, { error: 'query is required' });

  // Embed via Voyage
  var res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.VOYAGE_API_KEY
    },
    body: JSON.stringify({ input: [query], model: 'voyage-3-lite' })
  });
  var embData = await res.json();
  var embedding = embData.data[0].embedding;

  // Query Pinecone
  var results = await pineconeIndex.query({
    vector: embedding,
    topK: 10,
    includeMetadata: true
  });

  var matches = (results.matches || []).map(function (m) {
    return {
      id: m.id,
      score: m.score,
      title: m.metadata && m.metadata.title,
      text: m.metadata && m.metadata.text,
      url: m.metadata && m.metadata.url,
      source_type: m.metadata && m.metadata.source_type
    };
  });

  return respond(200, { matches: matches });
}

// ── Recent questions asked ──
async function handleQuestions() {
  var { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return respond(500, { error: error.message });
  return respond(200, { questions: data || [] });
}

// ── Save a knowledge item (Q&A, Manual) — uses service key to bypass RLS ──
async function handleSaveItem(body) {
  var title = body.title;
  if (!title) return respond(400, { error: 'title is required' });

  var row = {
    title: title,
    type: body.type || 'Manual',
    content: body.content || null,
    source_url: body.source_url || null,
    status: body.status || 'completed',
    word_count: body.word_count || 0,
    updated_at: new Date().toISOString()
  };

  if (body.id) {
    // Update existing
    var { data, error } = await supabase.from('knowledge_items')
      .update(row).eq('id', body.id).select('id').single();
    if (error) return respond(500, { error: error.message });
    return respond(200, { success: true, id: data ? data.id : body.id });
  } else {
    // Insert new
    var { data, error } = await supabase.from('knowledge_items')
      .insert(row).select('id').single();
    if (error) return respond(500, { error: error.message });
    return respond(200, { success: true, id: data ? data.id : null });
  }
}

// ── Delete a knowledge item ──
async function handleDeleteItem(body) {
  var id = body.id;
  var source = body.source || 'knowledge_items';
  if (!id) return respond(400, { error: 'id is required' });

  var table = source === 'ingestion_log' ? 'ingestion_log' : 'knowledge_items';
  var { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return respond(500, { error: error.message });
  return respond(200, { success: true });
}

// ── Add a knowledge source (YouTube channel, Twitter, etc.) ──
async function handleAddSource(body) {
  var sourceType = body.source_type;
  var url = body.url;
  if (!sourceType || !url) {
    return respond(400, { error: 'source_type and url are required' });
  }

  // Store in knowledge_items as a source entry
  var title = url;
  if (sourceType === 'youtube-channel') {
    title = 'YouTube Channel: ' + url;
  } else if (sourceType === 'twitter') {
    title = 'Twitter: ' + url;
  }

  var { data, error } = await supabase.from('knowledge_items').insert({
    title: title,
    type: sourceType === 'youtube-channel' ? 'YouTube' : sourceType === 'twitter' ? 'Twitter' : sourceType,
    content: null,
    source_url: url,
    status: 'completed',
    word_count: 0,
    updated_at: new Date().toISOString()
  }).select('id').single();

  if (error) return respond(500, { error: error.message });
  return respond(200, { success: true, id: data ? data.id : null });
}

// ── Ingest a single YouTube video ──
async function handleIngestVideo(body) {
  var url = body.url;
  if (!url) return respond(400, { error: 'url is required' });

  // Extract video ID from URL
  var videoId = extractVideoId(url);
  if (!videoId) return respond(400, { error: 'Could not extract video ID from URL' });

  // Check if already ingested
  var { data: existing } = await supabase
    .from('ingestion_log')
    .select('id')
    .eq('source_url', 'https://www.youtube.com/watch?v=' + videoId)
    .eq('status', 'done')
    .limit(1);

  if (existing && existing.length > 0) {
    return respond(200, { success: true, message: 'Video already ingested', alreadyExists: true });
  }

  // Log as processing
  var videoUrl = 'https://www.youtube.com/watch?v=' + videoId;
  await supabase.from('ingestion_log').insert({
    source_type: 'youtube',
    source_url: videoUrl,
    status: 'processing',
    chunks_created: 0
  });

  try {
    // 1. Fetch transcript
    var transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    var fullTranscript = transcriptItems.map(function (t) { return t.text; }).join(' ');

    if (fullTranscript.length < 50) {
      await supabase.from('ingestion_log')
        .update({ status: 'failed' })
        .eq('source_url', videoUrl)
        .eq('status', 'processing');
      return respond(400, { error: 'Transcript too short or empty' });
    }

    // 2. Chunk text
    var chunks = chunkText(fullTranscript);

    // 3. Embed via Voyage AI
    var embeddings = await embedChunks(chunks);

    // 4. Upsert to Pinecone
    var title = body.title || 'YouTube: ' + videoId;
    var vectors = chunks.map(function (chunk, i) {
      return {
        id: 'yt-' + videoId + '-chunk-' + i,
        values: embeddings[i],
        metadata: {
          text: chunk,
          title: title,
          url: videoUrl,
          source_type: 'youtube',
          source_id: videoId,
          chunk_index: i
        }
      };
    });

    for (var i = 0; i < vectors.length; i += 100) {
      await pineconeIndex.upsert(vectors.slice(i, i + 100));
    }

    // 5. Update ingestion log
    await supabase.from('ingestion_log')
      .update({ status: 'done', chunks_created: chunks.length })
      .eq('source_url', videoUrl)
      .eq('status', 'processing');

    return respond(200, {
      success: true,
      videoId: videoId,
      chunks_created: chunks.length,
      transcript_length: fullTranscript.length
    });
  } catch (err) {
    // Update log to failed
    await supabase.from('ingestion_log')
      .update({ status: 'failed' })
      .eq('source_url', videoUrl)
      .eq('status', 'processing');
    throw err;
  }
}

// ── List all configured knowledge sources ──
async function handleListSources() {
  // Return knowledge_items that are source-type entries (YouTube channels, Twitter accounts)
  var { data, error } = await supabase
    .from('knowledge_items')
    .select('*')
    .in('type', ['YouTube', 'Twitter', 'Instagram'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return respond(500, { error: error.message });
  return respond(200, { sources: data || [] });
}

// ── Helper: extract YouTube video ID from various URL formats ──
function extractVideoId(url) {
  if (!url) return null;
  // Handle youtu.be/ID
  var m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // Handle youtube.com/watch?v=ID
  m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // Handle youtube.com/embed/ID
  m = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // Handle bare video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

// ── Helper: chunk text into overlapping segments ──
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

// ── Helper: embed chunks via Voyage AI ──
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
