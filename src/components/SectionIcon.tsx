import type { ComponentType, CSSProperties } from "react";
import {
    IconAdjustmentsHorizontal,
    IconBolt,
    IconBuilding,
    IconBuildingSkyscraper,
    IconBriefcase,
    IconCalendarEvent,
    IconChartFunnel,
    IconCheckbox,
    IconCreditCard,
    IconForms,
    IconLayoutDashboard,
    IconLayoutKanban,
    IconMail,
    IconNotes,
    IconPackage,
    IconPlugConnected,
    IconShieldLock,
    IconShieldStar,
    IconSun,
    IconTargetArrow,
    IconTrash,
    IconUser,
    IconUserCircle,
    IconUsers,
} from "@tabler/icons-react";

// A light tint of each colour with the bright, clear ink of the same hue on top
// (the Radix scale: step 3 behind, step 9–10 for the ink) and a hairline ring of that ink
export const TONES = {
    red: "bg-[#feebec] text-[#dc3e42] ring-[#dc3e42]/20",
    green: "bg-[#e6f6eb] text-[#2b9a66] ring-[#2b9a66]/20",
    blue: "bg-[#e6f4fe] text-[#0588f0] ring-[#0588f0]/20",
    violet: "bg-[#f4f0fe] text-[#6e56cf] ring-[#6e56cf]/20",
    amber: "bg-[#fff7c2] text-[#d68b00] ring-[#d68b00]/25",
    teal: "bg-[#e0f8f3] text-[#0d9b8a] ring-[#0d9b8a]/20",
    indigo: "bg-[#edf2fe] text-[#3e63dd] ring-[#3e63dd]/20",
    rose: "bg-[#feeaf5] text-[#cf3897] ring-[#cf3897]/20",
    sky: "bg-[#e1f6fd] text-[#0894b3] ring-[#0894b3]/20",
    orange: "bg-[#ffefd6] text-[#ef5f00] ring-[#ef5f00]/20",
    lime: "bg-[#eef6d6] text-[#5c7c2f] ring-[#5c7c2f]/20",
    slate: "bg-[#f0f0f3] text-[#60646c] ring-[#60646c]/20",
} as const;

export type Tone = keyof typeof TONES;
type Icon = ComponentType<{ size?: number; className?: string; stroke?: number; style?: CSSProperties }>;

// The exact icon colours Twenty's sidebar uses: step 10 of its colour scale, written in
// display-p3 (twenty-ui ThemeLight.ts), which Mac screens show richer than plain hex.
const INKS = {
    red: "0.798 0.294 0.285",
    green: "0.308 0.595 0.417",
    blue: "0.234 0.343 0.801",
    violet: "0.483 0.289 0.7",
    teal: "0.275 0.599 0.542",
    orange: "0.87 0.409 0.164",
    grey: "0.4 0.4 0.4",
} as const;

function ink(section: Section) {
    return `color(display-p3 ${INKS[SECTIONS[section].ink]})`;
}


// Every part of the app, with its icon and colour. The icons are the same Tabler icons
// twenty.com's sidebar uses wherever there's a match (target, user, checkbox, notes). The sidebar, the page headers and
// the settings pages all read from here, so a section looks the same everywhere.
// Settings items are grey, the way twenty.com keeps its settings low-key.
export const SECTIONS = {
    myDay: { icon: IconSun, ink: "orange" },
    dashboard: { icon: IconLayoutDashboard, ink: "orange" },
    leads: { icon: IconTargetArrow, ink: "red" },
    deals: { icon: IconBriefcase, ink: "green" },
    contacts: { icon: IconUser, ink: "blue" },
    companies: { icon: IconBuilding, ink: "violet" },
    activities: { icon: IconCalendarEvent, ink: "violet" },
    tasks: { icon: IconCheckbox, ink: "teal" },
    notes: { icon: IconNotes, ink: "teal" },
    profile: { icon: IconUserCircle, ink: "grey" },
    workspace: { icon: IconBuildingSkyscraper, ink: "grey" },
    products: { icon: IconPackage, ink: "grey" },
    billing: { icon: IconCreditCard, ink: "grey" },
    members: { icon: IconUsers, ink: "grey" },
    roles: { icon: IconShieldLock, ink: "grey" },
    pipelines: { icon: IconChartFunnel, ink: "grey" },
    stages: { icon: IconLayoutKanban, ink: "grey" },
    customFields: { icon: IconAdjustmentsHorizontal, ink: "grey" },
    leadForms: { icon: IconForms, ink: "grey" },
    emailTemplates: { icon: IconMail, ink: "grey" },
    integrations: { icon: IconPlugConnected, ink: "grey" },
    automations: { icon: IconBolt, ink: "grey" },
    recycleBin: { icon: IconTrash, ink: "grey" },
    siteAdmin: { icon: IconShieldStar, ink: "red" },
    // the bell's icon for emails opened or not sent
    emails: { icon: IconMail, ink: "blue" },
} satisfies Record<string, { icon: Icon; ink: keyof typeof INKS }>;

export type Section = keyof typeof SECTIONS;

// A section's icon in its own colour. "sm" (sidebar) and "md" (page headers) are the bare
// icon, as on twenty.com; "lg" sits on a quiet grey tile at the top of a settings page.
export function SectionIcon({ section, size = "sm" }: { section: Section; size?: "sm" | "md" | "lg" }) {
    const { icon: Icon } = SECTIONS[section];

    if (size === "lg") {
        return (
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-paper">
                <Icon size={20} stroke={1.8} style={{ color: ink(section) }} />
            </span>
        );
    }

    return <Icon aria-hidden size={16} stroke={2} style={{ color: ink(section) }} className="shrink-0" />;
}
