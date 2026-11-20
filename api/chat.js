
// TESA Si / TESASI — Gemini AI backend for Vercel
// Add GEMINI_API_KEY in Vercel Environment Variables.
// Never put API keys in frontend JavaScript.

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTemporaryStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

async function callGemini({ apiKey, model, system, contents }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { maxOutputTokens: 1800 }
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      error: "Gemini API is not configured. Add GEMINI_API_KEY in Vercel Environment Variables and redeploy."
    });
  }

  try {
    const body = req.body || {};
    const incoming = body.messages;

    if (!Array.isArray(incoming) || incoming.length === 0 || incoming.length > 20) {
      return json(res, 400, { error: "Send between 1 and 20 conversation messages." });
    }

    const messages = [];
    let totalCharacters = 0;

    for (const item of incoming) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
        return json(res, 400, { error: "A message has an invalid role or content." });
      }

      const content = item.content.trim();
      if (!content || content.length > 30000) {
        return json(res, 400, { error: "Each message must contain text and be no longer than 30,000 characters." });
      }

      totalCharacters += content.length;
      messages.push({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: content }]
      });
    }

    if (totalCharacters > 70000) {
      return json(res, 413, { error: "This conversation is too large. Start a new chat or shorten the attached text." });
    }

    if (messages[messages.length - 1].role !== "user") {
      return json(res, 400, { error: "The last conversation message must be from the user." });
    }

    const allowedStyles = ["Balanced", "Friendly", "Professional", "Concise", "Detailed"];
    const style = allowedStyles.includes(body.style) ? body.style : "Balanced";
    const instructions = typeof body.instructions === "string"
      ? body.instructions.trim().slice(0, 1500)
      : "";
    const project = typeof body.project === "string"
      ? body.project.trim().slice(0, 120)
      : "";

    const system = [
      "You are TESASI AI, the built-in AI assistant of the TESASI website.",
      "Help with general questions, explanations, writing, planning, brainstorming, learning, and programming tasks.",
      "Language: reply in the language the user uses. Understand and answer naturally in both Kinyarwanda and English. If the user mixes them, respond naturally in the same mix.",
      "Be clear, useful, accurate, and respectful. Explain uncertainty rather than inventing facts.",
      "Do not claim to browse the web, access private accounts, or complete external actions unless a connected tool actually provides that capability.",
      "Response style requested by the user: " + style + ".",
      project ? "Current TESASI project context: " + project + "." : "",
      instructions ? "User's optional response preferences: " + instructions : ""
    ].filter(Boolean).join("\n\n");

    let result;
    let usedModel = PRIMARY_MODEL;

    for (let attempt = 0; attempt < 2; attempt++) {
      result = await callGemini({ apiKey, model: PRIMARY_MODEL, system, contents: messages });
      if (result.response.ok || !isTemporaryStatus(result.response.status)) break;
      if (attempt === 0) await sleep(900);
    }

    if (!result.response.ok &&
        [500, 502, 503, 504].includes(result.response.status) &&
        FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL) {
      usedModel = FALLBACK_MODEL;
      result = await callGemini({ apiKey, model: FALLBACK_MODEL, system, contents: messages });
    }

    const { response: upstream, data } = result;

    if (!upstream.ok) {
      console.error("Gemini API error:", {
        status: upstream.status,
        statusText: data.error?.status || "unknown_error",
        message: data.error?.message || "No provider message"
      });

      let message;
      if (upstream.status === 401 || upstream.status === 403) {
        message = "Gemini rejected the API key or access. Check GEMINI_API_KEY and the API access for this project.";
      } else if (upstream.status === 429) {
        message = "Gemini usage limit has been reached. Check the project's rate limits and usage, then try again later.";
      } else if ([500, 502, 503, 504].includes(upstream.status)) {
        message = "Gemini is temporarily busy. Both the main and backup models could not respond. Please try again shortly.";
      } else {
        message = "Gemini could not complete this request (HTTP " + upstream.status + "). Check the API setup and request.";
      }
      return json(res, 502, { error: message });
    }

    const reply = (data.candidates?.[0]?.content?.parts || [])
      .filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!reply) {
      return json(res, 502, { error: "Gemini returned no text. Please try again." });
    }

    return json(res, 200, { reply, model: usedModel });
  } catch (error) {
    console.error("TESASI Gemini backend error:", error.name || "Error");
    const message = error.name === "AbortError"
      ? "Gemini took too long to answer. Please try again."
      : "The TESASI AI server encountered a problem. Please try again.";
    return json(res, 500, { error: message });
  }
}
