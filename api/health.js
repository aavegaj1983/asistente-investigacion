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
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.GROQ_API_KEY },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: TEST_MSG }], max_tokens: 10 })
      });
      const ms = Date.now() - start;
      if (r.ok) {
        const d = await r.json();
        results.groq = { status: "ok", latency_ms: ms, response: d.choices?.[0]?.message?.content?.trim() || "" };
      } else {
        const e = await r.json().catch(() => ({}));
        results.groq = { status: r.status === 429 ? "rate_limited" : "error", http_status: r.status, message: e?.error?.message || "Sin detalle" };
      }
    } catch (e) { results.groq = { status: "error", message: e.message }; }
  }

  // Mistral
  if (!process.env.MISTRAL_API_KEY) {
    results.mistral = { status: "error", message: "MISTRAL_API_KEY no configurada" };
  } else {
    try {
      const start = Date.now();
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.MISTRAL_API_KEY },
        body: JSON.stringify({ model: "mistral-small-latest", messages: [{ role: "user", content: TEST_MSG }], max_tokens: 10 })
      });
      const ms = Date.now() - start;
      if (r.ok) {
        const d = await r.json();
        results.mistral = { status: "ok", latency_ms: ms, response: d.choices?.[0]?.message?.content?.trim() || "" };
      } else {
        const e = await r.json().catch(() => ({}));
        results.mistral = { status: r.status === 429 ? "rate_limited" : "error", http_status: r.status, message: e?.error?.message || "Sin detalle" };
      }
    } catch (e) { results.mistral = { status: "error", message: e.message }; }
  }

  // Cohere
  if (!process.env.COHERE_API_KEY) {
    results.cohere = { status: "error", message: "COHERE_API_KEY no configurada" };
  } else {
    const models = ["command-r-08-2024", "command-r-plus-08-2024", "command-a-03-2025"];
    results.cohere = { status: "error", message: "Ningun modelo disponible" };
    for (const model of models) {
      try {
        const start = Date.now();
        const r = await fetch("https://api.cohere.com/v2/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.COHERE_API_KEY, "X-Client-Name": "TesisProLab" },
          body: JSON.stringify({ model, messages: [{ role: "user", content: TEST_MSG }], max_tokens: 10, temperature: 0.7 })
        });
        const ms = Date.now() - start;
        if (r.ok) {
          const d = await r.json();
          results.cohere = { status: "ok", model, latency_ms: ms, response: d.message?.content?.[0]?.text?.trim() || "" };
          break;
        } else {
          const e = await r.json().catch(() => ({}));
          results.cohere = { status: r.status === 429 ? "rate_limited" : "error", model, http_status: r.status, message: e?.message || "Sin detalle" };
        }
      } catch (e) { results.cohere = { status: "error", model, message: e.message }; }
    }
  }

  const statuses = [results.groq.status, results.mistral.status, results.cohere.status];
  const okCount = statuses.filter(s => s === "ok").length;
  const httpCode = okCount === 3 ? 200 : okCount > 0 ? 206 : 503;
  const primary = results.groq.status === "ok" ? "Groq" : results.mistral.status === "ok" ? "Mistral" : results.cohere.status === "ok" ? "Cohere" : null;
  const summary = okCount === 3 ? "Groq + Mistral + Cohere operativos - sistema al 100%"
    : okCount > 0 ? (primary + " activo - fallback disponible (" + okCount + "/3 APIs ok)")
    : "Las 3 APIs no disponibles - los borradores seran locales";

  return res.status(httpCode).json({ summary, timestamp: new Date().toISOString(), apis: results });
};
