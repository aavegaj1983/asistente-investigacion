// TesisProLab API handler
// Intenta Groq primero. Si falla, prueba modelos de Gemini en orden.
// Variables de entorno en Vercel: GROQ_API_KEY, GEMINI_API_KEY

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

  // 1. Intentar con Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: userMessage }],
          temperature: 0.7,
          max_tokens: max_tokens || 1500
        })
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text) {
          console.log("Respondido por Groq");
          return res.status(200).json({ content: [{ type: "text", text }] });
        }
      }

      const errBody = await groqRes.text().catch(() => "");
      console.warn("Groq fallo (" + groqRes.status + ") - usando Gemini como fallback.");

    } catch (err) {
      console.warn("Groq excepcion - usando Gemini como fallback:", err.message);
    }
  } else {
    console.warn("GROQ_API_KEY no configurada - usando Gemini directamente");
  }

  // 2. Fallback: probar modelos de Gemini en orden
  // gemini-1.5-flash: free tier 1500 req/dia, el mas generoso
  // gemini-1.5-flash-8b: mas liviano, tambien free
  // gemini-2.0-flash: ultimo intento
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Ambas APIs no disponibles. Configura GROQ_API_KEY y/o GEMINI_API_KEY en Vercel."
    });
  }

  const GEMINI_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash"
  ];

  for (const model of GEMINI_MODELS) {
    try {
      const geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + process.env.GEMINI_API_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userMessage }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: max_tokens || 1500
            }
          })
        }
      );

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) {
          console.log("Respondido por Gemini (" + model + ")");
          return res.status(200).json({ content: [{ type: "text", text }] });
        }
      }

      console.warn("Gemini " + model + " fallo (" + geminiRes.status + ") - probando siguiente...");

    } catch (err) {
      console.warn("Gemini " + model + " excepcion - probando siguiente:", err.message);
    }
  }

  console.error("Todos los modelos fallaron");
  return res.status(503).json({
    error: "Ambas APIs no disponibles en este momento. Intenta en unos minutos."
  });
};
