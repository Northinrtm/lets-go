import { supabaseRequest } from "@/lib/supabase-admin";

type EventInput = { title?: string; url?: string; starts_at?: string | null; venue?: string | null; description?: string | null; category?: string | null };

export async function GET(request: Request) {
  const isNew = new URL(request.url).searchParams.get("new") === "true";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newFilter = isNew ? `&first_found_at=gte.${encodeURIComponent(today.toISOString())}` : "";
  const futureFilter = `&starts_at=gte.${encodeURIComponent(new Date().toISOString())}`;
  const result = await supabaseRequest<Array<{ id: string; title: string; category: string | null; venue: string | null; starts_at: string | null; explanation: string | null; source_url: string }>>(`events?select=id,title,category,venue,starts_at,explanation,source_url&city=eq.Москва${futureFilter}${newFilter}&order=starts_at.asc`);
  if (result.error) return Response.json({ events: [], source: "empty" });
  return Response.json({ events: (result.data || []).map((event) => ({ id: event.id, title: event.title, category: event.category || "Событие", venue: event.venue || "Москва", date: event.starts_at ? new Date(event.starts_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "Дата уточняется", reason: event.explanation || "Подходит по твоим интересам.", url: event.source_url })) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { events?: EventInput[] } | null;
  const events = (body?.events || []).flatMap((event) => {
    const title = event.title?.trim();
    const url = event.url?.trim();
    if (!title || !url || !/^https?:\/\//i.test(url)) return [];
    return [{ source_url: url, title, category: event.category?.trim() || null, description: event.description?.trim() || null, explanation: event.description?.trim() || "Подходит по твоему интересу.", venue: event.venue?.trim() || "Москва", starts_at: event.starts_at || null, city: "Москва", raw_data: event }];
  });
  if (!events.length) return Response.json({ events: [], error: "События не найдены" }, { status: 400 });
  const result = await supabaseRequest("events?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(events) });
  if (result.error) return Response.json({ events: [], error: result.error }, { status: 503 });
  return Response.json({ events: events.length });
}
