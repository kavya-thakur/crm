import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * "Is the app up?": for the host's health check, and for a free uptime monitor (UptimeRobot,
 * cron-job.org) pinging it every few minutes so a free server that sleeps when idle stays
 * awake, and a webhook from Google Ads or Zapier never waits for it to wake up.
 */
export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false, message: "Database unreachable" }, { status: 503 });
    }
}
