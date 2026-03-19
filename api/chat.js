// ── TesisProLab API handler ───────────────────────────────────────
// Intenta Groq primero (más rápido). Si devuelve 429, cae a Gemini.
// Variables de entorno necesarias en Vercel:
//   GROQ_API_KEY   → console.groq.com
//   GEMINI_API_KEY → aistudio.google.com

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Metodo no permitido" });

  const { messages, max_tokens } = req.body;
  const userMessage = messages?.[messages.length - 1]?.content || "";

  if (!userMessage) {
    return res.status(400).json({ error: "No se proporcionó ningún mensaje" });
  }

  // ── 1. Intentar con Groq ─────────────────────────────────────────
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

      // Si es 429 o cualquier otro error, loguear y caer a Gemini
      const errData = await groqRes.json().catch(() => ({}));
      console.warn(`Groq falló (${groqRes.status}) — usando Gemini como fallback`, errData?.error?.message || "");

    } catch (err) {
      console.warn("Groq excepción — usando Gemini como fallback:", err.message);
    }
  } else {
    console.warn("GROQ_API_KEY no configurada — usando Gemini directamente");
  }

  // ── 2. Fallback: Gemini Flash ────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Ambas APIs no disponibles. Configura GROQ_API_KEY y/o GEMINI_API_KEY en Vercel."
    });
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      console.error("Gemini también falló:", errData);
      return res.status(geminiRes.status).json({
        error: errData?.error?.message || "Error en Gemini API"
      });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!text) {
      return res.status(500).json({ error: "Gemini no devolvió texto" });
    }

    console.log("Respondido por Gemini (fallback)");
    return res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    console.error("Error en Gemini fallback:", err);
    return res.status(500).json({ error: "Error interno del servidor: " + err.message });
  }
};
