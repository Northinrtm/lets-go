import { after } from "next/server";
import { supabaseRequest } from "@/lib/supabase-admin";

type SearchBody = { interests?: string[]; interestText?: string; date?: string; kind?: "events" | "places"; profileId?: string; background?: boolean };

type SearchHit = { url?: string; title?: string; content?: string };
type RateLimitError = Error & { retryAfterSeconds?: number };

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
      const startsAt = kind === "places" ? null : (typeof value.starts_at === "string" ? value.starts_at : null);
      if (kind === "events" && (!startsAt || Number.isNaN(new Date(startsAt).getTime()) || new Date(startsAt).getTime() < Date.now())) return [];
      return [{ title, url, starts_at: startsAt, venue: typeof value.venue === "string" ? value.venue : typeof value.address === "string" ? value.address : "Москва", description: typeof value.description === "string" ? value.description.slice(0, 240) : "Подходит по твоему описанию." }];
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
  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    `Найди в интернете ${subject} в Москве.`,
    "В запросе пользователя могут быть опечатки, пропущенные буквы и неправильные окончания. Сначала восстанови предполагаемый смысл и правильное написание, затем выполняй веб-поиск по исправленному варианту, его словоформам и синонимам. Не возвращай пустой ответ только из-за ошибки в написании.",
    `Описание того, какое место или событие хочет пользователь: «${interest}». Это не обязательно точное название — пойми смысл, выдели ключевые признаки, атмосферу, формат и используй синонимы и близкие формулировки. Не смешивай этот запрос с другими интересами.`,
    kind === "events" ? `Сегодня ${today}. Период: ${date}. Ищи только события, которые ещё не начались на эту дату, а не прошедшие события. Ищи все доступные события, а не только ближайшую неделю.` : "Ищи реальные места в Москве, похожие по описанию пользователя: природные маршруты, экотропы, парки, музеи, необычные локации и другие подходящие места. Не ищи только страницы, где встречается точное слово из запроса, и не возвращай статьи-списки вместо конкретных мест.",
    "Используй реальные страницы и прямые ссылки. Не выдумывай результаты.",
    kind === "events" ? "Извлеки все события со всех найденных страниц, максимум 20. Каждый элемент JSON: {title, url, starts_at, venue, description}. starts_at — будущая дата и время начала в ISO 8601. Для диапазона укажи первый день." : "Извлеки все подходящие места со всех найденных страниц, максимум 20. Каждый элемент JSON: {title, url, starts_at, venue, description}. Для места starts_at всегда null.",
    "description — короткое описание до 240 символов. Верни только корректный JSON-массив без markdown. Если ничего не найдено, верни [].",
  ].join(" ");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.GROQ_SEARCH_MODEL || "groq/compound-mini", max_tokens: 500, temperature: 0, messages: [{ role: "user", content: prompt }], search_settings: { country: "russia" } }),
  });

  if (response.status === 429) {
    const error = new Error("RATE_LIMIT") as RateLimitError;
    error.retryAfterSeconds = Number(response.headers.get("retry-after")) || 60;
    throw error;
  }
  if (!response.ok) throw new Error("SEARCH_FAILED");
  const data = await response.json();
  const sources = data.choices?.[0]?.message?.executed_tools || [];
  const content = data.choices?.[0]?.message?.content || "События не найдены";
  const normalized = normalizeModelResults(content, kind);
  return { interest, kind, result: JSON.stringify(normalized.length ? normalized : fallbackEvents(sources, interest, kind)), sources };
}

async function persistSearchResults(profileId: string, results: Array<{ result?: string }>) {
  const found = results.flatMap((item) => {
    try { return JSON.parse(item.result || "[]") as Array<Record<string, unknown>>; } catch { return []; }
  }).flatMap((item) => {
    const title = typeof item.title === "string" ? item.title : "";
    const url = typeof item.url === "string" ? item.url : "";
    if (!title || !/^https?:\/\//i.test(url)) return [];
    const isPlace = item.starts_at === null;
    return [{ source_url: url, title, category: isPlace ? "Место" : null, description: typeof item.description === "string" ? item.description : null, explanation: typeof item.description === "string" ? item.description : "Подходит по интересу.", venue: typeof item.venue === "string" ? item.venue : "Москва", starts_at: typeof item.starts_at === "string" ? item.starts_at : null, city: "Москва", raw_data: item }];
  });
  if (!found.length) return;
  await supabaseRequest(`profile_events?profile_id=eq.${encodeURIComponent(profileId)}`, { method: "PATCH", body: JSON.stringify({ is_new: false }) });
  const stored = await supabaseRequest<Array<{ id: string }>>("events?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(found) });
  if (stored.error || !stored.data?.length) return;
  await supabaseRequest("profile_events?on_conflict=profile_id,event_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(stored.data.map((event) => ({ profile_id: profileId, event_id: event.id, first_found_at: new Date().toISOString(), is_new: true }))) });
}

async function executeSearch(apiKey: string, interests: string[], kind: "events" | "places", date: string) {
  const results = [];
  const errors = [];
  let retryAfterSeconds = 0;
  for (const [index, interest] of interests.entries()) {
    try {
      let result;
      try { result = await searchOneInterest(apiKey, interest, date, kind); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "RATE_LIMIT") throw error;
        const retryAfter = (error as RateLimitError).retryAfterSeconds || Math.ceil(RATE_LIMIT_RETRY_DELAY_MS / 1000);
        retryAfterSeconds = Math.max(retryAfterSeconds, retryAfter);
        await wait(retryAfter * 1000);
        result = await searchOneInterest(apiKey, interest, date, kind);
      }
      results.push(result);
    } catch (error) {
      const rateLimit = error instanceof Error && error.message === "RATE_LIMIT";
      if (rateLimit) retryAfterSeconds = Math.max(retryAfterSeconds, (error as RateLimitError).retryAfterSeconds || 60);
      errors.push({ interest, error: rateLimit ? "RATE_LIMIT" : "SEARCH_FAILED", ...(rateLimit ? { retryAfterSeconds: (error as RateLimitError).retryAfterSeconds || 60 } : {}) });
    }
    if (index < interests.length - 1) await wait(INTEREST_DELAY_MS);
  }
  return { results, errors, retryAfterSeconds };
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "GROQ_API_KEY ещё не добавлен" }, { status: 503 });

  const body = await request.json().catch(() => null) as SearchBody | null;
  const kind = body?.kind || "events";
  const interests = (body?.interests?.length ? body.interests : body?.interestText ? [body.interestText] : []).map((interest) => interest.trim()).filter(Boolean);
  if (!interests.length) return Response.json({ error: "Добавьте хотя бы один интерес" }, { status: 400 });
  const date = body?.date || "все актуальные будущие события без ограничения по периоду";
  if (body?.background && body.profileId) {
    const jobId = crypto.randomUUID();
    after(async () => {
      const outcome = await executeSearch(apiKey, interests, kind, date);
      if (outcome.results.length) await persistSearchResults(body.profileId!, outcome.results);
      console.log(JSON.stringify({ event: "manual_search_finished", jobId, profileId: body.profileId, kind, resultsCount: outcome.results.length, errors: outcome.errors.length }));
    });
    return Response.json({ jobId, status: "started", message: "Поиск запущен в фоне" }, { status: 202 });
  }
  const { results, errors, retryAfterSeconds } = await executeSearch(apiKey, interests, kind, date);

  if (!results.length) {
    return Response.json({ error: errors.some((item) => item.error === "RATE_LIMIT") ? "Поиск временно перегружен." : "Не удалось выполнить поиск событий", retryAfterSeconds: retryAfterSeconds || undefined, results: [], errors }, { status: errors.some((item) => item.error === "RATE_LIMIT") ? 429 : 502 });
  }
  return Response.json({ results, errors, retryAfterSeconds: retryAfterSeconds || undefined, message: "Каждый интерес обработан отдельным последовательным поисковым запросом" });
}
