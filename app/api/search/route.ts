type SearchBody = { interests?: string[]; interestText?: string; date?: string };

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function searchOneInterest(apiKey: string, interest: string, date: string) {
  const prompt = [
    "Найди в интернете актуальные будущие события в Москве.",
    `Отдельный интерес пользователя: «${interest}». Не смешивай его с другими интересами.`,
    `Период: ${date}.`,
    "Ищи все доступные события, а не только ближайшую неделю.",
    "Используй реальные страницы с датой, местом и прямой ссылкой. Не выдумывай события.",
    "Верни только корректный JSON-массив без markdown и пояснений. Каждый элемент должен содержать ровно эти поля: {title, url, starts_at, venue, description}. title — название события; url — прямая рабочая ссылка на страницу события; starts_at — дата и время начала в ISO 8601, например 2026-08-15T19:00:00+03:00; venue — место проведения; description — короткое описание до 240 символов. Не добавляй события без URL или подтверждённой даты. Если событий нет, верни [].",
  ].join(" ");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.GROQ_SEARCH_MODEL || "groq/compound-mini", max_tokens: 700, temperature: 0, messages: [{ role: "user", content: prompt }], search_settings: { country: "russia" } }),
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

  const results = [];
  const errors = [];
  for (const [index, interest] of interests.entries()) {
    try {
      results.push(await searchOneInterest(apiKey, interest, body?.date || "все актуальные будущие события без ограничения по периоду"));
    } catch (error) {
      errors.push({ interest, error: error instanceof Error && error.message === "RATE_LIMIT" ? "RATE_LIMIT" : "SEARCH_FAILED" });
    }
    if (index < interests.length - 1) await wait(1500);
  }

  if (!results.length) {
    return Response.json({ error: errors.some((item) => item.error === "RATE_LIMIT") ? "Поиск временно перегружен. Попробуйте ещё раз через минуту." : "Не удалось выполнить поиск событий", results: [], errors }, { status: errors.some((item) => item.error === "RATE_LIMIT") ? 429 : 502 });
  }
  return Response.json({ results, errors, message: "Каждый интерес обработан отдельным последовательным поисковым запросом" });
}
