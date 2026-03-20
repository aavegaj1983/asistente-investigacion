// TesisProLab API handler
// Cascada: Groq -> Mistral -> Cohere -> error
// Variables en Vercel: GROQ_API_KEY, MISTRAL_API_KEY, COHERE_API_KEY

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  const { messages, max_tokens } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content || "";
  if (!userMessage) return res.status(400).json({ error: "No se proporciono ningun mensaje" });

  // Helper: APIs compatibles con OpenAI (Groq y Mistral usan el mismo formato)
  async function callOpenAI(url, apiKey, model, maxTok) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.7,
        max_tokens: maxTok || 1500
      })
    });
  }

  // ── 1. GROQ — llama-3.3-70b (100k tokens/dia, muy rapido) ─────────
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await callOpenAI(
        "https://api.groq.com/openai/v1/chat/completions",
        process.env.GROQ_API_KEY,
        "llama-3.3-70b-versatile",
        max_tokens
      );
      if (r.ok) {
        const data = await r.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text) { console.log("Groq OK"); return res.status(200).json({ content: [{ type: "text", text }] }); }
      }
      console.warn("Groq fallo (" + r.status + ") - probando Mistral...");
    } catch (e) { console.warn("Groq excepcion:", e.message); }
  }

  // ── 2. MISTRAL — mistral-small (sin limite diario fijo, gratis sin tarjeta) ──
  if (process.env.MISTRAL_API_KEY) {
    try {
      const r = await callOpenAI(
        "https://api.mistral.ai/v1/chat/completions",
        process.env.MISTRAL_API_KEY,
        "mistral-small-latest",
        max_tokens
      );
      if (r.ok) {
        const data = await r.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text) { console.log("Mistral OK"); return res.status(200).json({ content: [{ type: "text", text }] }); }
      }
      console.warn("Mistral fallo (" + r.status + ") - probando Cohere...");
    } catch (e) { console.warn("Mistral excepcion:", e.message); }
  } else {
    console.warn("MISTRAL_API_KEY no configurada - saltando a Cohere...");
  }

  // ── 3. COHERE — 1000 llamadas/mes gratis sin tarjeta ──────────────
  if (process.env.COHERE_API_KEY) {
    const cohereModels = ["command-r-08-2024", "command-r-plus-08-2024", "command-a-03-2025"];
    for (const model of cohereModels) {
      try {
        const r = await fetch("https://api.cohere.com/v2/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + process.env.COHERE_API_KEY,
            "X-Client-Name": "TesisProLab"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: userMessage }],
            max_tokens: max_tokens || 1500,
            temperature: 0.7
          })
        });
        if (r.ok) {
          const data = await r.json();
          const text = data.message?.content?.[0]?.text || "";
          if (text) { console.log("Cohere OK (" + model + ")"); return res.status(200).json({ content: [{ type: "text", text }] }); }
        }
        console.warn("Cohere " + model + " fallo (" + r.status + ") - probando siguiente...");
      } catch (e) { console.warn("Cohere " + model + " excepcion:", e.message); }
    }
  } else {
    console.warn("COHERE_API_KEY no configurada");
  }

  console.error("Las 3 APIs fallaron");
  return res.status(503).json({ error: "Servicio no disponible. Intenta en unos minutos." });
};
