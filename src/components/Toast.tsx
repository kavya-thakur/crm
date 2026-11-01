"use client";

import { Toaster as SonnerToaster, toast } from "sonner";
import { IconAlertCircle, IconX } from "@tabler/icons-react";

// Mounted once in the root layout. showToast() is a plain function (sonner's
// toast() is a global emitter), so any client component can call it directly.
export function Toaster() {
    return <SonnerToaster theme="light" position="bottom-right" gap={8} />;
}

export function showToast(message: string) {
    toast.custom((id) => (
        <div className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-ink shadow-heavy">
            <IconAlertCircle size={18} className="shrink-0 text-danger" />
            <span className="flex-1 font-medium">{message}</span>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={() => toast.dismiss(id)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-faint hover:bg-fill hover:text-ink"
            >
                <IconX size={14} />
            </button>
        </div>
    ));
}
