// index.js — versión depurada con logs
import express from "express";
import fetch from "node-fetch";
import "dotenv/config";

const app = express();
app.use(express.json());

// 🔐 Tokens/IDs
// Usa el mismo verify token que pegaste en Meta (Configuración Webhooks)
const VERIFY_TOKEN = "midemo123";

// Asegúrate de que coincida con el "Phone Number ID" que ves en WhatsApp → Configuración de la API
const PHONE_NUMBER_ID = "795487123034175";

// Variables de entorno (configuradas en Render → Environment)
const WP_TOKEN = process.env.WP_TOKEN;               // Token de acceso de WhatsApp (Meta)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;   // API key de OpenAI

// ✅ Healthcheck
app.get("/", (req, res) => res.send("OK"));

// ✅ Verificación del webhook (Meta hace un GET con hub.challenge)
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ✅ Recepción de mensajes
app.post("/webhook/whatsapp", async (req, res) => {
  try {
    // Log completo del evento entrante
    console.log("🌐 Webhook body:", JSON.stringify(req.body, null, 2));

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];

    // Muchos eventos NO traen messages (son status/acks). Responder 200 y salir.
    if (!msg) {
      console.log("ℹ️ Evento sin 'messages' (probablemente status).");
      return res.sendStatus(200);
    }

    const from = msg.from;                   // número del usuario
    const type = msg.type;                   // "text", "button", "interactive", etc.
    const text =
      msg.text?.body ||
      msg.button?.text ||
      msg.interactive?.nfm_reply?.response_json ||
      "";

    console.log("📩 Entrante:", { from, type, text });

    // Si no hay texto, manda una ayuda breve
    if (!text) {
      const fbNoText = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            text: { body: "Recibí tu mensaje ✅. Envíame texto para ayudarte." },
          }),
        }
      );
      const fbNoTextJson = await fbNoText.json();
      console.log("↩️ FB resp (sin texto):", JSON.stringify(fbNoTextJson, null, 2));
      return res.sendStatus(200);
    }

    // 🧠 Llamada a OpenAI
    let reply = "💬 No entendí tu mensaje.";
    try {
      const oaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.6,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content:
                "Eres un coach de entrenamiento y nutrición. Responde claro, breve y en español.",
            },
            { role: "user", content: text },
          ],
        }),
      });
      const gptJson = await oaiResp.json();
      console.log("🧠 OpenAI resp:", JSON.stringify(gptJson, null, 2));
      reply = gptJson?.choices?.[0]?.message?.content?.slice(0, 1500) || reply;
    } catch (e) {
      console.error("❌ Error GPT:", e);
    }

    // 📤 Responder por WhatsApp (Graph API)
    const fbResp = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        }),
      }
    );

    const fbJson = await fbResp.json();
    console.log("↩️ FB resp:", JSON.stringify(fbJson, null, 2));

    return res.sendStatus(200);
  } catch (e) {
    console.error("❌ Error general:", e);
    return res.sendStatus(200);
  }
});

// ▶️ Arranque
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto", PORT));
