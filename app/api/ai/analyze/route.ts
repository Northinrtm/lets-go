import { demoEvents } from "@/lib/events";

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ events: demoEvents, source: "demo", message: "GROQ_API_KEY ещё не добавлен" });

  const body = await request.json().catch(() => null) as { interests?: string[] } | null;
  const interests = body?.interests?.join(", ") || "любые интересные события";
  const prompt = `Ты помощник персональной афиши Москвы. Оцени события по интересам пользователя: ${interests}. Верни JSON-массив id событий в порядке релевантности. События: ${JSON.stringify(demoEvents)}`;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", temperature: 0, messages: [{ role: "user", content: prompt }] }),
  });

  if (!response.ok) return Response.json({ error: "Не удалось обратиться к Groq" }, { status: 502 });
  return Response.json(await response.json());
}
