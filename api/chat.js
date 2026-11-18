// TESA Si / TESASI — Claude AI backend for Vercel
// Keep ANTHROPIC_API_KEY in Vercel Environment Variables. Never put it in index.html.

const MODEL = "claude-sonnet-5-5";
const API_VERSION = "2026-10-21";

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      error: "Claude API is not configured. Add ANTHROPIC_API_KEY in Vercel Environment Variables and redeploy."
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
      messages.push({ role: item.role, content });
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

    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "anthropic-version": API_VERSION,
      "content-type": "application/json"
    };

    // Optional: set this when your Anthropic API key requires a workspace selection.
    if (process.env.ANTHROPIC_WORKSPACE_ID) {
      headers["anthropic-workspace-id"] = process.env.ANTHROPIC_WORKSPACE_ID;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);

    let upstream;
    try {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1800,
          system,
          messages
        })
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      // Log only the provider error details and status, never the API key or user conversation.
      console.error("Anthropic API error:", upstream.status, data.error?.type || "unknown_error");
      const message = upstream.status === 401
        ? "Claude rejected the API key. Check ANTHROPIC_API_KEY in Vercel."
        : upstream.status === 429
          ? "Claude is receiving too many requests. Please try again shortly."
          : "Claude could not complete this request (HTTP " + upstream.status + "). Check your API setup and available usage.";
      return json(res, 502, { error: message });
    }

    const reply = (data.content || [])
      .filter(block => block.type === "text" && typeof block.text === "string")
      .map(block => block.text)
      .join("\n")
      .trim();

    if (!reply) {
      return json(res, 502, { error: "Claude returned no text. Please try again." });
    }

    return json(res, 200, { reply, model: MODEL });
  } catch (error) {
    console.error("TESASI Claude backend error:", error.name || "Error");
    const message = error.name === "AbortError"
      ? "Claude took too long to answer. Please try again."
      : "The TESASI AI server encountered a problem. Please try again.";
    return json(res, 500, { error: message });
  }
}
