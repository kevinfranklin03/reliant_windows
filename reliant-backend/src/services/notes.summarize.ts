import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function summarizeNotes(text: string, maxWords = 60) {
  const prompt = `Summarise these quote notes for quick scanning (UK English).
- Keep it under ${maxWords} words.
- Preserve key numbers, dates, SKUs, and constraints.
- No filler.

Notes:
"""${text}"""`;

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a concise assistant for summarising sales quote notes." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  const summary = resp.choices[0]?.message?.content ?? "";
  return summary.trim();
}
