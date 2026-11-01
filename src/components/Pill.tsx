import type { ReactNode } from "react";

import { TONES, type Tone } from "./SectionIcon";

// A small rounded label: "Won", "Lost", "You", "Required". Uses the same pastel tones as
// the section icons; "neutral" is plain grey for labels that aren't saying anything good
// or bad, like a field's type.
export function Pill({ tone = "neutral", children }: { tone?: Tone | "neutral"; children: ReactNode }) {
    const colours = tone === "neutral" ? "bg-app text-muted ring-black/5" : TONES[tone];

    return (
        <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset ${colours}`}>
            {children}
        </span>
    );
}
