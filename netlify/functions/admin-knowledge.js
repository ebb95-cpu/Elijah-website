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
    } else if (action === 'upload-file') {
      var body = JSON.parse(event.body || '{}');
      return await handleUploadFile(body);
    } else if (action === 'insights') {
      var body = JSON.parse(event.body || '{}');
      return await handleInsights(body);
    } else {
      return respond(400, { error: 'Unknown action' });
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

// ── Save a knowledge item (Q&A, Manual) — saves to DB AND embeds into Pinecone ──
async function handleSaveItem(body) {
  var title = body.title;
  if (!title) return respond(400, { error: 'title is required' });

  var content = body.content || '';
  var row = {
    title: title,
    type: body.type || 'Manual',
    content: content || null,
    source_url: body.source_url || null,
    status: 'processing',
    word_count: body.word_count || 0,
    updated_at: new Date().toISOString()
  };

  var itemId;
  if (body.id) {
    var { data, error } = await supabase.from('knowledge_items')
      .update(row).eq('id', body.id).select('id').single();
    if (error) return respond(500, { error: error.message });
    itemId = data ? data.id : body.id;
  } else {
    var { data, error } = await supabase.from('knowledge_items')
      .insert(row).select('id').single();
    if (error) return respond(500, { error: error.message });
    itemId = data ? data.id : null;
  }

  // Embed content into Pinecone so the chatbot can find it
  var chunksCreated = 0;
  if (content && content.trim().length > 10) {
    try {
      // For Q&A, combine question + answer for better semantic search
      var textToEmbed = content;
      if (body.type === 'Q&A') {
        textToEmbed = 'Question: ' + title + '\n\nAnswer: ' + content;
      }

      var chunks = chunkText(textToEmbed);
      var embeddings = await embedChunks(chunks);

      var sourceId = 'ki-' + itemId;
      var vectors = chunks.map(function (chunk, i) {
        return {
          id: sourceId + '-chunk-' + i,
          values: embeddings[i],
          metadata: {
            text: chunk,
            title: title,
            url: '',
            source_type: body.type === 'Q&A' ? 'qa' : 'manual',
            source_id: sourceId,
            chunk_index: i
          }
        };
      });

      for (var i = 0; i < vectors.length; i += 100) {
        await pineconeIndex.upsert(vectors.slice(i, i + 100));
      }

      chunksCreated = chunks.length;
    } catch (embErr) {
      console.error('Embedding failed for item:', itemId, embErr.message);
      // Still save the item, just mark as attention
      await supabase.from('knowledge_items')
        .update({ status: 'attention', updated_at: new Date().toISOString() })
        .eq('id', itemId);
      return respond(200, { success: true, id: itemId, warning: 'Saved but embedding failed: ' + embErr.message });
    }
  }

  // Mark as completed
  await supabase.from('knowledge_items')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', itemId);

  return respond(200, { success: true, id: itemId, chunks_created: chunksCreated });
}

// ── Upload and process a file (PDF, audio, text) ──
async function handleUploadFile(body) {
  var fileData = body.file; // base64 string
  var fileName = body.filename || 'upload';
  var fileType = body.type || '';
  var title = body.title || fileName;

  if (!fileData) return respond(400, { error: 'file (base64) is required' });

  var buffer = Buffer.from(fileData, 'base64');
  var text = '';
  var sourceId = 'upload-' + Date.now();

  // Route to appropriate extractor
  if (fileType === 'pdf' || fileName.endsWith('.pdf')) {
    var pdfParse = require('pdf-parse');
    var pdfData = await pdfParse(buffer);
    text = pdfData.text;
  } else if (fileType === 'audio' || fileName.match(/\.(mp4|mp3|m4a|wav|webm)$/i)) {
    // Transcribe via OpenAI Whisper
    var OpenAI = require('openai');
    var openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    var file = new File([buffer], fileName, { type: 'audio/mpeg' });
    text = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      response_format: 'text'
    });
  } else {
    // Treat as plain text
    text = buffer.toString('utf-8');
  }

  if (!text || text.trim().length < 10) {
    return respond(400, { error: 'Could not extract text from file' });
  }

  // Chunk, embed, store in Pinecone
  var chunks = chunkText(text);
  var embeddings = await embedChunks(chunks);

  var vectors = chunks.map(function (chunk, i) {
    return {
      id: sourceId + '-chunk-' + i,
      values: embeddings[i],
      metadata: {
        text: chunk,
        title: title,
        url: '',
        source_type: 'upload',
        source_id: sourceId,
        chunk_index: i
      }
    };
  });

  for (var i = 0; i < vectors.length; i += 100) {
    await pineconeIndex.upsert(vectors.slice(i, i + 100));
  }

  // Log ingestion
  await supabase.from('ingestion_log').insert({
    source_type: 'upload',
    source_url: fileName,
    status: 'done',
    chunks_created: chunks.length
  });

  return respond(200, {
    success: true,
    chunks_created: chunks.length,
    source_id: sourceId
  });
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

// ── Insights data for the dashboard ──
async function handleInsights(body) {
  var days = body.days || 30;
  var now = new Date();
  var startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  var priorStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch current period questions
  var { data: currentQuestions } = await supabase
    .from('questions')
    .select('id, user_id, created_at')
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });
  currentQuestions = currentQuestions || [];

  // Fetch prior period questions for comparison
  var { data: priorQuestions } = await supabase
    .from('questions')
    .select('id, user_id, created_at')
    .gte('created_at', priorStart)
    .lt('created_at', startDate);
  priorQuestions = priorQuestions || [];

  // Group current questions by date for chart
  var dailyCounts = {};
  currentQuestions.forEach(function (q) {
    var date = q.created_at.substring(0, 10);
    dailyCounts[date] = (dailyCounts[date] || 0) + 1;
  });

  // Fill in missing dates with 0
  var chartData = [];
  for (var d = 0; d < days; d++) {
    var date = new Date(now.getTime() - (days - 1 - d) * 24 * 60 * 60 * 1000);
    var dateStr = date.toISOString().substring(0, 10);
    chartData.push({ date: dateStr, count: dailyCounts[dateStr] || 0 });
  }

  // Active visitors (unique user_ids)
  var currentVisitors = new Set(currentQuestions.map(function (q) { return q.user_id; })).size;
  var priorVisitors = new Set(priorQuestions.map(function (q) { return q.user_id; })).size;

  // Total messages
  var currentMessages = currentQuestions.length;
  var priorMessages = priorQuestions.length;

  // Percentage change helper
  function pctChange(current, prior) {
    if (prior === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prior) / prior) * 100);
  }

  // Avg session duration estimate (time between first and last question per user per day)
  var sessionDurations = [];
  var userDayMap = {};
  currentQuestions.forEach(function (q) {
    var key = q.user_id + '-' + q.created_at.substring(0, 10);
    if (!userDayMap[key]) userDayMap[key] = [];
    userDayMap[key].push(new Date(q.created_at).getTime());
  });
  Object.values(userDayMap).forEach(function (times) {
    if (times.length >= 2) {
      var sorted = times.sort();
      sessionDurations.push(sorted[sorted.length - 1] - sorted[0]);
    }
  });
  var avgDurationMs = sessionDurations.length > 0
    ? sessionDurations.reduce(function (a, b) { return a + b; }, 0) / sessionDurations.length
    : 0;
  var avgDurationSec = Math.round(avgDurationMs / 1000);

  // Prior period avg duration
  var priorUserDayMap = {};
  priorQuestions.forEach(function (q) {
    var key = q.user_id + '-' + q.created_at.substring(0, 10);
    if (!priorUserDayMap[key]) priorUserDayMap[key] = [];
    priorUserDayMap[key].push(new Date(q.created_at).getTime());
  });
  var priorDurations = [];
  Object.values(priorUserDayMap).forEach(function (times) {
    if (times.length >= 2) {
      var sorted = times.sort();
      priorDurations.push(sorted[sorted.length - 1] - sorted[0]);
    }
  });
  var priorAvgSec = priorDurations.length > 0
    ? Math.round(priorDurations.reduce(function (a, b) { return a + b; }, 0) / priorDurations.length / 1000)
    : 0;

  // Mind score — cumulative knowledge score
  var stats = await pineconeIndex.describeIndexStats();
  var totalVectors = stats.totalRecordCount || 0;

  // Count total ingested sources
  var { data: ingestedSources } = await supabase
    .from('ingestion_log')
    .select('source_type, chunks_created')
    .eq('status', 'done');
  ingestedSources = ingestedSources || [];

  var totalChunks = ingestedSources.reduce(function (s, r) { return s + (r.chunks_created || 0); }, 0);

  // Knowledge score: vectors * 10 + chunks * 5 + sources * 100
  var mindScore = totalVectors * 10 + totalChunks * 5 + ingestedSources.length * 100;

  // Ingestion by type
  var ingestionByType = {};
  ingestedSources.forEach(function (r) {
    ingestionByType[r.source_type] = (ingestionByType[r.source_type] || 0) + 1;
  });

  // Also count knowledge_items
  var { data: knowledgeItems } = await supabase
    .from('knowledge_items')
    .select('type')
    .in('status', ['completed']);
  (knowledgeItems || []).forEach(function (ki) {
    var t = (ki.type || 'manual').toLowerCase();
    ingestionByType[t] = (ingestionByType[t] || 0) + 1;
  });

  // All-time total questions
  var { data: allTimeQuestions } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true });

  // All-time total users
  var { data: allTimeUsers } = await supabase
    .from('user_profiles')
    .select('user_id', { count: 'exact', head: true });

  return respond(200, {
    chart: chartData,
    conversations: {
      current: currentMessages,
      prior: priorMessages,
      change: pctChange(currentMessages, priorMessages)
    },
    activeVisitors: {
      current: currentVisitors,
      prior: priorVisitors,
      change: pctChange(currentVisitors, priorVisitors)
    },
    totalMessages: {
      current: currentMessages,
      prior: priorMessages,
      change: pctChange(currentMessages, priorMessages)
    },
    avgDuration: {
      seconds: avgDurationSec,
      change: pctChange(avgDurationSec, priorAvgSec)
    },
    mindScore: mindScore,
    totalVectors: totalVectors,
    totalChunks: totalChunks,
    totalSources: ingestedSources.length,
    ingestionByType: ingestionByType,
    days: days
  });
}

// ── Add a knowledge source and immediately start ingestion ──
async function handleAddSource(body) {
  var sourceType = body.source_type;
  var url = body.url;
  if (!sourceType || !url) {
    return respond(400, { error: 'source_type and url are required' });
  }

  if (sourceType === 'youtube-channel') {
    return await ingestYouTubeChannel(url);
  } else if (sourceType === 'newsletter') {
    return await ingestNewsletter(url);
  } else if (sourceType === 'twitter') {
    // Save as source — the daily cron handles Twitter
    var { data, error } = await supabase.from('knowledge_items').insert({
      title: 'Twitter: ' + url,
      type: 'Twitter',
      content: null,
      source_url: url,
      status: 'completed',
      word_count: 0,
      updated_at: new Date().toISOString()
    }).select('id').single();
    if (error) return respond(500, { error: error.message });
    return respond(200, { success: true, id: data ? data.id : null });
  }

  return respond(400, { error: 'Unknown source_type: ' + sourceType });
}

// ── Ingest entire YouTube channel ──
async function ingestYouTubeChannel(url) {
  // Extract channel ID from various URL formats
  var channelId = await resolveChannelId(url);
  if (!channelId) {
    return respond(400, { error: 'Could not resolve YouTube channel ID from: ' + url });
  }

  // Save the channel as a source in knowledge_items
  await supabase.from('knowledge_items').upsert({
    title: 'YouTube Channel: ' + url,
    type: 'YouTube Channel',
    content: null,
    source_url: url,
    status: 'processing',
    word_count: 0,
    updated_at: new Date().toISOString()
  }, { onConflict: 'source_url' });

  // Fetch all videos from channel RSS
  var videos = await fetchChannelVideos(channelId);
  var processed = 0;
  var skipped = 0;
  var errors = 0;

  for (var v of videos) {
    // Skip already ingested
    var { data: existing } = await supabase
      .from('ingestion_log')
      .select('id')
      .eq('source_url', v.url)
      .eq('status', 'done')
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    try {
      await ingestSingleVideo(v.videoId, v.title, v.url);
      processed++;
    } catch (err) {
      console.error('Failed to ingest video:', v.videoId, err.message);
      errors++;
      await supabase.from('ingestion_log').insert({
        source_type: 'youtube',
        source_url: v.url,
        status: 'failed',
        chunks_created: 0
      });
    }
  }

  // Update channel source status
  await supabase.from('knowledge_items')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('source_url', url);

  return respond(200, {
    success: true,
    channelId: channelId,
    totalVideos: videos.length,
    processed: processed,
    skipped: skipped,
    errors: errors
  });
}

// ── Ingest Beehiiv newsletter ──
async function ingestNewsletter(url) {
  // Normalize URL and find RSS feed
  var feedUrl = resolveNewsletterFeed(url);

  // Save the newsletter as a source
  await supabase.from('knowledge_items').upsert({
    title: 'Newsletter: ' + url,
    type: 'Newsletter',
    content: null,
    source_url: url,
    status: 'processing',
    word_count: 0,
    updated_at: new Date().toISOString()
  }, { onConflict: 'source_url' });

  // Fetch RSS
  var res = await fetch(feedUrl);
  if (!res.ok) {
    await supabase.from('knowledge_items')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('source_url', url);
    return respond(400, { error: 'Could not fetch newsletter RSS at: ' + feedUrl });
  }

  var xml = await res.text();
  var posts = parseNewsletterRSS(xml);

  var processed = 0;
  var skipped = 0;
  var errors = 0;

  for (var post of posts) {
    // Skip already ingested
    var { data: existing } = await supabase
      .from('ingestion_log')
      .select('id')
      .eq('source_url', post.url)
      .eq('status', 'done')
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    try {
      // Strip HTML tags from content
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

      processed++;
    } catch (err) {
      console.error('Failed to ingest newsletter post:', post.url, err.message);
      errors++;
      await supabase.from('ingestion_log').insert({
        source_type: 'newsletter',
        source_url: post.url,
        status: 'failed',
        chunks_created: 0
      });
    }
  }

  // Update source status
  await supabase.from('knowledge_items')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('source_url', url);

  return respond(200, {
    success: true,
    totalPosts: posts.length,
    processed: processed,
    skipped: skipped,
    errors: errors
  });
}

// ── Helper: resolve YouTube channel ID from URL, handle, or raw ID ──
async function resolveChannelId(input) {
  input = input.trim();
  // Already a channel ID (UC...)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(input)) return input;

  // Extract from youtube.com/channel/UCxxxxxx
  var m = input.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (m) return m[1];

  // Handle @username or youtube.com/@username
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
      if (data.items && data.items.length > 0) {
        return data.items[0].id;
      }
      // Fallback: try search by username
      apiUrl = 'https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=' + encodeURIComponent(handle) + '&key=' + process.env.YOUTUBE_API_KEY;
      res = await fetch(apiUrl);
      data = await res.json();
      if (data.items && data.items.length > 0) {
        return data.items[0].id;
      }
    } catch (e) {
      console.error('YouTube API resolve failed for @' + handle, e.message);
    }
  }

  // Method 2: Scrape the YouTube page (fallback if no API key)
  if (handle) {
    try {
      var res = await fetch('https://www.youtube.com/@' + handle, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      var html = await res.text();
      var cidMatch = html.match(/\"channelId\":\"(UC[a-zA-Z0-9_-]{22})\"/);
      if (cidMatch) return cidMatch[1];
      // Also try externalId pattern
      cidMatch = html.match(/\"externalId\":\"(UC[a-zA-Z0-9_-]{22})\"/);
      if (cidMatch) return cidMatch[1];
    } catch (e) {
      console.error('Failed to scrape @' + handle, e.message);
    }
  }

  // Method 3: Try treating the whole input as a channel URL
  try {
    var res = await fetch(input, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    var html = await res.text();
    var cidMatch = html.match(/\"channelId\":\"(UC[a-zA-Z0-9_-]{22})\"/);
    if (cidMatch) return cidMatch[1];
  } catch (e) {}

  return null;
}

// ── Helper: fetch all videos from a YouTube channel RSS ──
async function fetchChannelVideos(channelId) {
  var rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
  var res = await fetch(rssUrl);
  var xml = await res.text();

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

// ── Helper: ingest a single video (transcript → chunk → embed → Pinecone) ──
async function ingestSingleVideo(videoId, title, videoUrl) {
  await supabase.from('ingestion_log').insert({
    source_type: 'youtube',
    source_url: videoUrl,
    status: 'processing',
    chunks_created: 0
  });

  var transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
  var fullTranscript = transcriptItems.map(function (t) { return t.text; }).join(' ');

  if (fullTranscript.length < 50) {
    await supabase.from('ingestion_log')
      .update({ status: 'failed' })
      .eq('source_url', videoUrl)
      .eq('status', 'processing');
    return;
  }

  var chunks = chunkText(fullTranscript);
  var embeddings = await embedChunks(chunks);

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

  await supabase.from('ingestion_log')
    .update({ status: 'done', chunks_created: chunks.length })
    .eq('source_url', videoUrl)
    .eq('status', 'processing');
}

// ── Helper: resolve newsletter RSS feed URL ──
function resolveNewsletterFeed(url) {
  url = url.trim().replace(/\/$/, '');
  // If it already ends with /feed or /rss, use as-is
  if (/\/(feed|rss)$/i.test(url)) return url;
  // Beehiiv pattern
  if (url.includes('beehiiv.com')) return url + '/feed';
  // Substack pattern
  if (url.includes('substack.com')) return url + '/feed';
  // Generic: try /feed
  return url + '/feed';
}

// ── Helper: parse newsletter RSS XML ──
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

// ── Helper: simple string hash for generating IDs ──
function hashString(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
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
    .in('type', ['YouTube', 'YouTube Channel', 'Twitter', 'Instagram', 'Newsletter'])
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
