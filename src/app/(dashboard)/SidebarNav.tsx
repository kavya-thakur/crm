"use client";

import { useEffect, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IconHome, IconSettings } from "@tabler/icons-react";

import { SectionIcon } from "@/components/SectionIcon";
import NavLink from "./NavLink";
import type { MenuPage } from "./CommandMenu";

export interface NavGroup {
    label: string;
    pages: MenuPage[];
}

// where Home goes back to: the last workspace page you were on before opening Settings
const LAST_PAGE_KEY = "flash:last-workspace-page";

/**
 * twenty.com's sidebar: two tabs at the top, Home and Settings. Home lists the workspace
 * (leads, deals, ...); Settings swaps the same sidebar for the settings pages. Which one
 * shows follows the URL, so a refresh or a shared /settings link lands in the right mode.
 */
export default function SidebarNav({ workspace, settings }: { workspace: NavGroup; settings: NavGroup[] }) {
    const pathname = usePathname();
    const router = useRouter();
    const inSettings = pathname.startsWith("/settings");

    useEffect(() => {
        if (inSettings) return;
        try {
            sessionStorage.setItem(LAST_PAGE_KEY, pathname + window.location.search);
        } catch {
            // no storage (private window): Home just goes to the dashboard
        }
    }, [pathname, inSettings]);

    function goHome() {
        let last: string | null = null;
        try {
            last = sessionStorage.getItem(LAST_PAGE_KEY);
        } catch {}
        router.push(last ?? "/dashboard");
    }

    return (
        <>
            <div role="group" aria-label="Navigation mode" className="-mt-1 flex items-center gap-1 border-b border-line pb-2">
                <ModeTab label="Home" icon={IconHome} active={!inSettings} onClick={goHome} />
                <ModeTab label="Settings" icon={IconSettings} active={inSettings} onClick={() => router.push(settings[0].pages[0].href)} />
            </div>

            {/* the list swaps with a quick fade, keyed by mode */}
            <div key={inSettings ? "settings" : "home"} className="flex animate-[fade-in_0.15s_ease-out] flex-col gap-4">
                {(inSettings ? settings : [workspace]).map((group) => (
                    <nav key={group.label} aria-label={group.label} className="flex flex-col gap-0.5">
                        <p className="flex h-7 items-center px-1 text-xs font-semibold text-light">{group.label}</p>
                        {group.pages.map((page) => (
                            <NavLink key={page.href} href={page.href}>
                                <SectionIcon section={page.section} />
                                {page.label}
                            </NavLink>
                        ))}
                    </nav>
                ))}
            </div>
        </>
    );
}

// The active tab shows its name; the other is just its icon, like twenty.com's
function ModeTab({ label, icon: Icon, active, onClick }: { label: string; icon: ComponentType<{ size?: number }>; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`flex h-7 items-center gap-1.5 rounded-lg font-medium transition-colors ${
                active ? "bg-fill px-2 text-ink" : "w-7 justify-center text-muted hover:bg-fill hover:text-ink"
            }`}
        >
            <Icon size={16} />
            {active && label}
        </button>
    );
}
