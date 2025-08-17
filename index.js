import express from "express";
import fetch from "node-fetch";
import 'dotenv/config';

const app = express();
app.use(express.json());

// Cambia esto por tu token de verificación (y pon el mismo en Meta)
const VERIFY_TOKEN = "midemo123";

// Pega aquí tu Phone Number ID de WhatsApp Cloud API
const PHONE_NUMBER_ID = "795487123034175";

// Variables secretas desde Render
const WP_TOKEN = process.env.WP_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Endpoint de verificación del webhook
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Endpoint para mensajes entrantes
app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    const from = msg?.from;
    const text = msg?.text?.body;

    if (!from || !text) return res.sendStatus(200);

    // Pedir respuesta a OpenAI
    let reply = "💬 No entendí tu mensaje.";
    try {
      const gpt = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Eres un coach de entrenamiento y alimentación. Responde claro y corto en español." },
            { role: "user", content: text }
          ]
        })
      }).then(r => r.json());
      reply = gpt.choices?.[0]?.message?.content || reply;
    } catch (e) { console.error("Error GPT:", e); }

    // Responder por WhatsApp
    await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      })
    });

    res.sendStatus(200);
  } catch (e) {
    console.error("Error general:", e);
    res.sendStatus(200);
  }
});
app.get("/", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto", PORT));
