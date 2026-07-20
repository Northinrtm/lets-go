type SearchBody = { interests?: string[]; interestText?: string; date?: string };

type SearchHit = { url?: string; title?: string; content?: string };

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const INTEREST_DELAY_MS = 10000;
const RATE_LIMIT_RETRY_DELAY_MS = 20000;

function collectSearchHits(value: unknown, output: SearchHit[] = []): SearchHit[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchHits(item, output));
  } else if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if (typeof item.url === "string" && typeof item.title === "string" && typeof item.content === "string") output.push({ url: item.url, title: item.title, content: item.content });
    Object.values(item).forEach((child) => collectSearchHits(child, output));
  }
  return output;
}

function fallbackEvents(sources: unknown, interest: string) {
  const seen = new Set<string>();
  return collectSearchHits(sources).flatMap((hit) => {
    const url = hit.url?.trim() || "";
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) return [];
    const text = `${hit.title || ""} ${hit.content || ""}`;
    const dateMatch = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
    if (!dateMatch) return [];
    const year = dateMatch[1] || dateMatch[6];
    const month = dateMatch[2] || dateMatch[5];
    const day = dateMatch[3] || dateMatch[4];
    const startsAt = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)).toISOString();
    if (new Date(startsAt).getTime() < Date.now()) return [];
    seen.add(url);
    return [{ title: hit.title!.trim(), url, starts_at: startsAt, venue: "Москва", description: `Найдено по интересу «${interest}».` }];
  }).slice(0, 20);
}

async function searchOneInterest(apiKey: string, interest: string, date: string) {
  const prompt = [
    "Найди в интернете актуальные будущие события в Москве.",
    `Отдельный интерес пользователя: «${interest}». Не смешивай его с другими интересами.`,
    `Период: ${date}.`,
    "Ищи все доступные события, а не только ближайшую неделю.",
    "Используй реальные страницы с датой, местом и прямой ссылкой. Не выдумывай события.",
    "Извлеки все подходящие события со всех найденных страниц, максимум 20, а не одно лучшее. Не возвращай [] если хотя бы на одной странице есть будущие события с датой и URL. Верни только корректный JSON-массив без markdown и пояснений. Каждый элемент должен содержать ровно эти поля: {title, url, starts_at, venue, description}. title — название события; url — прямая рабочая ссылка на страницу события; starts_at — дата и время начала в ISO 8601, например 2026-08-15T19:00:00+03:00; venue — место проведения; description — короткое описание до 240 символов. Для диапазона дат укажи первый день. Не добавляй события без URL или подтверждённой даты. Если событий нет, верни [].",
  ].join(" ");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.GROQ_SEARCH_MODEL || "groq/compound-mini", max_tokens: 500, temperature: 0, messages: [{ role: "user", content: prompt }], search_settings: { country: "russia" } }),
  });

  if (response.status === 429) throw new Error("RATE_LIMIT");
  if (!response.ok) throw new Error("SEARCH_FAILED");
  const data = await response.json();
  const sources = data.choices?.[0]?.message?.executed_tools || [];
  const content = data.choices?.[0]?.message?.content || "События не найдены";
  return { interest, result: content === "[]" ? JSON.stringify(fallbackEvents(sources, interest)) : content, sources };
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
      let result;
      try {
        result = await searchOneInterest(apiKey, interest, body?.date || "все актуальные будущие события без ограничения по периоду");
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "RATE_LIMIT") throw error;
        await wait(RATE_LIMIT_RETRY_DELAY_MS);
        result = await searchOneInterest(apiKey, interest, body?.date || "все актуальные будущие события без ограничения по периоду");
      }
      results.push(result);
    } catch (error) {
      errors.push({ interest, error: error instanceof Error && error.message === "RATE_LIMIT" ? "RATE_LIMIT" : "SEARCH_FAILED" });
    }
    if (index < interests.length - 1) await wait(INTEREST_DELAY_MS);
  }

  if (!results.length) {
    return Response.json({ error: errors.some((item) => item.error === "RATE_LIMIT") ? "Поиск временно перегружен. Попробуйте ещё раз через минуту." : "Не удалось выполнить поиск событий", results: [], errors }, { status: errors.some((item) => item.error === "RATE_LIMIT") ? 429 : 502 });
  }
  return Response.json({ results, errors, message: "Каждый интерес обработан отдельным последовательным поисковым запросом" });
}
