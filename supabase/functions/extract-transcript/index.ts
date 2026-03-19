import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { item_id, source_url, type } = await req.json();

    if (!item_id || !source_url || !type) {
      return new Response(
        JSON.stringify({ error: "Missing item_id, source_url, or type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service-role client for DB updates (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    let transcript = "";
    let title = "";

    if (type === "YouTube") {
      const result = await extractYouTube(source_url);
      transcript = result.transcript;
      title = result.title;
    } else if (type === "TikTok") {
      const result = await extractTikTok(source_url);
      transcript = result.transcript;
      title = result.title;
    }

    if (transcript) {
      const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
      await sb.from("knowledge_items").update({
        content: transcript,
        title: title || source_url,
        word_count: wordCount,
        status: "completed",
        updated_at: new Date().toISOString(),
      }).eq("id", item_id);
    } else {
      // Both tiers failed — flag for manual attention
      await sb.from("knowledge_items").update({
        status: "attention",
        content: null,
        updated_at: new Date().toISOString(),
      }).eq("id", item_id);
    }

    return new Response(
      JSON.stringify({ success: true, has_transcript: !!transcript }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("extract-transcript error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================
// YouTube: Tier 1 — Free caption scraping
// ============================================================
async function extractYouTube(
  url: string
): Promise<{ transcript: string; title: string }> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return { transcript: "", title: "" };

  let transcript = "";
  let title = "";

  try {
    // Fetch the YouTube watch page
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      title = titleMatch[1].replace(" - YouTube", "").trim();
    }

    // Extract captions from ytInitialPlayerResponse
    const playerRespMatch = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s
    );
    if (playerRespMatch) {
      const playerData = JSON.parse(playerRespMatch[1]);
      const captions =
        playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (captions && captions.length > 0) {
        // Prefer English, then auto-generated, then first available
        let track =
          captions.find(
            (c: any) => c.languageCode === "en" && c.kind !== "asr"
          ) ||
          captions.find((c: any) => c.languageCode === "en") ||
          captions.find((c: any) => c.kind === "asr") ||
          captions[0];

        if (track?.baseUrl) {
          const captionRes = await fetch(track.baseUrl);
          const captionXml = await captionRes.text();
          transcript = parseCaptionXml(captionXml);
        }
      }
    }
  } catch (e) {
    console.error("YouTube Tier 1 (caption scrape) failed:", e);
  }

  // Tier 2 — Whisper fallback
  if (!transcript) {
    try {
      transcript = await whisperFallback(url, videoId);
    } catch (e) {
      console.error("YouTube Tier 2 (Whisper) failed:", e);
    }
  }

  return { transcript, title };
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function parseCaptionXml(xml: string): string {
  // Extract text from <text> elements, decode HTML entities
  const segments: string[] = [];
  const regex = /<text[^>]*>([^<]*)<\/text>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    let text = m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, " ")
      .trim();
    if (text) segments.push(text);
  }
  return segments.join(" ");
}

// ============================================================
// Whisper Fallback (Tier 2)
// ============================================================
async function whisperFallback(
  url: string,
  _videoId: string
): Promise<string> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    console.error("OPENAI_API_KEY not set — skipping Whisper fallback");
    return "";
  }

  // Use cobalt API to get audio download URL
  const cobaltRes = await fetch("https://api.cobalt.tools/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: url,
      audioFormat: "mp3",
      isAudioOnly: true,
    }),
  });

  const cobaltData = await cobaltRes.json();
  if (!cobaltData.url) {
    console.error("Cobalt failed to extract audio:", cobaltData);
    return "";
  }

  // Download audio
  const audioRes = await fetch(cobaltData.url);
  const audioBlob = await audioRes.blob();

  // Limit: Whisper accepts max 25MB
  if (audioBlob.size > 25 * 1024 * 1024) {
    console.error("Audio too large for Whisper:", audioBlob.size);
    return "";
  }

  // Send to Whisper
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.mp3");
  formData.append("model", "whisper-1");
  formData.append("language", "en");

  const whisperRes = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    }
  );

  const whisperData = await whisperRes.json();
  return whisperData.text || "";
}

// ============================================================
// TikTok: Extract metadata from page
// ============================================================
async function extractTikTok(
  url: string
): Promise<{ transcript: string; title: string }> {
  let transcript = "";
  let title = "";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    const html = await res.text();

    // Try to extract __UNIVERSAL_DATA_FOR_REHYDRATION__
    const dataMatch = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/
    );
    if (dataMatch) {
      const data = JSON.parse(dataMatch[1]);
      const defaultScope = data?.__DEFAULT_SCOPE__;
      const videoDetail =
        defaultScope?.["webapp.video-detail"]?.itemInfo?.itemStruct;

      if (videoDetail) {
        title = videoDetail.desc || "";
        const author = videoDetail.author?.nickname || "";
        const hashtags = (videoDetail.textExtra || [])
          .filter((t: any) => t.hashtagName)
          .map((t: any) => "#" + t.hashtagName)
          .join(" ");

        // Build content from available metadata
        const parts = [];
        if (title) parts.push("Description: " + title);
        if (author) parts.push("Author: " + author);
        if (hashtags) parts.push("Hashtags: " + hashtags);
        transcript = parts.join("\n\n");
      }
    }
  } catch (e) {
    console.error("TikTok extraction failed:", e);
  }

  // For TikTok, Whisper fallback is skipped for now (anti-bot measures)
  // If we only got metadata, that's fine — flag as attention if too short
  if (transcript && transcript.split(/\s+/).length < 10) {
    // Very short — probably just a description, needs manual transcript
    return { transcript: "", title };
  }

  return { transcript, title };
}
