import type { QueryClient } from "@tanstack/react-query";
import { IconCalendarEvent, IconPhoneCall, IconUsers } from "@tabler/icons-react";

// After any change: refetch every activity list and the open activity
export function refreshActivities(queryClient: QueryClient) {
    for (const key of ["activities", "activity"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
    }
}

export type ActivityType = "CALL" | "MEETING" | "OTHER";
export type ActivityStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
// "today" is the rest of today, like the board's Today column (the API gets it as upcoming up to midnight)
export type ActivityScope = "today" | "upcoming" | "overdue" | "completed" | "cancelled" | "all";

interface Agent {
    id: number;
    name: string;
    email: string;
}

export interface Activity {
    id: number;
    type: ActivityType;
    status: ActivityStatus;
    title: string;
    description: string | null;
    // the moment it happens, an ISO datetime
    scheduledAt: string;
    durationMinutes: number | null;
    createdAt: string;
    updatedAt: string;
    assignedTo: Agent;
    // everyone else tagged on it
    attendees: Agent[];
    lead: { id: number; name: string } | null;
    deal: { id: number; title: string } | null;
    contact: { id: number; name: string } | null;
}

// The one record a new activity is about, if any
export interface ActivityLink {
    leadId?: number;
    dealId?: number;
    contactId?: number;
}

export interface Paginated<T> {
    data: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: typeof IconPhoneCall }[] = [
    { value: "CALL", label: "Call", icon: IconPhoneCall },
    { value: "MEETING", label: "Meeting", icon: IconUsers },
    { value: "OTHER", label: "Other", icon: IconCalendarEvent },
];

export const ACTIVITY_STATUSES: { value: ActivityStatus; label: string }[] = [
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
];

// Minutes offered when booking one; the API accepts any length up to 24 hours
export const DURATIONS = [15, 30, 45, 60, 90, 120];

export function durationLabel(minutes: number) {
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

// Still on the books but its time has passed — same rule the Overdue tab uses
export function isOverdue(activity: Activity) {
    return activity.status === "SCHEDULED" && new Date(activity.scheduledAt) < new Date();
}

// <input type="datetime-local"> works in the viewer's local time without a timezone,
// while the API stores an exact moment — these convert between the two
export function toDateTimeLocal(iso: string) {
    const date = new Date(iso);
    const pad = (value: number) => String(value).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(local: string) {
    const date = new Date(local);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// The start of the next hour: a sensible default for "when", as an ISO datetime
export function nextFullHour() {
    const date = new Date();
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return date.toISOString();
}

// Quick ways to move an activity, as ISO datetimes: from now, or tomorrow at the same time of day
export const RESCHEDULE_OPTIONS: { label: string; at: (scheduledAt: string) => string }[] = [
    { label: "In 10 minutes", at: () => minutesFromNow(10) },
    { label: "In 30 minutes", at: () => minutesFromNow(30) },
    { label: "In 1 hour", at: () => minutesFromNow(60) },
    {
        label: "Tomorrow, same time",
        at: (scheduledAt) => {
            const was = new Date(scheduledAt);
            const date = new Date();
            date.setDate(date.getDate() + 1);
            date.setHours(was.getHours(), was.getMinutes(), 0, 0);
            return date.toISOString();
        },
    },
];

// to the whole minute, like the time pickers
function minutesFromNow(minutes: number) {
    const date = new Date(Date.now() + minutes * 60_000);
    date.setSeconds(0, 0);
    return date.toISOString();
}
