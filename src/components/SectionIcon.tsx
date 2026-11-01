import type { ComponentType } from "react";
import {
    IconAdjustmentsHorizontal,
    IconBriefcase,
    IconCalendarEvent,
    IconCheckbox,
    IconLayoutKanban,
    IconNotes,
    IconShieldLock,
    IconTargetArrow,
    IconUser,
    IconUserCircle,
    IconUsers,
} from "@tabler/icons-react";

// Soft pastel backgrounds with a deeper, slightly muted ink of the same hue, and a
// hairline ring of that ink, so the tiles read as calm and premium rather than loud
export const TONES = {
    red: "bg-[#fdebe8] text-[#c4493d] ring-[#c4493d]/15",
    green: "bg-[#e4f4ea] text-[#2f8656] ring-[#2f8656]/15",
    blue: "bg-[#e6eefb] text-[#3d68c4] ring-[#3d68c4]/15",
    violet: "bg-[#efeafc] text-[#7356c4] ring-[#7356c4]/15",
    amber: "bg-[#fcf0dd] text-[#b9741c] ring-[#b9741c]/15",
    teal: "bg-[#e0f3f0] text-[#28806f] ring-[#28806f]/15",
    indigo: "bg-[#e9eafb] text-[#5157bf] ring-[#5157bf]/15",
    rose: "bg-[#fbe9f1] text-[#b8457a] ring-[#b8457a]/15",
    sky: "bg-[#e2f2fa] text-[#2c7fa6] ring-[#2c7fa6]/15",
    orange: "bg-[#fcebe0] text-[#bd5f2a] ring-[#bd5f2a]/15",
    lime: "bg-[#edf5df] text-[#61852a] ring-[#61852a]/15",
    slate: "bg-[#eceef2] text-[#5a6272] ring-[#5a6272]/15",
} as const;

export type Tone = keyof typeof TONES;
type Icon = ComponentType<{ size?: number; className?: string; stroke?: number; color?: string }>;

// The icon colours twenty.com's own sidebar uses (the Radix colour scale, step 11): a
// plain coloured line icon, no box behind it
const INKS = {
    red: "#ce2c31",
    green: "#218358",
    blue: "#3a5bc7",
    violet: "#6550b9",
    teal: "#008573",
    orange: "#cc4e00",
    grey: "#666666",
} as const;

// Every part of the app, with its icon and colour. The icons are the same Tabler icons
// twenty.com's sidebar uses wherever there's a match (target, user, checkbox, notes). The sidebar, the page headers and
// the settings pages all read from here, so a section looks the same everywhere.
// Settings items are grey, the way twenty.com keeps its settings low-key.
export const SECTIONS = {
    leads: { icon: IconTargetArrow, ink: "red" },
    deals: { icon: IconBriefcase, ink: "green" },
    contacts: { icon: IconUser, ink: "blue" },
    activities: { icon: IconCalendarEvent, ink: "violet" },
    tasks: { icon: IconCheckbox, ink: "teal" },
    notes: { icon: IconNotes, ink: "teal" },
    profile: { icon: IconUserCircle, ink: "grey" },
    members: { icon: IconUsers, ink: "grey" },
    roles: { icon: IconShieldLock, ink: "grey" },
    stages: { icon: IconLayoutKanban, ink: "grey" },
    customFields: { icon: IconAdjustmentsHorizontal, ink: "grey" },
} satisfies Record<string, { icon: Icon; ink: keyof typeof INKS }>;

export type Section = keyof typeof SECTIONS;

// A section's icon in its own colour. "sm" (sidebar) and "md" (page headers) are the bare
// icon, as on twenty.com; "lg" sits on a quiet grey tile at the top of a settings page.
export function SectionIcon({ section, size = "sm" }: { section: Section; size?: "sm" | "md" | "lg" }) {
    const { icon: Icon, ink } = SECTIONS[section];

    if (size === "lg") {
        return (
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-paper">
                <Icon size={20} stroke={1.8} color={INKS[ink]} />
            </span>
        );
    }

    return <Icon aria-hidden size={16} stroke={2} color={INKS[ink]} className="shrink-0" />;
}
