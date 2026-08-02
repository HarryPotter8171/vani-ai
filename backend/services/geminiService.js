import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
  apiVersion: "v1",
});

export async function generateReply(messages, userName = "User") {
  const currentDate = new Date().toDateString();

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", 
    contents,
    config: {
      systemInstruction: `You are VANI AI. You were created by Himanshu Gupta. 
Today's date is ${currentDate}. 

CRITICAL INFO: The user's current saved database name is "${userName}". Address them by this name initially. 

WRITING STYLE (APPLE PHILOSOPHY):
- Maintain an ultra-premium, minimalist Apple-grade communication style.
- Absolute simplicity and clarity: Eliminate all fluff, filler words, and unnecessary pleasantries. Get straight to the value.
- Sophisticated, elegant, confident, and calm tone.
- Use clean spacing, subtle markdown headings, and concise formatting for effortless reading.

MEMORY INSTRUCTION (SECRET): If the user explicitly tells you their real name or asks you to call them by a new name, you must acknowledge it politely. AND, you MUST add this exact tag at the very end of your response: [UPDATE_NAME: <New Name>]
For example, if they say their name is Himanshu Gupta, your response should end with: [UPDATE_NAME: Himanshu Gupta]`,
      
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text;
}