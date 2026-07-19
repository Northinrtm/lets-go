import { supabaseRequest } from "@/lib/supabase-admin";

type Profile = { id: string; telegram_user_id: string; interest_text: string };

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
      const status = searchResponse.ok ? "success" : "failed";
      await supabaseRequest("search_runs", { method: "POST", body: JSON.stringify({ profile_id: profile.id, status, interests_count: interests.length, result_count: searchResult.results?.length || 0, error_message: searchResult.error || null, started_at: runStartedAt, finished_at: new Date().toISOString(), result: searchResult }) });
      console.log(JSON.stringify({ event: "daily_search_profile_finished", jobId, profileId: profile.id, interestsCount: interests.length, status }));
      results.push({ profileId: profile.id, status, interestsCount: interests.length });
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
