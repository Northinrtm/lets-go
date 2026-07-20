import { supabaseRequest } from "@/lib/supabase-admin";

type Profile = { id: string; telegram_user_id: string; interest_text: string };

type FoundEvent = {
  source_url: string;
  title: string;
  category: string | null;
  description: string | null;
  explanation: string | null;
  venue: string | null;
  starts_at: string | null;
  city: string;
  raw_data: Record<string, unknown>;
};

function parseEvents(result: string, interest: string): FoundEvent[] {
  const fenced = result.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || result.match(/[\[{][\s\S]*[\]}]/)?.[0];
  if (!candidate) return [];

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const items = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events) ? (parsed as { events: unknown[] }).events : []);
    return items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      const title = typeof value.title === "string" ? value.title.trim() : "";
      const url = typeof value.url === "string" ? value.url.trim() : "";
      if (!title || !/^https?:\/\//i.test(url)) return [];
      const startsAt = typeof value.starts_at === "string" && value.starts_at.trim() ? value.starts_at.trim() : null;
      return [{
        source_url: url,
        title,
        category: typeof value.category === "string" ? value.category.trim() : null,
        description: typeof value.description === "string" ? value.description.trim() : null,
        explanation: typeof value.explanation === "string" ? value.explanation.trim() : `Подходит по интересу «${interest}».`,
        venue: typeof value.venue === "string" ? value.venue.trim() : null,
        starts_at: startsAt,
        city: "Москва",
        raw_data: { ...value, interest },
      }];
    });
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (secret && authorization !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const jobId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ event: "daily_search_started", jobId, startedAt }));

  const profiles = await supabaseRequest<Profile[]>("profiles?select=id,telegram_user_id,interest_text&interest_text=neq.");
  if (profiles.error) {
    console.error(JSON.stringify({ event: "daily_search_failed", jobId, stage: "load_profiles", error: profiles.error }));
    return Response.json({ ok: false, jobId, error: "Не удалось загрузить пользователей" }, { status: 503 });
  }

  const results = [];
  for (const profile of profiles.data || []) {
    const interests = profile.interest_text.split(/\.\s+/).map((item) => item.trim()).filter(Boolean);
    const runStartedAt = new Date().toISOString();
    try {
      const searchResponse = await fetch(new URL("/api/search", request.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests, date: "все актуальные будущие события без ограничения по периоду" }),
      });
      const searchResult = await searchResponse.json();
      const foundEvents: FoundEvent[] = searchResponse.ok ? (searchResult.results || []).flatMap((item: { interest?: string; result?: string }) => parseEvents(item.result || "", item.interest || "")) : [];
      const uniqueEvents = [...new Map(foundEvents.map((event) => [event.source_url, event])).values()];
      const stored = uniqueEvents.length ? await supabaseRequest("events?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(uniqueEvents) }) : { error: null };
      const status = searchResponse.ok && !stored.error ? "success" : "failed";
      await supabaseRequest("search_runs", { method: "POST", body: JSON.stringify({ profile_id: profile.id, status, interests_count: interests.length, result_count: uniqueEvents.length, error_message: searchResult.error || stored.error || null, started_at: runStartedAt, finished_at: new Date().toISOString(), result: searchResult }) });
      console.log(JSON.stringify({ event: "daily_search_profile_finished", jobId, profileId: profile.id, interestsCount: interests.length, eventsFound: uniqueEvents.length, status }));
      results.push({ profileId: profile.id, status, interestsCount: interests.length, eventsFound: uniqueEvents.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await supabaseRequest("search_runs", { method: "POST", body: JSON.stringify({ profile_id: profile.id, status: "failed", interests_count: interests.length, error_message: message, started_at: runStartedAt, finished_at: new Date().toISOString() }) });
      console.error(JSON.stringify({ event: "daily_search_profile_failed", jobId, profileId: profile.id, error: message }));
      results.push({ profileId: profile.id, status: "failed", error: message });
    }
  }

  console.log(JSON.stringify({ event: "daily_search_finished", jobId, profilesCount: profiles.data?.length || 0, resultsCount: results.length }));
  return Response.json({ ok: true, jobId, profilesCount: profiles.data?.length || 0, results });
}
