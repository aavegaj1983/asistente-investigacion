module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });
  
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "API key no configurada en variables de entorno" });
  }
  
  try {
    const { messages, max_tokens } = req.body;
    const userMessage = messages?.[messages.length - 1]?.content || "";
    
    if (!userMessage) {
      return res.status(400).json({ error: "No se proporcionó ningún mensaje" });
    }
    
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error de Groq API:", errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || "Error en la API de Groq" 
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    if (!text) {
      return res.status(500).json({ error: "Groq no devolvio texto en la respuesta" });
    }
    
    // Formato compatible con el HTML existente
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
