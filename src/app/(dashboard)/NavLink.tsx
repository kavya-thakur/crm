"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Client component only because it needs the current URL to highlight itself
export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    const active = usePathname().startsWith(href);

    return (
        <Link
            href={href}
            className={`flex h-7 items-center gap-2 rounded-lg px-1 font-medium
                ${active ? "bg-fill text-ink" : "text-muted hover:bg-fill hover:text-ink"}`}
        >
            {children}
        </Link>
    );
}
