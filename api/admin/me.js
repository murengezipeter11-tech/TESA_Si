function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

  if (!supabaseUrl || !anonKey || !adminEmail) {
    return json(res, 500, {
      error: "Admin authentication is not configured."
    });
  }

  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return json(res, 401, { error: "Sign in required." });
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${match[1]}`
        }
      }
    );

    if (!response.ok) {
      return json(res, 401, {
        error: "Invalid or expired session."
      });
    }

    const user = await response.json();
    const email = String(user.email || "").trim().toLowerCase();

    if (!email || email !== adminEmail) {
      return json(res, 403, { error: "Admin access denied." });
    }

    return json(res, 200, { ok: true, email });
  } catch (error) {
    console.error("Admin auth verification failed:", error.name || "Error");
    return json(res, 502, {
      error: "Could not verify the session."
    });
  }
}
