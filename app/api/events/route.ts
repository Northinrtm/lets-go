import { supabaseRequest } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const isNew = new URL(request.url).searchParams.get("new") === "true";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newFilter = isNew ? `&first_found_at=gte.${encodeURIComponent(today.toISOString())}` : "";
  const result = await supabaseRequest<Array<{ id: string; title: string; category: string | null; venue: string | null; starts_at: string | null; explanation: string | null; source_url: string }>>(`events?select=id,title,category,venue,starts_at,explanation,source_url&city=eq.Москва&order=starts_at.asc${newFilter}`);
  if (result.error) return Response.json({ events: [], source: "empty" });
  return Response.json({ events: (result.data || []).map((event) => ({ id: event.id, title: event.title, category: event.category || "Событие", venue: event.venue || "Москва", date: event.starts_at ? new Date(event.starts_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "Дата уточняется", reason: event.explanation || "Подходит по твоим интересам.", url: event.source_url })) });
}
