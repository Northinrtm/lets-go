type SearchBody = { interests?: string[]; interestText?: string; date?: string; kind?: "events" | "places" };

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

function normalizeModelResults(content: string, kind: "events" | "places") {
  const candidate = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || content.match(/[\[{][\s\S]*[\]}]/)?.[0];
  if (!candidate) return [];
  try {
    const parsed = JSON.parse(candidate) as unknown;
    const items = Array.isArray(parsed) ? parsed : [];
    return items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      const title = typeof value.title === "string" ? value.title : typeof value.name === "string" ? value.name : "";
      const url = typeof value.url === "string" ? value.url : typeof value.website === "string" ? value.website : "";
      if (!title || !/^https?:\/\//i.test(url)) return [];
      return [{ title, url, starts_at: kind === "places" ? null : (typeof value.starts_at === "string" ? value.starts_at : null), venue: typeof value.venue === "string" ? value.venue : typeof value.address === "string" ? value.address : "Москва", description: typeof value.description === "string" ? value.description.slice(0, 240) : "Подходит по твоему описанию." }];
    }).slice(0, 20);
  } catch { return []; }
}

function fallbackEvents(sources: unknown, interest: string, kind: "events" | "places"): Array<{ title: string; url: string; starts_at: string | null; venue: string; description: string }> {
  const seen = new Set<string>();
  return collectSearchHits(sources).flatMap((hit): Array<{ title: string; url: string; starts_at: string | null; venue: string; description: string }> => {
    const url = hit.url?.trim() || "";
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) return [];
    const text = `${hit.title || ""} ${hit.content || ""}`;
    const dateMatch = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
    if (kind === "events" && !dateMatch) return [];
    if (kind === "places") {
      seen.add(url);
      return [{ title: hit.title!.trim(), url, starts_at: null, venue: "Москва", description: `Интересное место по запросу «${interest}».` }];
    }
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

async function searchOneInterest(apiKey: string, interest: string, date: string, kind: "events" | "places") {
  const subject = kind === "places" ? "интересные места, маршруты, экотропы, парки, музеи и необычные локации" : "актуальные будущие события";
  const prompt = [
    `Найди в интернете ${subject} в Москве.`,
    `Описание того, какое место или событие хочет пользователь: «${interest}». Это не обязательно точное название — пойми смысл, выдели ключевые признаки, атмосферу, формат и используй синонимы и близкие формулировки. Не смешивай этот запрос с другими интересами.`,
    kind === "events" ? `Период: ${date}. Ищи все доступные события, а не только ближайшую неделю.` : "Ищи реальные места в Москве, похожие по описанию пользователя: природные маршруты, экотропы, парки, музеи, необычные локации и другие подходящие места. Не ищи только страницы, где встречается точное слово из запроса, и не возвращай статьи-списки вместо конкретных мест.",
    "Используй реальные страницы и прямые ссылки. Не выдумывай результаты.",
    kind === "events" ? "Извлеки все события со всех найденных страниц, максимум 20. Каждый элемент JSON: {title, url, starts_at, venue, description}. starts_at — будущая дата и время начала в ISO 8601. Для диапазона укажи первый день." : "Извлеки все подходящие места со всех найденных страниц, максимум 20. Каждый элемент JSON: {title, url, starts_at, venue, description}. Для места starts_at всегда null.",
    "description — короткое описание до 240 символов. Верни только корректный JSON-массив без markdown. Если ничего не найдено, верни [].",
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
  const normalized = normalizeModelResults(content, kind);
  return { interest, kind, result: JSON.stringify(normalized.length ? normalized : fallbackEvents(sources, interest, kind)), sources };
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY ещё не добавлен" }, { status: 503 });

  const body = await request.json().catch(() => null) as SearchBody | null;
  const kind = body?.kind || "events";
  const interests = (body?.interests?.length ? body.interests : body?.interestText ? [body.interestText] : []).map((interest) => interest.trim()).filter(Boolean);
  if (!interests.length) return Response.json({ error: "Добавьте хотя бы один интерес" }, { status: 400 });

  const results = [];
  const errors = [];
  for (const [index, interest] of interests.entries()) {
    try {
      let result;
      try {
        result = await searchOneInterest(apiKey, interest, body?.date || "все актуальные будущие события без ограничения по периоду", kind);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "RATE_LIMIT") throw error;
        await wait(RATE_LIMIT_RETRY_DELAY_MS);
        result = await searchOneInterest(apiKey, interest, body?.date || "все актуальные будущие события без ограничения по периоду", kind);
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
