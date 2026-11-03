"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { IconMenu2 } from "@tabler/icons-react";

/**
 * The sidebar's frame. On a desktop or tablet it's the column on the left, as always. On a phone
 * (below md) it's hidden behind a ☰ button in a slim top bar and slides in over the page, closing
 * when you pick a page or tap outside it. Its contents come from the (server) layout.
 */
export function SidebarShell({ title, children }: { title: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);

    // a new page: the drawer has done its job
    const pathname = usePathname();
    const [shownFor, setShownFor] = useState(pathname);
    if (pathname !== shownFor) {
        setShownFor(pathname);
        setOpen(false);
    }

    return (
        <>
            <div className="flex h-12 shrink-0 items-center gap-2 px-2 md:hidden">
                <button
                    type="button"
                    aria-label="Open the menu"
                    aria-expanded={open}
                    onClick={() => setOpen(true)}
                    className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
                >
                    <IconMenu2 size={20} />
                </button>
                <span className="truncate font-medium">{title}</span>
            </div>

            {open && <div aria-hidden className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-4 bg-shell px-2 py-3 shadow-strong transition-transform duration-200 ease-out
                    md:static md:z-auto md:w-55 md:shrink-0 md:translate-x-0 md:shadow-none
                    ${open ? "translate-x-0" : "-translate-x-full"}`}
            >
                {children}
            </aside>
        </>
    );
}
