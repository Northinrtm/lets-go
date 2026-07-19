import { demoEvents } from "@/lib/events";

export async function GET() {
  return Response.json({ events: demoEvents, source: "demo" });
}
