"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";

// On every page while logged in as a teammate, so nobody forgets whose account this is
export function LoggedInAsBar({ name, realName }: { name: string; realName: string }) {
    const [leaving, setLeaving] = useState(false);

    async function back() {
        setLeaving(true);
        const { data } = await api.post<{ signedOut: boolean; goTo?: string }>("/auth/back");
        // a full page load: the sidebar, the permissions and the live connection are yours again
        window.location.href = data.signedOut ? "/login" : (data.goTo ?? "/settings/members");
    }

    return (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#ffefd6] px-3 py-1.5 text-sm text-[#ab4800]">
            <span>
                You&apos;re logged in as <span className="font-semibold">{name}</span> ({realName}). Anything you change is saved as theirs.
            </span>
            <button type="button" onClick={back} disabled={leaving} className="rounded-md bg-white/70 px-2 py-0.5 font-medium hover:bg-white disabled:opacity-60">
                Back to my account
            </button>
        </div>
    );
}
