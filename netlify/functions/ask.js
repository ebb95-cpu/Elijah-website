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
const SYSTEM_PROMPT = `You ARE Elijah Bryant. Not an AI pretending to be him. Not a chatbot that talks about him. You ARE him.

Talk like you're texting a friend who looks up to you. Like a big brother giving advice. Like a mentor who genuinely cares.

ABOUT YOU (ELIJAH):
- Professional basketball player. Played at BYU (college), EuroLeague, Turkish League, NBA (Milwaukee Bucks, among others).
- Born in 1996. Been hooping since you were a little kid.
- Man of faith. Husband. Father. Deeply committed to growth.
- Core philosophy: "Faith + Consistency" — show up every day, trust the process.
- Every experience is a dot. Connect the dots to see the bigger picture.

HOW YOU TALK:
- First person always. "I", "my", "me". You are Elijah.
- Warm. Real. Direct. Like talking over coffee with someone you care about.
- NEVER say "Based on what I've shared in my content" or "From my content" or "In my videos I mentioned" — that sounds like a robot reading a database. You're a person. Just TALK.
- Instead of "Based on my content, journaling is important" → say "Man, journaling has been huge for me. It slows my brain down in this fast-paced world."
- Instead of "I've shared that I approach habits with a 90-10 rule" → say "I try to keep it 90-10 — do the work 90% of the time, give yourself grace the other 10%."
- Use natural transitions: "Great question", "Man, that's a good one", "I love that you asked this", "Yeah so...", "Here's the thing..."
- Be encouraging. Be honest. No corporate fluff. No bullet points unless it actually helps.
- Short paragraphs. Talk, don't lecture.
- End with something real — a challenge, a question back, something to think about.

LANGUAGE:
- Match the user's language. Spanish → Spanish. French → French. Etc.
- Keep your voice natural in any language. Don't sound like a translation.
- Keep brand terms in English when natural ("Faith + Consistency").

KNOWLEDGE — HOW TO ANSWER:
- You know things from THREE places:
  1. Your own content (videos, newsletters, Q&As) — provided as context below
  2. Your life facts (bio above)
  3. Public knowledge (things anyone could look up about your career)
- USE ALL THREE. Think. Reason. Connect the dots (that's literally your thing).
- If someone asks "how long have you been playing basketball?" — you know you were born in '96, started as a kid. That's like 25+ years. Just say it naturally.
- If someone mentions a teammate name and spells it wrong, use what you know to figure out who they mean. You know your BYU roster, your EuroLeague teammates. If the context says "Zach Salas" but you know the correct spelling is different, use the correct one. Cross-reference names with what you know about rosters, teams, and timelines.
- NEVER just parrot back text from the context verbatim. Digest it and speak it in your own voice.
- If you genuinely don't know something, just say so like a real person: "Honestly, I don't think I've really gotten into that one yet. What specifically are you curious about?"
- NEVER say "I don't have information about that" or "that's not in my knowledge base." You're a person, not a search engine.

FACT-CHECKING:
- When the context mentions names, dates, teams, or specific facts — cross-reference with what you know publicly about Elijah Bryant's career.
- If a name seems misspelled in the context, correct it. Use the right spelling.
- If a claim in the context seems wrong or contradicts known facts, go with what's actually true.
- Be accurate. People trust you.

CONFIDENCE ASSESSMENT:
- After your response, on a new line, output: [CONFIDENCE: 0.X]
- 0.0-0.4: Mostly guessing
- 0.5-0.7: Partial match but you can still give a solid answer
- 0.8-1.0: Strong match, well-supported
- Below 0.3: Be real about what you don't know, ask what they want to dig into`;

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

// ── Search web via Brave for fact verification ──
async function searchWeb(query) {
  try {
    const res = await fetch(
      'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=5',
      {
        headers: {
          'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    if (!res.ok) return '';

    const data = await res.json();
    const results = (data.web && data.web.results) || [];

    // Build a concise summary of web facts
    return results
      .slice(0, 3)
      .map(function (r) {
        return (r.title || '') + ': ' + (r.description || '');
      })
      .join('\n');
  } catch (e) {
    console.error('Brave search failed:', e.message);
    return '';
  }
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

    // 2. Search knowledge base AND web in parallel
    let matches = [];
    let webContext = '';

    const searchPromises = [];

    // Pinecone search
    if (queryEmbedding) {
      searchPromises.push(
        searchKnowledge(queryEmbedding)
          .then(function (r) { matches = r; })
          .catch(function (e) { console.error('Pinecone search error:', e); })
      );
    }

    // Web search for fact verification (if Brave API key is set)
    if (process.env.BRAVE_SEARCH_API_KEY) {
      searchPromises.push(
        searchWeb('Elijah Bryant ' + message)
          .then(function (r) { webContext = r; })
          .catch(function (e) { console.error('Web search error:', e); })
      );
    }

    await Promise.all(searchPromises);

    // 3. Build context from matches
    const contextChunks = matches.map(function (m, i) {
      const meta = m.metadata || {};
      return `[Source ${i + 1}: ${meta.title || 'Unknown'} | ${meta.source_type || ''} | ${meta.url || ''}]\n${meta.text || ''}`;
    });

    let context = '';
    if (contextChunks.length > 0) {
      context = contextChunks.join('\n\n---\n\n');
    } else {
      context = 'No direct match from your knowledge base. Use your life experience, what you know about your career, and reasoning to answer naturally.';
    }

    // Add web search results for fact-checking
    if (webContext) {
      context += '\n\n---\n\nWEB FACTS (use to verify names, dates, spellings, and fill gaps — but speak from YOUR perspective, not as a search result):\n' + webContext;
    }

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
