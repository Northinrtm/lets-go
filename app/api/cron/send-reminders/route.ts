import { supabaseRequest } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN не настроен" }, { status: 503 });
  const favorites = await supabaseRequest<Array<{ profile_id: string; event_id: string; profiles?: { telegram_chat_id?: string | null } | null; events?: { title?: string; venue?: string | null; starts_at?: string | null; source_url?: string } | null }>>("favorites?select=profile_id,event_id,reminder_enabled,profiles(telegram_chat_id),events(title,venue,starts_at,source_url)&reminder_enabled=eq.true");
  if (favorites.error) return Response.json({ ok: false, error: favorites.error }, { status: 503 });
  const now = Date.now();
  const lower = now + 6 * 24 * 60 * 60 * 1000;
  const upper = now + 8 * 24 * 60 * 60 * 1000;
  const due = (favorites.data || []).filter((favorite) => {
    const time = favorite.events?.starts_at ? new Date(favorite.events.starts_at).getTime() : 0;
    return Boolean(favorite.profiles?.telegram_chat_id && time >= lower && time < upper);
  });
  let sent = 0;
  for (const favorite of due) {
    const event = favorite.events!;
    const text = `Напоминание от Пойдём?\n\n${event.title}\n📅 ${new Date(event.starts_at!).toLocaleString("ru-RU", { dateStyle: "full", timeStyle: "short" })}\n📍 ${event.venue || "Москва"}\n🔗 ${event.source_url}`;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: favorite.profiles!.telegram_chat_id, text, disable_web_page_preview: true }) });
    if (response.ok) sent += 1;
  }
  return Response.json({ ok: true, checked: favorites.data?.length || 0, due: due.length, sent });
}
