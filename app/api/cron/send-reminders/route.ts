export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  // Подключим здесь избранные события, начинающиеся через 7 дней, и Telegram Bot API.
  return Response.json({ ok: true, job: "send-reminders", status: "ready for Supabase and Telegram" });
}
