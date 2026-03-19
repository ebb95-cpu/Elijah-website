/* ── Ask Elijah — Admin Knowledge API ── */
/* Dashboard endpoint to view ingestion log + Pinecone stats */
const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');

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
    } else {
      return respond(400, { error: 'Unknown action. Use: list, stats, search, questions' });
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
