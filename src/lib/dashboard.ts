import { z } from "zod";
import { idParamSchema } from "./validations/common";
import { startOfToday } from "./tasks";

// The periods the dashboard can show. Days are UTC days, the same "today" tasks use.
export const DASHBOARD_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const dashboardQuerySchema = z.object({
    range: z.enum(DASHBOARD_RANGES).default("30d"),
    /** narrow the deal and lead numbers to one agent; only for people who see the whole team */
    agentId: idParamSchema.optional(),
});

const DAY = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * DAY);
}

function addMonths(date: Date, months: number) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/**
 * Where a period starts and ends, the same-length period just before it (for the
 * "vs last period" numbers), and the slices its chart is drawn in:
 * 7 or 30 days -> one point a day, 90 days -> a week, 12 months -> a month.
 * The last slice always ends at `end` (tomorrow's midnight), so today is included.
 * `previousBuckets` slices the period before in the same way, slice for slice.
 */
export function dashboardPeriod(range: DashboardRange, today = startOfToday()) {
    const end = addDays(today, 1);

    let buckets: Date[];
    let previousBuckets: Date[];
    if (range === "12m") {
        const thisMonth = addMonths(today, 0);
        buckets = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11));
        previousBuckets = buckets.map((month) => addMonths(month, -12));
    } else {
        // 90 days is 13 weeks, ending with the week that contains today
        const [count, size] = range === "90d" ? [13, 7] : [range === "7d" ? 7 : 30, 1];
        buckets = Array.from({ length: count }, (_, i) => addDays(end, (i - count) * size));
        previousBuckets = buckets.map((day) => addDays(day, -count * size));
    }

    return { start: buckets[0], end, previousStart: previousBuckets[0], buckets, previousBuckets };
}

// Which slice a date falls in: the last bucket that starts at or before it
export function bucketIndex(buckets: Date[], date: Date) {
    for (let i = buckets.length - 1; i >= 0; i--) {
        if (date >= buckets[i]) return i;
    }
    return -1;
}
