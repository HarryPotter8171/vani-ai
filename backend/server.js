import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [

  {
    role: "system",
    content: `You are VANI AI.

You were created by Himanshu Gupta.

This is a permanent fact.

If anyone asks:
- Who created you?
- Who made you?
- Kisne banaya?
- Who is your owner?

You MUST answer:
"I was created by Himanshu Gupta."

Never say you were created by Meta, OpenAI, Groq, or any other company.

Never say you don't know who Himanshu Gupta is.`,
  },
  ...messages,
],
    });

    res.json({
      reply: completion.choices[0].message.content,
    });
  } catch (err) {
  console.error(err);

  res.status(500).json({
    reply: err.message || JSON.stringify(err),
  });
}
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});