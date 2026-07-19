import { supabaseRequest } from "@/lib/supabase-admin";

type TelegramUpdate = {
  message?: {
    chat?: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
  };
};

async function sendMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lets-go-theta.vercel.app";
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: appUrl ? { inline_keyboard: [[{ text: "Открыть LetsGo", web_app: { url: appUrl } }]] } : undefined }),
  });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await request.json() as TelegramUpdate;
  const message = update.message;
  const chatId = message?.chat?.id;
  const telegramUserId = message?.from?.id;
  if (!chatId || !telegramUserId) return Response.json({ ok: true });

  const profile = await supabaseRequest("profiles?on_conflict=telegram_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ telegram_user_id: String(telegramUserId), telegram_chat_id: String(chatId) }),
  });

  if (profile.error) {
    await sendMessage(chatId, "Пока не удалось подключить профиль. Попробуйте ещё раз позже.");
    return Response.json({ ok: true });
  }

  const text = message.text || "";
  if (text.startsWith("/start")) {
    await sendMessage(chatId, "Привет! Я LetsGo. Открой сайт, выбери интересы и сохраняй события — я пришлю напоминание за неделю до начала.");
  } else {
    await sendMessage(chatId, "Профиль подключён. Управлять интересами и избранными событиями можно на сайте LetsGo.");
  }

  return Response.json({ ok: true });
}
