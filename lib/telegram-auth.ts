import crypto from "node:crypto";

export function getTelegramUserId(initData: string | null | undefined): string | null {
  if (!initData || !process.env.TELEGRAM_BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!receivedHash || !authDate || Date.now() / 1000 - authDate > 86400) return null;
  const dataCheckString = [...params.entries()].filter(([key]) => key !== "hash").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calculatedHash.length !== receivedHash.length || !crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(receivedHash))) return null;
  const user = JSON.parse(params.get("user") || "{}") as { id?: number };
  return user.id ? String(user.id) : null;
}
