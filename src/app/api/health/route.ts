import { NextResponse } from "next/server";

/**
 * "Is the server up?": for the host's health check, and for a free uptime monitor (UptimeRobot,
 * cron-job.org) pinging it every few minutes so a free server that sleeps when idle stays awake.
 * It doesn't touch the database, on purpose: a ping every few minutes would keep a free Neon
 * database awake all month and use up its hours, and a database hiccup would make the host take
 * the whole site down (landing page included) instead of just the pages that need data.
 */
export function GET() {
    return NextResponse.json({ ok: true });
}
