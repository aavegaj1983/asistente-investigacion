// TesisProLab Health Check
// GET https://tu-app.vercel.app/api/health

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).end();

  const TEST_MSG = "Responde solo con la palabra: OK";
  const results = {};

  // Groq
  if (!process.env.GROQ_API_KEY) {
    results.groq = { status: "error", message: "GROQ_API_KEY no configurada" };
  } else {
    try {
      const start = Date.now();
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.GROQ_API_KEY
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: TEST_MSG }],
          max_tokens: 10
        })
      });
      const ms = Date.now() - start;
      if (r.ok) {
        const d = await r.json();
        results.groq = { status: "ok", latency_ms: ms, response: d.choices?.[0]?.message?.content?.trim() || "" };
      } else {
        const e = await r.json().catch(() => ({}));
        results.groq = {
          status: r.status === 429 ? "rate_limited" : "error",
          http_status: r.status,
          message: e?.error?.message || "Sin detalle"
        };
      }
    } catch (err) {
      results.groq = { status: "error", message: err.message };
    }
  }

  // Gemini - prueba modelos en orden
  if (!process.env.GEMINI_API_KEY) {
    results.gemini = { status: "error", message: "GEMINI_API_KEY no configurada" };
  } else {
    const GEMINI_MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash"];
    results.gemini = { status: "error", message: "Ningun modelo disponible" };

    for (const model of GEMINI_MODELS) {
      try {
        const start = Date.now();
        const r = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + process.env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: TEST_MSG }] }],
              generationConfig: { maxOutputTokens: 10 }
            })
          }
        );
        const ms = Date.now() - start;
        if (r.ok) {
          const d = await r.json();
          const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          results.gemini = { status: "ok", model, latency_ms: ms, response: text };
          break;
        } else {
          const e = await r.json().catch(() => ({}));
          results.gemini = {
            status: r.status === 429 ? "rate_limited" : "error",
            model,
            http_status: r.status,
            message: e?.error?.message || "Sin detalle"
          };
        }
      } catch (err) {
        results.gemini = { status: "error", model, message: err.message };
      }
    }
  }

  const allOk = results.groq.status === "ok" && results.gemini.status === "ok";
  const anyOk = results.groq.status === "ok" || results.gemini.status === "ok";
  const httpCode = allOk ? 200 : anyOk ? 206 : 503;

  const summary =
    allOk  ? "Groq y Gemini operativos - sistema al 100%" :
    anyOk  ? (results.groq.status === "ok"
               ? "Groq OK - Gemini con problemas - fallback activo"
               : "Gemini OK - Groq con rate limit - fallback activo")
           : "Ambas APIs no disponibles - los borradores seran locales";

  return res.status(httpCode).json({
    summary,
    timestamp: new Date().toISOString(),
    apis: results
  });
};
