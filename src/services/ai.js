const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
let genAI;
let model;

function getModel() {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment');
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: MODEL_NAME });
    console.log(`[AI] Initialized Gemini model: ${MODEL_NAME}`);
  }
  return model;
}

function sanitizeReply(text, maxLen = 480) {
  if (!text) return 'Sorry, I could not generate a reply.';
  // SMS-friendly trimming
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 3) + '...' : clean;
}

async function generateReply(userText, phoneNumber) {
  try {
    const prompt = `You are an SMS assistant. Keep replies short and clear (max ~2 SMS segments). User (${phoneNumber}) said: "${userText}". Reply in plain text, no markdown.`;
    const m = getModel();
    const result = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return sanitizeReply(text);
  } catch (err) {
    console.warn('[AI] generateReply failed:', err.message);
    return 'Thanks for your message! (AI temporarily unavailable)';
  }
}

module.exports = { generateReply };
