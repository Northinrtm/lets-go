import { supabaseRequest } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { telegramUserId?: string; chatId?: string; interestText?: string } | null;
  if (!body?.telegramUserId) return Response.json({ error: "Нужен telegramUserId" }, { status: 400 });
  const result = await supabaseRequest("profiles?on_conflict=telegram_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ telegram_user_id: body.telegramUserId, telegram_chat_id: body.chatId || null, interest_text: body.interestText || "" }),
  });
  if (result.error) return Response.json({ error: result.error }, { status: 503 });
  return Response.json({ profile: result.data });
}
