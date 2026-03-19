// TesisProLab API handler
// Cascada: Groq -> Together AI -> Cohere -> error
// Variables en Vercel: GROQ_API_KEY, TOGETHER_API_KEY, COHERE_API_KEY

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  const { messages, max_tokens } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content || "";
  if (!userMessage) return res.status(400).json({ error: "No se proporciono ningun mensaje" });

  // Helper OpenAI-compatible
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

  // ── 1. GROQ — llama-3.3-70b (100k tokens/dia) ────────────────────
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
      console.warn("Groq fallo (" + r.status + ") - probando Together...");
    } catch (e) { console.warn("Groq excepcion:", e.message); }
  }

  // ── 2. TOGETHER AI — modelos gratuitos sin credito ────────────────
  // Usa modelos del free tier que no requieren credito de pago
  if (process.env.TOGETHER_API_KEY) {
    const togetherModels = [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",  // version free explicita
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"    // modelo ligero, siempre free
    ];
    for (const model of togetherModels) {
      try {
        const r = await callOpenAI(
          "https://api.together.xyz/v1/chat/completions",
          process.env.TOGETHER_API_KEY,
          model,
          max_tokens
        );
        if (r.ok) {
          const data = await r.json();
          const text = data.choices?.[0]?.message?.content || "";
          if (text) { console.log("Together OK (" + model + ")"); return res.status(200).json({ content: [{ type: "text", text }] }); }
        }
        console.warn("Together " + model + " fallo (" + r.status + ")");
      } catch (e) { console.warn("Together excepcion:", e.message); }
    }
  }

  // ── 3. COHERE — command-r (modelo activo, free 1000 calls/mes) ────
  if (process.env.COHERE_API_KEY) {
    try {
      const r = await fetch("https://api.cohere.com/v2/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.COHERE_API_KEY,
          "X-Client-Name": "TesisProLab"
        },
        body: JSON.stringify({
          model: "command-r",           // command-r-plus fue eliminado sep 2025
          messages: [{ role: "user", content: userMessage }],
          max_tokens: max_tokens || 1500,
          temperature: 0.7
        })
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.message?.content?.[0]?.text || "";
        if (text) { console.log("Cohere OK"); return res.status(200).json({ content: [{ type: "text", text }] }); }
      }
      const e = await r.json().catch(() => ({}));
      console.error("Cohere fallo (" + r.status + "):", e?.message || "");
    } catch (e) { console.error("Cohere excepcion:", e.message); }
  }

  console.error("Las 3 APIs fallaron");
  return res.status(503).json({ error: "Servicio no disponible. Intenta en unos minutos." });
};
