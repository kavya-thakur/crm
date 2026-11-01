"use client";

import { useLayoutEffect, useRef, type ComponentType } from "react";
import gsap from "gsap";
import { Toaster as SonnerToaster, toast as sonner } from "sonner";
import { IconAlertCircle, IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from "@tabler/icons-react";

type ToastKind = "success" | "error" | "info" | "warning";

// Each kind's icon, the tint of the tile behind it, and how long it stays — errors
// linger longer because they need reading
const KINDS: Record<ToastKind, { icon: ComponentType<{ size?: number }>; tile: string; duration: number }> = {
    success: { icon: IconCircleCheck, tile: "bg-[#e6f6eb] text-[#00824d]", duration: 3500 },
    error: { icon: IconAlertCircle, tile: "bg-danger-soft text-danger", duration: 6000 },
    info: { icon: IconInfoCircle, tile: "bg-accent-soft text-accent", duration: 4000 },
    warning: { icon: IconAlertTriangle, tile: "bg-[#ffefd6] text-[#d14e00]", duration: 5000 },
};

// Mounted once in the root layout, centred at the top of the screen
export function Toaster() {
    return <SonnerToaster theme="light" position="top-center" gap={10} offset={16} visibleToasts={4} />;
}

function ToastCard({ id, kind, message, description }: { id: string | number; kind: ToastKind; message: string; description?: string }) {
    const tileRef = useRef<HTMLSpanElement>(null);
    const { icon: Icon, tile } = KINDS[kind];

    // The icon tile pops in with a little overshoot, which is what makes it feel responsive
    useLayoutEffect(() => {
        const media = gsap.matchMedia();

        media.add("(prefers-reduced-motion: no-preference)", () => {
            gsap.fromTo(tileRef.current, { scale: 0.4, rotation: -20, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.45, delay: 0.05, ease: "back.out(2.4)" });
        });

        return () => media.revert();
    }, []);

    return (
        <div
            role={kind === "error" ? "alert" : "status"}
            className="flex w-95 max-w-[calc(100vw-32px)] items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-heavy"
        >
            <span ref={tileRef} className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tile}`}>
                <Icon size={18} />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-medium text-ink">{message}</p>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>

            <button
                type="button"
                aria-label="Dismiss"
                onClick={() => sonner.dismiss(id)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint hover:bg-fill hover:text-ink"
            >
                <IconX size={14} />
            </button>
        </div>
    );
}

// The same message shown again (say, saving several fields in a row) refreshes the toast
// already on screen instead of stacking a copy of it
function show(kind: ToastKind, message: string, description?: string) {
    sonner.custom((id) => <ToastCard id={id} kind={kind} message={message} description={description} />, {
        id: `${kind}:${message}`,
        duration: KINDS[kind].duration,
    });
}

// Plain functions (not methods), so one can be passed straight as a callback:
// onError={toast.error}
export const toast = {
    success: (message: string, description?: string) => show("success", message, description),
    error: (message: string, description?: string) => show("error", message, description),
    info: (message: string, description?: string) => show("info", message, description),
    warning: (message: string, description?: string) => show("warning", message, description),
};
