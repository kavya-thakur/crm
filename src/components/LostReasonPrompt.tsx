"use client";

import { useEffect, useState } from "react";
import { IconCheck } from "@tabler/icons-react";

import { LOST_REASONS } from "@/lib/lostReasons";
import { Modal } from "./Modal";

// The reason picked, null for "skip", or undefined when the move was called off
type Answer = { lostReason: string | null } | undefined;

let show: ((what: string, resolve: (answer: Answer) => void) => void) | null = null;

/**
 * Asks why a lead or deal was lost, before it's moved to a lost stage:
 *   const answer = await askLostReason("deal");
 *   if (answer) move({ ...answer });   // undefined = they closed it, so don't move
 * The prompt itself is <LostReasonPrompt />, mounted once in the dashboard layout.
 */
export function askLostReason(what: "lead" | "deal") {
    return new Promise<Answer>((resolve) => (show ? show(what, resolve) : resolve({ lostReason: null })));
}

export function LostReasonPrompt() {
    const [request, setRequest] = useState<{ what: string; resolve: (answer: Answer) => void } | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const [other, setOther] = useState("");

    useEffect(() => {
        show = (what, resolve) => {
            setPicked(null);
            setOther("");
            setRequest({ what, resolve });
        };
        return () => {
            show = null;
        };
    }, []);

    function finish(answer: Answer) {
        request?.resolve(answer);
        setRequest(null);
    }

    const reason = picked === "Other" ? other.trim() : picked;

    return (
        <Modal open={request !== null} onClose={() => finish(undefined)}>
            <form
                className="p-6"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (reason) finish({ lostReason: reason });
                }}
            >
                <h2 className="text-lg font-semibold">Why was this {request?.what} lost?</h2>
                <p className="mt-1 text-muted">It shows on the dashboard, so you can see what keeps costing you sales.</p>

                <div role="radiogroup" aria-label="Reason" className="mt-4 grid grid-cols-2 gap-2">
                    {[...LOST_REASONS, "Other"].map((option) => {
                        const selected = picked === option;
                        return (
                            <button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setPicked(option)}
                                className={`flex h-9 items-center justify-between gap-2 rounded-lg border px-3 text-left transition-colors ${
                                    selected ? "border-accent bg-accent-faint text-ink" : "border-line text-muted hover:bg-paper hover:text-ink"
                                }`}
                            >
                                <span className="truncate">{option}</span>
                                {selected && <IconCheck size={14} className="shrink-0 text-accent" />}
                            </button>
                        );
                    })}
                </div>

                {picked === "Other" && (
                    <input
                        autoFocus
                        aria-label="Reason"
                        value={other}
                        onChange={(e) => setOther(e.target.value)}
                        maxLength={200}
                        placeholder="What happened?"
                        className="mt-2 h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                )}

                <div className="mt-6 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => finish({ lostReason: null })} className="mr-auto h-8 px-1 font-medium text-muted hover:text-ink">
                        Skip
                    </button>
                    <button
                        type="button"
                        onClick={() => finish(undefined)}
                        className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!reason}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                    >
                        Mark as lost
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// A lost record's reason in its side panel; clicking it asks again
export function LostReasonValue({
    what,
    reason,
    editable,
    onChange,
}: {
    what: "lead" | "deal";
    reason: string | null;
    editable: boolean;
    onChange: (lostReason: string | null) => void;
}) {
    const text = reason ?? <span className="text-light">{editable ? "Add a reason" : "Not recorded"}</span>;
    if (!editable) return <span className="truncate px-1">{text}</span>;

    return (
        <button
            type="button"
            onClick={async () => {
                const answer = await askLostReason(what);
                if (answer && answer.lostReason !== reason) onChange(answer.lostReason);
            }}
            className="flex h-7 max-w-full items-center rounded-lg px-1 text-left hover:bg-fill"
        >
            <span className="truncate">{text}</span>
        </button>
    );
}
