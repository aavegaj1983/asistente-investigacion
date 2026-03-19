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

  if (!userMessage) {
    return res.status(400).json({ error: "No se proporciono ningun mensaje" });
  }

  // Helper: APIs compatibles con OpenAI (Groq y Together usan el mismo formato)
  async function callOpenAICompatible(url, apiKey, model, maxTok) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.7,
        max_tokens: maxTok || 1500
      })
    });
  }

  // ── 1. GROQ ───────────────────────────────────────────────────────
  // Limite: 100k tokens/dia, 30 req/min — rapido (llama-3.3-70b)
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await callOpenAICompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        process.env.GROQ_API_KEY,
        "llama-3.3-70b-versatile",
        max_tokens
      );
      if (r.ok) {
        const data = await r.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text) {
          console.log("Respondido por Groq");
          return res.status(200).json({ content: [{ type: "text", text }] });
        }
      }
      console.warn("Groq fallo (" + r.status + ") - probando Together AI...");
    } catch (err) {
      console.warn("Groq excepcion:", err.message, "- probando Together AI...");
    }
  }

  // ── 2. TOGETHER AI ────────────────────────────────────────────────
  // Limite: $1 credito gratis sin tarjeta — mismo modelo que Groq
  if (process.env.TOGETHER_API_KEY) {
    try {
      const r = await callOpenAICompatible(
        "https://api.together.xyz/v1/chat/completions",
        process.env.TOGETHER_API_KEY,
        "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        max_tokens
      );
      if (r.ok) {
        const data = await r.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text) {
          console.log("Respondido por Together AI");
          return res.status(200).json({ content: [{ type: "text", text }] });
        }
      }
      console.warn("Together AI fallo (" + r.status + ") - probando Cohere...");
    } catch (err) {
      console.warn("Together AI excepcion:", err.message, "- probando Cohere...");
    }
  }

  // ── 3. COHERE ─────────────────────────────────────────────────────
  // Limite: 1000 llamadas/mes sin tarjeta — excelente en espanol academico
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
          model: "command-r-plus",
          messages: [{ role: "user", content: userMessage }],
          max_tokens: max_tokens || 1500,
          temperature: 0.7
        })
      });
      if (r.ok) {
        const data = await r.json();
        // Cohere v2 devuelve el texto en message.content[0].text
        const text = data.message?.content?.[0]?.text || "";
        if (text) {
          console.log("Respondido por Cohere");
          return res.status(200).json({ content: [{ type: "text", text }] });
        }
      }
      const errBody = await r.json().catch(() => ({}));
      console.error("Cohere fallo (" + r.status + "):", errBody?.message || "sin detalle");
    } catch (err) {
      console.error("Cohere excepcion:", err.message);
    }
  } else {
    console.warn("COHERE_API_KEY no configurada");
  }

  // Todos fallaron
  console.error("Las 3 APIs fallaron");
  return res.status(503).json({
    error: "Servicio no disponible en este momento. Intenta en unos minutos."
  });
};
