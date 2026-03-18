/* ── Ask Elijah — File Upload & Processing ── */
const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

let pinecone, pineconeIndex, supabase, openai;

function initClients() {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    pineconeIndex = pinecone.index(process.env.PINECONE_INDEX || 'askelijah');
  }
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
}

// ── Chunk text into overlapping segments ──
function chunkText(text, maxTokens, overlap) {
  maxTokens = maxTokens || 500;
  overlap = overlap || 50;
  // Rough: 1 token ≈ 4 chars
  var maxChars = maxTokens * 4;
  var overlapChars = overlap * 4;
  var chunks = [];
  var start = 0;

  while (start < text.length) {
    var end = start + maxChars;
    var chunk = text.slice(start, end);

    // Try to break on sentence boundary
    if (end < text.length) {
      var lastPeriod = chunk.lastIndexOf('. ');
      var lastNewline = chunk.lastIndexOf('\n');
      var breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > maxChars * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
        end = start + breakPoint + 1;
      }
    }

    chunks.push(chunk.trim());
    start = end - overlapChars;
  }

  return chunks.filter(function (c) { return c.length > 20; });
}

// ── Embed text chunks via Voyage AI ──
async function embedChunks(chunks) {
  // Voyage AI supports batch embedding
  var batchSize = 20;
  var allEmbeddings = [];

  for (var i = 0; i < chunks.length; i += batchSize) {
    var batch = chunks.slice(i, i + batchSize);
    var res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.VOYAGE_API_KEY
      },
      body: JSON.stringify({ input: batch, model: 'voyage-3-lite' })
    });
    var data = await res.json();
    var embeddings = data.data.map(function (d) { return d.embedding; });
    allEmbeddings = allEmbeddings.concat(embeddings);
  }

  return allEmbeddings;
}

// ── Transcribe audio/video via Whisper ──
async function transcribeAudio(buffer, filename) {
  var file = new File([buffer], filename, { type: 'audio/mpeg' });
  var transcription = await openai.audio.transcriptions.create({
    file: file,
    model: 'whisper-1',
    response_format: 'text'
  });
  return transcription;
}

// ── Process and store ──
async function processAndStore(text, metadata) {
  var chunks = chunkText(text);
  var embeddings = await embedChunks(chunks);

  // Upsert to Pinecone
  var vectors = chunks.map(function (chunk, i) {
    return {
      id: metadata.source_id + '-chunk-' + i,
      values: embeddings[i],
      metadata: {
        text: chunk,
        title: metadata.title || '',
        url: metadata.url || '',
        source_type: metadata.source_type || 'upload',
        source_id: metadata.source_id || '',
        chunk_index: i
      }
    };
  });

  // Batch upsert (Pinecone limit: 100 per request)
  for (var i = 0; i < vectors.length; i += 100) {
    await pineconeIndex.upsert(vectors.slice(i, i + 100));
  }

  return chunks.length;
}

// ── Main handler ──
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Simple admin auth check
  var authHeader = event.headers.authorization || '';
  if (authHeader !== 'Bearer ' + process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  initClients();

  try {
    var contentType = event.headers['content-type'] || '';
    var body;

    if (contentType.includes('application/json')) {
      // JSON body with base64-encoded file
      body = JSON.parse(event.body);
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Send JSON with base64 file data' }) };
    }

    var fileData = body.file; // base64 string
    var fileName = body.filename || 'upload';
    var fileType = body.type || ''; // 'pdf', 'mp4', 'audio', 'text'
    var title = body.title || fileName;

    var buffer = Buffer.from(fileData, 'base64');
    var text = '';
    var sourceId = 'upload-' + Date.now();

    // Route to appropriate extractor
    if (fileType === 'pdf' || fileName.endsWith('.pdf')) {
      var pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (fileType === 'mp4' || fileType === 'audio' || fileName.match(/\.(mp4|mp3|m4a|wav|webm)$/i)) {
      text = await transcribeAudio(buffer, fileName);
    } else {
      // Treat as plain text
      text = buffer.toString('utf-8');
    }

    if (!text || text.trim().length < 10) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not extract text from file' }) };
    }

    // Process and store
    var chunksCreated = await processAndStore(text, {
      source_id: sourceId,
      title: title,
      source_type: 'upload',
      url: ''
    });

    // Log ingestion
    await supabase.from('ingestion_log').insert({
      source_type: 'upload',
      source_url: fileName,
      status: 'done',
      chunks_created: chunksCreated
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        chunks_created: chunksCreated,
        source_id: sourceId
      })
    };

  } catch (err) {
    console.error('Upload error:', err);

    // Log failure
    if (supabase) {
      await supabase.from('ingestion_log').insert({
        source_type: 'upload',
        source_url: (body && body.filename) || 'unknown',
        status: 'failed',
        chunks_created: 0
      }).catch(function () {});
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Processing failed: ' + err.message })
    };
  }
};
