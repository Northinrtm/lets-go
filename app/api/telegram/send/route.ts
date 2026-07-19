import { demoEvents } from "@/lib/events";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ error: "Telegram пока не подключён" }, { status: 503 });

  const body = await request.json().catch(() => null) as { chatId?: string; eventIds?: string[] } | null;
  if (!body?.chatId || !body.eventIds?.length) return Response.json({ error: "Нужны chatId и eventIds" }, { status: 400 });

  const selected = demoEvents.filter((event) => body.eventIds?.includes(event.id));
  const text = ["Пойдём?", "", ...selected.map((event, index) => `${index + 1}. ${event.title}\n📅 ${event.date}\n📍 ${event.venue}\n🔗 ${event.url}`)].join("\n\n");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: body.chatId, text, disable_web_page_preview: true }),
  });

  if (!response.ok) return Response.json({ error: "Telegram не принял сообщение" }, { status: 502 });
  return Response.json({ ok: true });
}
