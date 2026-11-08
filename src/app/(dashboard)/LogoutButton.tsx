"use client";

import type { ReactNode } from "react";
import { api } from "@/lib/api/client";

/**
 * Logs out: the logout route clears the session cookies, then a full load of the sign-in page
 * (which also closes the live connection). A plain request rather than a server action with
 * redirect(): behind Render's proxy, Next.js tried to fetch the redirect's page over https from
 * its own plain-http port, and logged an SSL error every time.
 */
export function LogoutButton({ className, children, label }: { className: string; children: ReactNode; label?: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={className}
            onClick={async () => {
                await api.post("/auth/logout").catch(() => undefined);
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = "/login";
            }}
        >
            {children}
        </button>
    );
}
