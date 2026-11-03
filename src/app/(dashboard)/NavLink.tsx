"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { rememberedUrl } from "./shared/useUrlState";

// Client component because it needs the current URL to highlight itself, and to go back to a
// page the way you left it (board or list, your filters), not its defaults
export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    const active = usePathname().startsWith(href);
    const router = useRouter();

    return (
        <Link
            href={href}
            onClick={(event) => {
                // a new tab or window (cmd/ctrl/shift/middle click) just opens the plain page
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                router.push(rememberedUrl(href));
            }}
            className={`flex h-7 items-center gap-2 rounded-lg px-1 font-medium
                ${active ? "bg-fill text-ink" : "text-muted hover:bg-fill hover:text-ink"}`}
        >
            {children}
        </Link>
    );
}
