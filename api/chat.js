// TesisProLab API handler
// Cascada: Groq -> Cohere -> error
// Variables en Vercel: GROQ_API_KEY, COHERE_API_KEY

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  const { messages, max_tokens } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content || "";
  if (!userMessage) return res.status(400).json({ error: "No se proporciono ningun mensaje" });

  // ── 1. GROQ — llama-3.3-70b (100k tokens/dia, muy rapido) ─────────
  if (process.env.GROQ_API_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: userMessage }],
          temperature: 0.7,
          max_tokens: max_tokens || 1500
        })
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text) { console.log("Groq OK"); return res.status(200).json({ content: [{ type: "text", text }] }); }
      }
      console.warn("Groq fallo (" + r.status + ") - probando Cohere...");
    } catch (e) { console.warn("Groq excepcion:", e.message); }
  }

  // ── 2. COHERE — 1000 llamadas/mes gratis sin tarjeta ──────────────
  // Modelos activos (command-r y command-r-plus fueron eliminados sep 2025)
  if (process.env.COHERE_API_KEY) {
    const cohereModels = [
      "command-r-08-2024",       // Command R actualizado - bueno para espanol
      "command-r-plus-08-2024",  // Command R+ actualizado - el mas potente free
      "command-a-03-2025"        // Command A - el mas reciente y potente
    ];
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

  console.error("Groq y Cohere fallaron");
  return res.status(503).json({ error: "Servicio no disponible. Intenta en unos minutos." });
};
