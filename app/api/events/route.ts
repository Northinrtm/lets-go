import { supabaseRequest } from "@/lib/supabase-admin";

type EventInput = { title?: string; url?: string; starts_at?: string | null; venue?: string | null; description?: string | null; category?: string | null; kind?: "events" | "places" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const isNew = url.searchParams.get("new") === "true";
  const isHistory = url.searchParams.get("history") === "true";
  const kind = url.searchParams.get("kind") as "events" | "places" | null;
  const profileId = url.searchParams.get("profileId");
  if (!profileId) return Response.json({ events: [], error: "Нужен Telegram-профиль" }, { status: 401 });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newFilter = isNew ? `&first_found_at=gte.${encodeURIComponent(today.toISOString())}` : "";
  const links = await supabaseRequest<Array<{ event_id: string; first_found_at: string }>>(`profile_events?select=event_id,first_found_at&profile_id=eq.${encodeURIComponent(profileId)}${newFilter}`);
  if (links.error || !links.data?.length) return Response.json({ events: [] });
  const ids = links.data.map((link) => link.event_id);
  const result = await supabaseRequest<Array<{ id: string; title: string; category: string | null; venue: string | null; starts_at: string | null; explanation: string | null; source_url: string }>>(`events?select=id,title,category,venue,starts_at,explanation,source_url&city=eq.Москва&id=in.(${ids.join(",")})&order=starts_at.asc`);
  if (result.error) return Response.json({ events: [], source: "empty" });
  const filtered = (result.data || []).filter((event) => {
    if (kind === "places") return event.category === "Место";
    if (kind === "events") return event.category !== "Место" && (isHistory || !event.starts_at || new Date(event.starts_at).getTime() >= Date.now());
    return true;
  });
  return Response.json({ events: filtered.map((event) => ({ id: event.id, title: event.title, category: event.category || "Событие", venue: event.venue || "Москва", date: event.starts_at ? new Date(event.starts_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "Можно посетить сейчас", reason: event.explanation || "Подходит по твоим интересам.", url: event.source_url })) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { profileId?: string; events?: EventInput[] } | null;
  if (!body?.profileId) return Response.json({ events: [], error: "Нужен Telegram-профиль" }, { status: 401 });
  const events = (body?.events || []).flatMap((event) => {
    const title = event.title?.trim();
    const url = event.url?.trim();
    if (!title || !url || !/^https?:\/\//i.test(url)) return [];
    return [{ source_url: url, title, category: event.kind === "places" ? "Место" : (event.category?.trim() || null), description: event.description?.trim() || null, explanation: event.description?.trim() || "Подходит по твоему интересу.", venue: event.venue?.trim() || "Москва", starts_at: event.starts_at || null, city: "Москва", raw_data: event }];
  });
  if (!events.length) return Response.json({ events: [], error: "События не найдены" }, { status: 400 });
  const result = await supabaseRequest<Array<{ id: string }>>("events?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(events) });
  if (result.error || !result.data) return Response.json({ events: [], error: result.error || "Не удалось сохранить события" }, { status: 503 });
  const links = result.data.map((event) => ({ profile_id: body.profileId, event_id: event.id }));
  const linkResult = await supabaseRequest("profile_events?on_conflict=profile_id,event_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(links) });
  if (linkResult.error) return Response.json({ events: [], error: linkResult.error }, { status: 503 });
  return Response.json({ events: events.length });
}
