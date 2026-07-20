type SearchBody = { interests?: string[]; interestText?: string; date?: string };

async function searchOneInterest(apiKey: string, interest: string, date: string) {
  const prompt = [
    "Найди в интернете актуальные будущие события в Москве.",
    `Отдельный интерес пользователя: «${interest}». Не смешивай его с другими интересами.`,
    `Период: ${date}.`,
    "Ищи все доступные события, а не только ближайшую неделю.",
    "Используй реальные страницы с датой, местом и прямой ссылкой. Не выдумывай события.",
    "Верни только корректный JSON-массив без markdown и пояснений. Каждый элемент: {title, category, starts_at, venue, url, description, explanation}. starts_at — ISO 8601 или null. url — прямая ссылка на страницу события. Если событий нет, верни [].",
  ].join(" ");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.GROQ_SEARCH_MODEL || "groq/compound-mini", max_tokens: 1200, temperature: 0, messages: [{ role: "user", content: prompt }], search_settings: { country: "russia" } }),
  });

  if (response.status === 429) throw new Error("RATE_LIMIT");
  if (!response.ok) throw new Error("SEARCH_FAILED");
  const data = await response.json();
  return { interest, result: data.choices?.[0]?.message?.content || "События не найдены", sources: data.choices?.[0]?.message?.executed_tools || [] };
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY ещё не добавлен" }, { status: 503 });

  const body = await request.json().catch(() => null) as SearchBody | null;
  const interests = (body?.interests?.length ? body.interests : body?.interestText ? [body.interestText] : []).map((interest) => interest.trim()).filter(Boolean);
  if (!interests.length) return Response.json({ error: "Добавьте хотя бы один интерес" }, { status: 400 });

  try {
    const results = await Promise.all(interests.map((interest) => searchOneInterest(apiKey, interest, body?.date || "все актуальные будущие события без ограничения по периоду")));
    return Response.json({ results, message: "Каждый интерес обработан отдельным поисковым запросом" });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMIT") return Response.json({ error: "Поиск временно перегружен. Попробуйте ещё раз через минуту." }, { status: 429 });
    return Response.json({ error: "Не удалось выполнить поиск событий" }, { status: 502 });
  }
}
