module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "API key no configurada en variables de entorno" });
  }
  
  try {
    // Extraer el contenido del mensaje
    const { messages, model, max_tokens } = req.body;
    const userMessage = messages?.[messages.length - 1]?.content || "";
    
    if (!userMessage) {
      return res.status(400).json({ error: "No se proporcionó ningún mensaje" });
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: userMessage }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: max_tokens || 1500
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error de Gemini API:", errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || "Error en la API de Gemini" 
      });
    }

    const data = await response.json();
    
    if (data.error) {
      console.error("Error en respuesta de Gemini:", data.error);
      return res.status(400).json({ error: data.error.message });
    }
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    if (!text) {
      return res.status(500).json({ error: "Gemini no devolvió texto en la respuesta" });
    }
    
    // Formato compatible con Claude (esperado por el HTML)
    return res.status(200).json({ 
      content: [{ type: "text", text }] 
    });
    
  } catch (err) {
    console.error("Error en handler:", err);
    return res.status(500).json({ 
      error: "Error interno del servidor: " + err.message 
    });
  }
};
