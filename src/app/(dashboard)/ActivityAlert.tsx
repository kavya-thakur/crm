"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCalendarTime, IconCheck, IconUsers } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { formatDateTime } from "@/lib/utils/format";
import { linkedRecord } from "./shared/linkedRecord";
import {
    ACTIVITY_TYPES,
    RESCHEDULE_OPTIONS,
    durationLabel,
    fromDateTimeLocal,
    refreshActivities,
    toDateTimeLocal,
    type Activity,
    type Paginated,
} from "./activities/shared";

// One that started while the app was closed still pops up when it's opened, for this long
const MISSED_FOR_MS = 15 * 60 * 1000;
const SEEN_KEY = "flash:activity-alerts-seen";

/**
 * The big popup in the middle of the screen when one of your calls or meetings starts (yours,
 * or one you're tagged on), on whichever page you're on. The browser checks the time every
 * second, so it appears on the minute; the 10-minute heads-up before it is a toast from the
 * server (sendReminders). Closing it, rescheduling or marking it done stops it coming back in
 * this browser, in every tab. Mounted once in the dashboard layout.
 */
export function ActivityAlert() {
    const queryClient = useQueryClient();
    const [seen, setSeen] = useState<string[]>([]);
    // the one popping up now, and how late it is (worked out as it opens)
    const [due, setDue] = useState<{ id: number; minutesAgo: number } | null>(null);
    const [rescheduling, setRescheduling] = useState(false);
    const [pickedTime, setPickedTime] = useState("");

    // your next scheduled ones; refreshed live whenever activities change ("activities" key)
    const { data: activities } = useQuery({
        queryKey: ["activities", "starting"],
        queryFn: () =>
            api
                .get<Paginated<Activity>>("/activities", {
                    params: { scope: "all", status: "SCHEDULED", assignedTo: "me", from: new Date(Date.now() - MISSED_FOR_MS).toISOString(), limit: 20 },
                })
                .then((res) => res.data.data),
        refetchInterval: 5 * 60 * 1000,
    });

    // what's already been dealt with here, kept in step across tabs
    useEffect(() => {
        const read = () => setSeen(readSeen());
        read();
        window.addEventListener("storage", read);
        return () => window.removeEventListener("storage", read);
    }, []);

    useEffect(() => {
        const check = () => {
            const now = Date.now();
            const found = activities?.find((activity) => {
                const at = new Date(activity.scheduledAt).getTime();
                return at <= now && at > now - MISSED_FOR_MS && !seen.includes(seenId(activity));
            });
            setDue((current) =>
                !found ? null : current?.id === found.id ? current : { id: found.id, minutesAgo: Math.floor((now - new Date(found.scheduledAt).getTime()) / 60_000) },
            );
        };
        check();
        const timer = setInterval(check, 1000);
        return () => clearInterval(timer);
    }, [activities, seen]);

    const activity = activities?.find((item) => item.id === due?.id) ?? null;
    const dueId = due?.id ?? null;

    // a short chime as it opens, so it's noticed even when looking away
    useEffect(() => {
        if (dueId !== null) chime();
    }, [dueId]);

    function dismiss() {
        if (!activity) return;
        const next = [...seen, seenId(activity)].slice(-50);
        try {
            localStorage.setItem(SEEN_KEY, JSON.stringify(next));
        } catch {
            // storage blocked: it's still closed in this tab
        }
        setSeen(next);
        setRescheduling(false);
        setPickedTime("");
    }

    const update = useMutation({
        mutationFn: (changes: { status: "COMPLETED" } | { scheduledAt: string }) => api.put(`/activities/${activity!.id}`, changes),
        onSuccess: (_, changes) => {
            toast.success("status" in changes ? "Activity completed" : `Moved to ${formatDateTime(changes.scheduledAt)}`);
            dismiss();
            refreshActivities(queryClient);
        },
        onError: (error) => toast.error("Couldn't update the activity", errorMessage(error)),
    });

    const type = ACTIVITY_TYPES.find((item) => item.value === activity?.type) ?? ACTIVITY_TYPES[0];
    const record = activity ? linkedRecord(activity) : null;
    const button = "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 font-medium disabled:opacity-60";
    const secondary = `${button} border border-line text-ink hover:bg-fill`;

    return (
        <Modal open={activity !== null} onClose={dismiss}>
            {activity && (
                <div className="p-6">
                    <div className="flex flex-col items-center text-center">
                        <span className="flex size-14 animate-pulse items-center justify-center rounded-2xl bg-[#ffefd6] text-[#d14e00]">
                            <type.icon size={28} />
                        </span>
                        <p className="mt-4 text-sm font-medium text-[#d14e00]">
                            {type.label} {!due || due.minutesAgo < 1 ? "starting now" : `started ${due.minutesAgo} min ago`}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold break-words">{activity.title}</h2>
                        <p className="mt-2 flex items-center gap-1.5 text-muted">
                            <IconCalendarTime size={16} />
                            {formatDateTime(activity.scheduledAt)}
                            {activity.durationMinutes ? ` · ${durationLabel(activity.durationMinutes)}` : ""}
                        </p>
                        {record && (
                            <Link href={record.href} onClick={dismiss} className="mt-1 flex items-center gap-1.5 text-muted hover:text-ink hover:underline">
                                <record.icon size={16} />
                                {record.label}
                            </Link>
                        )}
                        {activity.attendees.length > 0 && (
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-faint">
                                <IconUsers size={16} />
                                With {[activity.assignedTo, ...activity.attendees].map((person) => person.name).join(", ")}
                            </p>
                        )}
                    </div>

                    {rescheduling ? (
                        <div className="mt-6">
                            <p className="mb-2 text-sm font-medium text-muted">Move it to</p>
                            {/* buttons, not a dropdown: a dialog would clip a floating menu */}
                            <div className="grid grid-cols-2 gap-2">
                                {RESCHEDULE_OPTIONS.map((option) => (
                                    <button
                                        key={option.label}
                                        type="button"
                                        disabled={update.isPending}
                                        onClick={() => update.mutate({ scheduledAt: option.at(activity.scheduledAt) })}
                                        className={secondary}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-2 flex gap-2">
                                <input
                                    type="datetime-local"
                                    aria-label="Another time"
                                    value={pickedTime}
                                    min={toDateTimeLocal(new Date().toISOString())}
                                    onChange={(event) => setPickedTime(event.target.value)}
                                    className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2"
                                />
                                <button
                                    type="button"
                                    disabled={!fromDateTimeLocal(pickedTime) || update.isPending}
                                    onClick={() => update.mutate({ scheduledAt: fromDateTimeLocal(pickedTime) })}
                                    className={`${button} bg-accent text-on-accent hover:bg-accent-hover`}
                                >
                                    {update.isPending && <Spinner size={14} />}
                                    Save
                                </button>
                            </div>
                            <button type="button" onClick={() => setRescheduling(false)} className="mt-3 w-full text-sm text-muted hover:text-ink">
                                Back
                            </button>
                        </div>
                    ) : (
                        <div className="mt-6 grid gap-2">
                            <button
                                type="button"
                                disabled={update.isPending}
                                onClick={() => update.mutate({ status: "COMPLETED" })}
                                className={`${button} bg-accent text-on-accent hover:bg-accent-hover`}
                            >
                                {update.isPending ? <Spinner size={14} /> : <IconCheck size={16} />}
                                Mark as done
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setRescheduling(true)} className={secondary}>
                                    Reschedule
                                </button>
                                <Link href={`/activities?open=${activity.id}`} onClick={dismiss} className={secondary}>
                                    Open
                                </Link>
                            </div>
                            <button type="button" onClick={dismiss} className="mt-1 text-sm text-muted hover:text-ink">
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

// the same activity moved to a new time counts as new: it pops up again then
const seenId = (activity: Activity) => `${activity.id}@${activity.scheduledAt}`;

function readSeen(): string[] {
    try {
        const saved = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

// Two soft beeps. Browsers only allow sound after the person has clicked on the page once,
// which anyone using the app has; if not, it's just silent.
function chime() {
    try {
        const context = new AudioContext();
        for (const start of [0, 0.35]) {
            const tone = context.createOscillator();
            const volume = context.createGain();
            tone.frequency.value = 880;
            volume.gain.setValueAtTime(0.15, context.currentTime + start);
            volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + 0.3);
            tone.connect(volume).connect(context.destination);
            tone.start(context.currentTime + start);
            tone.stop(context.currentTime + start + 0.3);
        }
    } catch {
        // no audio here: the popup still shows
    }
}
