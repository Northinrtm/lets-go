export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  // Подключим здесь перебор пользователей из Supabase:
  // найти их интересы, выполнить поиск, убрать события по URL и сохранить новые.
  return Response.json({ ok: true, job: "daily-search", status: "ready for Supabase" });
}
