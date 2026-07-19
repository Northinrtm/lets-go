import { supabaseRequest } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { profileId?: string; eventId?: string; reminderEnabled?: boolean } | null;
  if (!body?.profileId || !body.eventId) return Response.json({ error: "Нужны profileId и eventId" }, { status: 400 });
  const result = await supabaseRequest("favorites?on_conflict=profile_id,event_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ profile_id: body.profileId, event_id: body.eventId, reminder_enabled: body.reminderEnabled ?? false }),
  });
  if (result.error) return Response.json({ error: result.error }, { status: 503 });
  return Response.json({ favorite: result.data });
}
