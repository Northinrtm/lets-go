import { supabaseRequest } from "@/lib/supabase-admin";
import { getTelegramUserId } from "@/lib/telegram-auth";

export async function GET(request: Request) {
  const telegramUserId = getTelegramUserId(new URL(request.url).searchParams.get("initData"));
  if (!telegramUserId) return Response.json({ error: "Нужен telegramUserId" }, { status: 400 });
  const result = await supabaseRequest<Array<{ id: string; interest_text: string }>>(`profiles?select=id,interest_text&telegram_user_id=eq.${encodeURIComponent(telegramUserId)}&limit=1`);
  if (result.error) return Response.json({ error: result.error }, { status: 503 });
  return Response.json({ profile: result.data?.[0] || null });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { initData?: string; chatId?: string; interestText?: string; interestRows?: string[] } | null;
  const telegramUserId = getTelegramUserId(body?.initData);
  if (!telegramUserId) return Response.json({ error: "Telegram-профиль не подтверждён" }, { status: 401 });
  const result = await supabaseRequest("profiles?on_conflict=telegram_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ telegram_user_id: telegramUserId, telegram_chat_id: body?.chatId || null, interest_text: body?.interestText || "" }),
  });
  if (result.error) return Response.json({ error: result.error }, { status: 503 });
  return Response.json({ profile: result.data });
}
