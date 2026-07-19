type SupabaseResponse<T> = { data: T | null; error: string | null };

function config() {
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

export async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<SupabaseResponse<T>> {
  const { url, key } = config();
  if (!url || !key) return { data: null, error: "Supabase не настроен" };
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok) return { data: null, error: await response.text() };
  const text = await response.text();
  return { data: text ? JSON.parse(text) as T : null, error: null };
}
