import crypto from "node:crypto";
import { supabaseRequest } from "@/lib/supabase-admin";

function isValidTelegramLogin(params: URLSearchParams, botToken: string) {
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!receivedHash || !authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return false;
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(receivedHash));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !isValidTelegramLogin(url.searchParams, token)) return new Response("Telegram login verification failed", { status: 401 });

  const telegramUserId = url.searchParams.get("id");
  if (!telegramUserId) return new Response("Missing Telegram user id", { status: 400 });
  await supabaseRequest("profiles?on_conflict=telegram_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ telegram_user_id: telegramUserId }),
  });

  const user = { id: telegramUserId, username: url.searchParams.get("username"), first_name: url.searchParams.get("first_name") };
  const response = Response.redirect(new URL("/", request.url));
  response.headers.append("Set-Cookie", `letsgo_telegram_user=${Buffer.from(JSON.stringify(user)).toString("base64url")}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  return response;
}
