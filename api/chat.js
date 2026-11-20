// TESA Si / TESASI — Gemini AI backend for Vercel
// Set GEMINI_API_KEY in Vercel Environment Variables.
// Never put your Gemini API key in browser code or commit it to GitHub.

const MODEL = "gemini-3.8-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
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
      const role = item.role === "assistant" ? "model" : "user";

      // Gemini expects conversation turns to alternate. Merge adjacent messages
      // with the same role so valid histories are still accepted.
      const previous = messages[messages.length - 1];
      if (previous && previous.role === role) {
        previous.parts[0].text += "\n\n" + content;
      } else {
        messages.push({ role, parts: [{ text: content }] });
      }
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);

    let upstream;
    try {
      upstream = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages,
          generationConfig: { maxOutputTokens: 1800 }
        })
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const providerMessage = data.error?.message || "No provider message";
      console.error("Gemini API error:", {
        status: upstream.status,
        message: providerMessage.slice(0, 500)
      });

      const message = upstream.status === 400
        ? "Gemini could not accept this request. Check the conversation format and model settings."
        : upstream.status === 401 || upstream.status === 403
          ? "Gemini rejected the API key or the key lacks permission. Check GEMINI_API_KEY in Vercel."
          : upstream.status === 404
            ? "The Gemini model was not found or is unavailable for this API key. Check the model name and API access."
            : upstream.status === 429
              ? "Gemini is receiving too many requests or the API quota has been reached. Please try again later."
              : "Gemini could not complete this request (HTTP " + upstream.status + "). Check your API setup and available usage.";
      return json(res, 502, { error: message });
    }

    const reply = (data.candidates?.[0]?.content?.parts || [])
      .filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!reply) {
      const reason = data.promptFeedback?.blockReason;
      return json(res, 502, {
        error: reason
          ? "Gemini could not answer because the request was blocked by its safety settings."
          : "Gemini returned no text. Please try again."
      });
    }

    return json(res, 200, { reply, model: MODEL });
  } catch (error) {
    console.error("TESASI Gemini backend error:", error.name || "Error");
    const message = error.name === "AbortError"
      ? "Gemini took too long to answer. Please try again."
      : "The TESASI AI server encountered a problem. Please try again.";
    return json(res, 500, { error: message });
  }
}
