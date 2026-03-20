/* ── Ask Elijah — Chat API Endpoint ── */
const Anthropic = require('@anthropic-ai/sdk');
const { Pinecone } = require('@pinecone-database/pinecone');
const { createClient } = require('@supabase/supabase-js');

// ── CORS headers for all responses ──
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// ── Clients (lazy init) ──
let anthropic, pinecone, pineconeIndex, supabase;

const PINECONE_HOST = 'https://askelijah-5jj8obh.svc.aped-4627-b74a.pinecone.io';

function initClients() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  if (!pineconeIndex) {
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    // Pass the host explicitly so the SDK does not need a describe-index call
    pineconeIndex = pinecone.index(
      process.env.PINECONE_INDEX || 'askelijah',
      PINECONE_HOST
    );
  }
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
}

// ── Persona System Prompt ──
const SYSTEM_PROMPT = `You are Elijah Bryant's AI — a digital version of Elijah that answers questions based on his actual content, experiences, and perspective.

ABOUT ELIJAH:
- Elijah Bryant is a professional basketball player. He has played internationally and in the NBA.
- He is a man of faith, husband, father, and someone deeply committed to personal growth.
- His core philosophy is "Faith + Consistency" — showing up every day, trusting the process.
- He played college basketball at BYU. He has played in the EuroLeague, Turkish League, and NBA (Milwaukee Bucks, among others).
- Born in 1996. Started playing basketball as a young kid.

LANGUAGE:
- Detect the language the user is writing in
- ALWAYS respond in the same language the user is using
- If they write in Spanish, respond in Spanish. French → French. Japanese → Japanese. Etc.
- Maintain Elijah's voice and tone in every language
- Elijah's original content is in English — translate your knowledge naturally, don't sound like a translation
- Keep brand terms in English when natural ("Faith + Consistency", "connect the dots")

VOICE & TONE:
- Speak in first person as Elijah ("I", "my", "I've found that...")
- Warm, direct, and real — like talking to a mentor over coffee
- Grounded in faith and consistency — these are core values
- Share from experience, not theory
- Be encouraging but honest — no fluff

BRAND IDENTITY:
- "Faith + Consistency" is the guiding philosophy
- Every experience is a dot — connect the dots to see the bigger picture
- Growth comes from showing up daily, not from one big moment

REASONING & KNOWLEDGE:
- You have THREE sources of knowledge, in priority order:
  1. PRIMARY: The provided context from Elijah's actual content (videos, newsletters, Q&As, documents)
  2. SECONDARY: The biographical facts about Elijah above
  3. TERTIARY: General knowledge (things that are publicly known or can be reasoned about)
- USE ALL THREE to give the best possible answer. Don't just do a keyword match — THINK and REASON.
- If someone asks "how long have you been playing basketball?" — use the bio (born 1996, started as a kid) plus context clues from his content to make an educated estimate. Say something like "I've been playing since I was about 5 or 6 years old, so that's roughly 25 years now."
- If you can REASON an answer from context clues (dates mentioned in videos, career timeline, etc.), do it confidently.
- If your answer involves inference or estimation, be transparent: "Based on what I've shared..." or "From my journey, I'd say..."
- Only say "I haven't talked about that yet" when you truly have NO basis to answer — not even from general knowledge about Elijah's public career.
- Never make up specific quotes, stories, or private experiences Elijah hasn't shared.
- When referencing content, mention the source naturally ("In one of my videos about...")
- If you're partially confident, give the answer AND invite them to ask more: "What specific part of that are you most curious about?"

RESPONSE STYLE:
- Keep responses conversational, not essay-like
- Use short paragraphs
- Share specific examples from the content when relevant
- End with something actionable or thought-provoking when appropriate

CONFIDENCE ASSESSMENT:
- After your response, on a new line, output a confidence score in this exact format:
  [CONFIDENCE: 0.X]
- Score 0.0-0.4: You're mostly guessing, little relevant context found
- Score 0.5-0.7: Partial match, some relevant content but gaps — but you can still reason an answer
- Score 0.8-1.0: Strong match, answer well-supported by Elijah's content
- If confidence is below 0.3, your response should acknowledge the gap and ask the user what specifically they want to know`;

// ── Rate Limiting (in-memory, resets per function instance) ──
const rateLimits = {};
const RATE_LIMIT = 20; // questions per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId) {
  if (!userId) return true;
  const now = Date.now();
  if (!rateLimits[userId] || now - rateLimits[userId].start > RATE_WINDOW) {
    rateLimits[userId] = { start: now, count: 0 };
  }
  rateLimits[userId].count++;
  return rateLimits[userId].count <= RATE_LIMIT;
}

// ── Embed query via Voyage AI ──
async function embedQuery(text) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`
    },
    body: JSON.stringify({
      input: [text],
      model: 'voyage-3-lite'
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`Voyage API error ${res.status}: ${errText}`);
  }

  const data = await res.json();

  if (!data.data || !data.data[0] || !data.data[0].embedding) {
    throw new Error('Voyage API returned no embedding data');
  }

  return data.data[0].embedding;
}

// ── Search Pinecone for relevant chunks ──
async function searchKnowledge(queryEmbedding, topK = 6) {
  const results = await pineconeIndex.query({
    vector: queryEmbedding,
    topK: topK,
    includeMetadata: true
  });
  return results.matches || [];
}

// ── Helper: build a JSON response with CORS ──
function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body)
  };
}

// ── Main handler ──
exports.handler = async function (event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  initClients();

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (parseErr) {
    return respond(400, { error: 'Invalid JSON body' });
  }

  // Handle notify opt-in
  if (body.action === 'notify-opt-in') {
    return handleNotifyOptIn(body);
  }

  // Handle beta share — grant 3 more questions + save feedback
  if (body.action === 'beta-share') {
    return handleBetaShare(body);
  }

  const { message, history, userId } = body;

  if (!message) {
    return respond(400, { error: 'Message is required' });
  }

  // Rate limit check
  if (!checkRateLimit(userId)) {
    return respond(429, { error: "You've asked a lot of questions! Take a breather and come back in a bit." });
  }

  try {
    // 1. Embed the question
    let queryEmbedding;
    try {
      queryEmbedding = await embedQuery(message);
    } catch (embedErr) {
      console.error('Embedding error:', embedErr);
      queryEmbedding = null;
    }

    // 2. Search knowledge base (skip if embedding failed or index is empty)
    let matches = [];
    if (queryEmbedding) {
      try {
        matches = await searchKnowledge(queryEmbedding);
      } catch (searchErr) {
        console.error('Pinecone search error:', searchErr);
        matches = [];
      }
    }

    // 3. Build context from matches
    const contextChunks = matches.map(function (m, i) {
      const meta = m.metadata || {};
      return `[Source ${i + 1}: ${meta.title || 'Unknown'} | ${meta.source_type || ''} | ${meta.url || ''}]\n${meta.text || ''}`;
    });
    const context = contextChunks.length > 0
      ? contextChunks.join('\n\n---\n\n')
      : 'No direct match from the knowledge base for this question. Use your biographical knowledge about Elijah, reasoning, and any context clues from the conversation to give the best possible answer. Stay in character as Elijah. If you truly cannot answer, ask what specifically they want to know.';

    // 4. Build conversation messages
    const messages = [];

    // Add conversation history for memory
    if (history && history.length > 0) {
      // Keep last 10 exchanges for context window management
      const recentHistory = history.slice(-20);
      recentHistory.forEach(function (msg) {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    // Add current question with context
    messages.push({
      role: 'user',
      content: `CONTEXT FROM MY CONTENT:\n${context}\n\n---\n\nUSER QUESTION: ${message}`
    });

    // 5. Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages
    });

    const fullResponse = response.content[0].text;

    // 6. Extract confidence score
    const confidenceMatch = fullResponse.match(/\[CONFIDENCE:\s*([\d.]+)\]/);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
    const cleanResponse = fullResponse.replace(/\n?\[CONFIDENCE:\s*[\d.]+\]/, '').trim();

    // 7. Determine if escalation needed (only escalate when truly uncertain)
    const escalated = confidence < 0.3;

    // 8. Extract sources for citations (deduplicated by URL)
    const sourcesMap = {};
    matches
      .filter(function (m) { return m.score > 0.7 && m.metadata; })
      .forEach(function (m) {
        const meta = m.metadata;
        // Build URL: prefer source_url, fall back to url, construct YouTube URL from video_id
        let url = meta.source_url || meta.url || '';
        if (!url && meta.video_id) {
          url = 'https://youtube.com/watch?v=' + meta.video_id;
        }
        if (!url) return; // skip sources with no URL
        // Deduplicate by URL
        if (!sourcesMap[url]) {
          sourcesMap[url] = {
            title: meta.title || 'Source',
            url: url,
            source_type: meta.source_type || ''
          };
        }
      });
    const sources = Object.values(sourcesMap).slice(0, 5);

    // 9. Log to Supabase (non-blocking — don't let DB errors break the chat)
    let questionId = null;
    try {
      if (userId) {
        const { data } = await supabase.from('questions').insert({
          user_id: userId,
          question_text: message,
          response_text: cleanResponse,
          sources_used: JSON.stringify(sources),
          confidence: confidence,
          status: escalated ? 'needs_elijah' : 'answered',
          notify_user: false
        }).select('id').single();

        if (data) questionId = data.id;

        await supabase.rpc('increment_question_count', { uid: userId }).catch(function () {});
      }
    } catch (dbErr) {
      console.error('Supabase log error:', dbErr);
    }

    return respond(200, {
      response: cleanResponse,
      sources: sources,
      escalated: escalated,
      questionId: questionId
    });

  } catch (err) {
    console.error('Ask API error:', err);
    return respond(500, { error: 'Something went wrong. Please try again.' });
  }
};

// ── Handle beta share — grant 3 more questions + save feedback ──
async function handleBetaShare(body) {
  const { userId, feedback } = body;
  if (!userId) {
    return respond(400, { error: 'Missing userId' });
  }

  try {
    // Check how many times they've already shared (limit to 3 share rounds = 9 bonus questions)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('questions_remaining, share_count')
      .eq('user_id', userId)
      .maybeSingle();

    const shareCount = (profile && profile.share_count) || 0;
    const currentRemaining = (profile && profile.questions_remaining) || 0;

    if (shareCount >= 3) {
      return respond(200, {
        questionsGranted: false,
        questionsRemaining: currentRemaining,
        message: 'Maximum share bonus reached'
      });
    }

    const newRemaining = currentRemaining + 3;
    const newShareCount = shareCount + 1;

    // Update profile with new questions + share count
    await supabase
      .from('user_profiles')
      .update({
        questions_remaining: newRemaining,
        share_count: newShareCount
      })
      .eq('user_id', userId);

    // Save feedback if provided
    if (feedback && feedback.trim()) {
      await supabase
        .from('questions')
        .insert({
          user_id: userId,
          question_text: '[BETA FEEDBACK] ' + feedback.trim(),
          response_text: '',
          sources_used: '[]',
          confidence: 1,
          status: 'feedback',
          notify_user: false
        }).catch(function () {});
    }

    return respond(200, {
      questionsGranted: true,
      questionsRemaining: newRemaining,
      shareCount: newShareCount
    });
  } catch (err) {
    console.error('Beta share error:', err);
    return respond(500, { error: 'Failed to process share' });
  }
}

// ── Handle notification opt-in ──
async function handleNotifyOptIn(body) {
  const { questionId, userId } = body;
  if (!questionId || !userId) {
    return respond(400, { error: 'Missing data' });
  }

  try {
    await supabase.from('questions').update({
      notify_user: true
    }).eq('id', questionId).eq('user_id', userId);

    return respond(200, { success: true });
  } catch (err) {
    return respond(500, { error: 'Failed to opt in' });
  }
}
