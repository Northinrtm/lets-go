import { supabaseRequest } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return Response.json({ error: "Нужен profileId" }, { status: 400 });
  const result = await supabaseRequest<Array<{ event_id: string; reminder_enabled: boolean }>>(`favorites?select=event_id,reminder_enabled&profile_id=eq.${encodeURIComponent(profileId)}`);
  if (result.error) return Response.json({ error: result.error }, { status: 503 });
  return Response.json({ favorites: result.data || [] });
}

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

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { profileId?: string; eventId?: string } | null;
  if (!body?.profileId || !body.eventId) return Response.json({ error: "Нужны profileId и eventId" }, { status: 400 });
  const result = await supabaseRequest(`favorites?profile_id=eq.${encodeURIComponent(body.profileId)}&event_id=eq.${encodeURIComponent(body.eventId)}`, { method: "DELETE" });
  if (result.error) return Response.json({ error: result.error }, { status: 503 });
  return Response.json({ ok: true });
}
