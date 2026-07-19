export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY ещё не добавлен" }, { status: 503 });

  const body = await request.json().catch(() => null) as { interestText?: string; interests?: string[]; date?: string } | null;
  const interestText = body?.interestText?.trim();
  const interests = body?.interests?.length ? body.interests.join(", ") : "интересные события";
  const date = body?.date || "в ближайшие 7 дней";
  const prompt = [
    "Найди в интернете актуальные события в Москве.",
    `Свободное описание интересов пользователя: ${interestText || interests}.`,
    "Сначала сам выдели из текста конкретные предпочтения и ключевые признаки, затем используй их для поиска.",
    `Период: ${date}.`,
    "Ищи концерты, выставки, театр, лекции, спорт, стендап и другие городские события.",
    "Используй реальные страницы с датой, местом и прямой ссылкой. Не выдумывай события.",
    "Верни краткий список: название, категория, дата, место и URL источника.",
  ].join(" ");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.GROQ_SEARCH_MODEL || "groq/compound-mini",
      messages: [{ role: "user", content: prompt }],
      search_settings: { country: "russia" },
    }),
  });

  if (!response.ok) {
    return Response.json({ error: "Не удалось выполнить поиск событий", details: await response.text() }, { status: 502 });
  }

  const data = await response.json();
  return Response.json({ result: data.choices?.[0]?.message?.content || "События не найдены", sources: data.choices?.[0]?.message?.executed_tools || [] });
}
