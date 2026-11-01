"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import axios from "axios";
import gsap from "gsap";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

import { errorMessage } from "@/lib/api/client";
import { Spinner } from "./Loader";

interface ErrorStateProps {
    /** what failed, e.g. "Couldn't load tasks" */
    title?: string;
    /** the failure itself: its message is shown underneath (the API's own wording when it has one) */
    error?: unknown;
    /** overrides the message taken from `error` */
    message?: string;
    /** shows a "Try again" button */
    onRetry?: () => void;
    /** the retry is running: swaps the button's icon for a spinner */
    retrying?: boolean;
    /** replaces the Try again button, e.g. with a link home */
    action?: ReactNode;
    /** replaces the warning triangle */
    icon?: ReactNode;
    /** "page" fills the space it's in; "inline" is a single compact row for a section or tab */
    variant?: "page" | "inline";
}

// A request the server turned down (not found, no access, invalid) won't work the second
// time either, so only offer to retry failures that might be temporary
function isClientError(error: unknown) {
    return axios.isAxiosError(error) && error.response !== undefined && error.response.status < 500;
}

export function ErrorState({ title = "Something went wrong", error, message, onRetry, retrying, action, icon, variant = "page" }: ErrorStateProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLSpanElement>(null);

    const description = message ?? errorMessage(error);
    const canRetry = onRetry && !isClientError(error);

    useLayoutEffect(() => {
        const media = gsap.matchMedia();

        media.add("(prefers-reduced-motion: no-preference)", () => {
            gsap.fromTo(rootRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });

            if (variant === "page") {
                // the icon pops in, then gives one small shake: "something's wrong", not alarm
                gsap
                    .timeline({ delay: 0.1 })
                    .fromTo(iconRef.current, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.2)" })
                    .to(iconRef.current, { keyframes: { rotation: [0, -8, 8, -5, 5, 0] }, duration: 0.5, ease: "power1.inOut" }, "-=0.05");
            }
        });
        media.add("(prefers-reduced-motion: reduce)", () => {
            gsap.set([rootRef.current, iconRef.current], { opacity: 1 });
        });

        return () => media.revert();
    }, [variant]);

    const retryButton = canRetry && (
        <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className={
                variant === "page"
                    ? "flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 font-medium text-ink shadow-light hover:bg-paper disabled:opacity-60"
                    : "flex h-6 shrink-0 items-center gap-1 rounded-lg px-2 font-medium hover:bg-danger/10 disabled:opacity-60"
            }
        >
            {retrying ? <Spinner size={14} /> : <IconRefresh size={14} />}
            {variant === "page" ? "Try again" : "Retry"}
        </button>
    );

    if (variant === "inline") {
        return (
            <div ref={rootRef} role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-danger opacity-0">
                {icon ?? <IconAlertTriangle size={16} className="shrink-0" />}
                <p className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{title}.</span> {description}
                </p>
                {retryButton}
                {action}
            </div>
        );
    }

    return (
        <div ref={rootRef} role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center opacity-0">
            <span
                ref={iconRef}
                className="flex size-12 items-center justify-center rounded-xl border border-danger/20 bg-danger-soft text-danger opacity-0"
            >
                {icon ?? <IconAlertTriangle size={22} />}
            </span>
            <div className="max-w-sm">
                <p className="text-base font-semibold text-ink">{title}</p>
                <p className="mt-1 text-muted">{description}</p>
            </div>
            {retryButton}
            {action}
        </div>
    );
}
