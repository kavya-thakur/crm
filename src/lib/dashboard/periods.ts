import { z } from "zod";
import { idParamSchema } from "@/lib/validations/common";
import { startOfToday } from "@/lib/work/tasks";

// The periods the dashboard can show. Days are the person's own days, in their browser's time zone.
export const DASHBOARD_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

function isTimeZone(timeZone: string) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

export const dashboardQuerySchema = z.object({
    range: z.enum(DASHBOARD_RANGES).default("30d"),
    /** narrow the deal and lead numbers to one agent; only for people who see the whole team */
    agentId: idParamSchema.optional(),
    /** narrow the deal numbers to one pipeline; all of them when left out */
    pipelineId: idParamSchema.optional(),
    /** where days start and end: the browser's time zone ("Asia/Kolkata") */
    timeZone: z.string().refine(isTimeZone, "Unknown time zone").default("UTC"),
});

// How far ahead of UTC a time zone's clocks are at a moment, in ms ("GMT+05:30" -> 5.5 hours)
function offsetAt(timeZone: string, at: number) {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")!.value;
    // plain "GMT" is UTC itself
    const [, sign, hours, minutes] = /([+-])(\d+):(\d+)/.exec(name) ?? ["", "+", "0", "0"];
    return (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
}

// The moment a calendar day starts in a time zone. Days and months may run over the end
// (day 0, month -3): Date.UTC rolls them into the right date.
function midnightIn(timeZone: string, year: number, month: number, day: number) {
    const utc = Date.UTC(year, month, day);
    // the offset is read again at the first guess, so a clock change that day lands right
    return new Date(utc - offsetAt(timeZone, utc - offsetAt(timeZone, utc)));
}

/**
 * Where a period starts and ends, the same-length period just before it (for the
 * "vs last period" numbers), and the slices its chart is drawn in:
 * 7 or 30 days -> one point a day, 90 days -> a week, 12 months -> a month.
 * The last slice always ends at `end` (tomorrow's midnight), so today is included.
 * `previousBuckets` slices the period before in the same way, slice for slice.
 * `today` is today's date as date-only columns (due dates) store it.
 */
export function dashboardPeriod(range: DashboardRange, timeZone = "UTC", now = new Date()) {
    const today = startOfToday(timeZone, now);
    const [year, month, day] = [today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()];
    // midnight so many days from today, or the 1st of the month so many months from this one
    const dayStart = (days: number) => midnightIn(timeZone, year, month, day + days);
    const monthStart = (months: number) => midnightIn(timeZone, year, month + months, 1);

    let buckets: Date[];
    let previousBuckets: Date[];
    if (range === "12m") {
        buckets = Array.from({ length: 12 }, (_, i) => monthStart(i - 11));
        previousBuckets = Array.from({ length: 12 }, (_, i) => monthStart(i - 23));
    } else {
        // 90 days is 13 weeks, ending with the week that contains today
        const [count, size] = range === "90d" ? [13, 7] : [range === "7d" ? 7 : 30, 1];
        buckets = Array.from({ length: count }, (_, i) => dayStart(1 + (i - count) * size));
        previousBuckets = Array.from({ length: count }, (_, i) => dayStart(1 + (i - 2 * count) * size));
    }

    return { today, start: buckets[0], end: dayStart(1), previousStart: previousBuckets[0], buckets, previousBuckets };
}

// Which slice a date falls in: the last bucket that starts at or before it
export function bucketIndex(buckets: Date[], date: Date) {
    for (let i = buckets.length - 1; i >= 0; i--) {
        if (date >= buckets[i]) return i;
    }
    return -1;
}
