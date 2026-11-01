import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight } from "@tabler/icons-react";

// The folder silhouette as one clipped shape, used for the dark cards: built from separate
// pieces, the pieces' sub-pixel seams show up as hairlines against a dark fill
const FOLDER_CLIP = "polygon(0 0, 66.666% 0, calc(66.666% + 56px) 25px, 100% 25px, 100% 100%, 0 100%)";

// twenty.com's card shape: like a paper folder, the left two-thirds of the top edge
// sits a little higher, sloping down to meet the rest of the top on the right. The light
// card is drawn from pieces so it can have a thin outline all the way round.
export function FolderCard({ dark = false, className = "", children }: { dark?: boolean; className?: string; children: ReactNode }) {
    if (dark) {
        return (
            <div className={`flex flex-col bg-[#1c1c1c] px-4 pt-6.5 pb-4 ${className}`} style={{ clipPath: FOLDER_CLIP }}>
                {children}
            </div>
        );
    }

    const line = "border-[#1c1c1c]/12";
    const fill = "#ffffff";
    const stroke = "rgb(28 28 28 / 0.12)";

    return (
        <div className={`flex flex-col ${className}`}>
            <div aria-hidden className="flex h-6.5">
                <div className={`w-2/3 rounded-tl-xs border-t border-l ${line}`} style={{ backgroundColor: fill }} />
                <svg width="64" height="26" viewBox="0 0 64 26" className="shrink-0">
                    <path d="M0 0.5 L56 25.5 H64 V26 H0 Z" fill={fill} />
                    <path d="M0 0.5 L56 25.5 H64" fill="none" stroke={stroke} />
                </svg>
                <div className={`flex-1 rounded-tr-xs border-r border-b ${line}`} />
            </div>
            <div className={`flex flex-1 flex-col border-x border-b px-4 pb-4 ${line}`} style={{ backgroundColor: fill }}>
                {children}
            </div>
        </div>
    );
}

// The square arrow button in a card's corner, with the same cut corner as the buttons
export function ArrowTile({ href, label, dark = false }: { href: string; label: string; dark?: boolean }) {
    return (
        <Link
            href={href}
            aria-label={label}
            className={`group relative flex size-10 shrink-0 items-center justify-center ${dark ? "text-white" : "text-[#1c1c1c]"}`}
        >
            <svg aria-hidden width="40" height="40" viewBox="0 0 40 40" className="absolute inset-0">
                <path
                    d="M4 0.5 H36 A3.5 3.5 0 0 1 39.5 4 V28 L28 39.5 H4 A3.5 3.5 0 0 1 0.5 36 V4 A3.5 3.5 0 0 1 4 0.5 Z"
                    className="fill-transparent stroke-current/25 transition-colors duration-200 group-hover:fill-current/5"
                />
            </svg>
            <IconArrowRight size={18} className="relative transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
    );
}
