"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
    IconAlertTriangle,
    IconBell,
    IconBrandGoogle,
    IconBuildingStore,
    IconCalendarTime,
    IconCircleCheckFilled,
    IconFileSpreadsheet,
    IconForms,
    IconMail,
    IconPhone,
    IconProgress,
    IconUserCircle,
    IconWebhook,
} from "@tabler/icons-react";

// The pictures on the product page that aren't screenshots, drawn like the app's own UI (Inter,
// its greys and tags) with the app's real wording. The demo workspace has no forms or emails set
// up, so these show what those screens do.

const APP = "font-(family-name:--font-inter) text-[#1c1c1c]";
const CARD = "rounded-2xl border border-[#1c1c1c]/8 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_50px_-20px_rgb(28_28_28/0.3)]";

// steps through 0..count-1 every `ms`, standing still for people who prefer less motion
function useStep(count: number, ms: number) {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const timer = setInterval(() => setStep((current) => (current + 1) % count), ms);
        return () => clearInterval(timer);
    }, [count, ms]);
    return step;
}

function Tag({ children, tone = "bg-[#1c1c1c]/6 text-[#1c1c1c]/70" }: { children: ReactNode; tone?: string }) {
    return <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-medium ${tone}`}>{children}</span>;
}

// --- Capture: five places leads come from, all flowing into one lead card ---

const SOURCES = [
    { icon: IconForms, label: "Website contact form", name: "Riya Sharma", campaign: "diwali-sale", owner: "Priya Sharma" },
    { icon: IconBrandGoogle, label: "Google Ads", name: "Arjun Mehta", campaign: "search-brand", owner: "Rohan Iyer" },
    { icon: IconBuildingStore, label: "IndiaMART", name: "Kabir Singh", campaign: null, owner: "Sneha Kapoor" },
    { icon: IconFileSpreadsheet, label: "leads.csv", name: "Isha Rao", campaign: null, owner: "Aarav Mehta" },
    { icon: IconWebhook, label: "Zapier", name: "Meera Nair", campaign: "fb-lead-ads", owner: "Vikram Singh" },
];

export function CapturePicture() {
    const step = useStep(SOURCES.length, 2600);
    const lead = SOURCES[step];

    return (
        <div className={`${APP} relative aspect-[5/4] w-full`}>
            {/* a line from every source to the card, the live one lit and flowing */}
            <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {SOURCES.map((source, index) => {
                    const y = 14 + index * 18;
                    return (
                        <path
                            key={source.label}
                            d={`M 36 ${y} C 46 ${y}, 46 50, 56 50`}
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                            strokeWidth={index === step ? 2 : 1}
                            strokeDasharray="4 5"
                            className={`transition-[stroke] duration-500 ${index === step ? "animate-[dash-flow_0.9s_linear_infinite] stroke-[#4a38f5]" : "stroke-[#1c1c1c]/15"}`}
                        />
                    );
                })}
            </svg>

            <ul className="absolute top-0 left-0 flex h-full w-[36%] flex-col justify-between py-[5%]">
                {SOURCES.map((source, index) => (
                    <li
                        key={source.label}
                        className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-[13px] font-medium transition-all duration-500 ${index === step ? "scale-105 border-[#4a38f5]/40 shadow-[0_10px_24px_-12px_rgb(74_56_245/0.6)]" : "border-[#1c1c1c]/8 text-[#1c1c1c]/55"}`}
                    >
                        <source.icon size={16} className={index === step ? "text-[#4a38f5]" : ""} />
                        <span className="truncate">{source.label}</span>
                    </li>
                ))}
            </ul>

            <div className={`${CARD} absolute top-1/2 right-0 w-[44%] -translate-y-1/2 p-4`}>
                {/* keyed, so each new lead fades in */}
                <div key={step} className="animate-[fade-in_0.5s_ease-out]">
                    <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-full bg-[#edf2fe] text-[12px] font-semibold text-[#3e63dd]">{lead.name[0]}</span>
                        <p className="text-[14px] font-semibold">{lead.name}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        <Tag tone="bg-[#ffefd6] text-[#d14e00]">New</Tag>
                        <Tag>{lead.label}</Tag>
                        {lead.campaign && <Tag tone="bg-[#f1efff] text-[#4a38f5]">{lead.campaign}</Tag>}
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#1c1c1c]/55">
                        <IconUserCircle size={14} /> {lead.owner}, in turn
                    </p>
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#f4f4f4] px-2.5 py-2 text-[12px]">
                        <span className="size-3 shrink-0 rounded-full border border-[#1c1c1c]/30" />
                        <span className="min-w-0 flex-1 truncate">Reply to {lead.name}</span>
                        <Tag tone="bg-[#feebec] text-[#ce2c31]">High</Tag>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Email: a template filling itself in, then Sending → Sent → Opened ---

const STATUSES = [
    { label: "Draft", tone: "bg-[#1c1c1c]/6 text-[#1c1c1c]/60" },
    { label: "Sending", tone: "bg-[#fff4d5] text-[#ab6400]" },
    { label: "Sent", tone: "bg-[#edf2fe] text-[#3e63dd]" },
    { label: "Opened", tone: "bg-[#e6f6eb] text-[#218358]" },
];

export function EmailPicture() {
    const step = useStep(STATUSES.length + 1, 1500);
    const status = STATUSES[Math.min(step, STATUSES.length - 1)];
    // the placeholders show as written for a moment, then as filled in
    const filled = step > 0;
    const field = (raw: string, value: string) => <mark className="rounded bg-[#f1efff] px-0.5 text-[#4a38f5]">{filled ? value : raw}</mark>;

    return (
        <div className={`${APP} relative aspect-[5/4] w-full`}>
            <div className={`${CARD} absolute inset-x-[6%] top-[8%] p-5`}>
                <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[14px] font-semibold">
                        <IconMail size={16} /> Email Rahul Verma
                    </p>
                    <span key={status.label} className={`animate-[fade-in_0.4s_ease-out] rounded-full px-2 py-0.5 text-[12px] font-medium ${status.tone}`}>
                        {status.label}
                    </span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-b border-[#1c1c1c]/8 pb-3 text-[13px]">
                    <span className="text-[#1c1c1c]/45">Template</span>
                    <Tag tone="bg-[#f1efff] text-[#4a38f5]">Follow-up</Tag>
                </div>
                <p className="mt-3 text-[13px] font-medium">Following up on our call, {field("{{lead.company}}", "Acme Logistics")}</p>
                <div className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed text-[#1c1c1c]/70">
                    <p>Hi {field("{{lead.firstName}}", "Rahul")},</p>
                    <p>Thanks for your time today. I&apos;ve put together the next steps we talked about, and I&apos;m happy to answer any questions.</p>
                    <p>{field("{{me.name}}", "Priya Sharma")}</p>
                </div>
            </div>

            {/* the bell, once it's opened */}
            <div
                className={`${CARD} absolute right-0 bottom-[6%] flex items-center gap-3 p-3 pr-5 transition-all duration-500 ${step >= STATUSES.length - 1 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
            >
                <span className="flex size-9 items-center justify-center rounded-xl bg-[#e6f6eb] text-[#218358]">
                    <IconBell size={18} />
                </span>
                <div>
                    <p className="text-[13px] font-semibold">Rahul Verma opened your email</p>
                    <p className="text-[12px] text-[#1c1c1c]/50">Just now</p>
                </div>
            </div>
        </div>
    );
}

// --- the small cards that float in front of the screenshots ---

export function DuplicateCard() {
    return (
        <div className={`${APP} flex max-w-80 items-start gap-2 rounded-xl border border-[#f5d090] bg-[#fff8eb] p-3 text-[13px] text-[#8a5a00] shadow-[0_24px_50px_-20px_rgb(28_28_28/0.35)]`}>
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
                <span className="font-medium">Kabir from Horizon Realty</span> is already an open lead with the same phone number
            </p>
        </div>
    );
}

export function LostReasonCard() {
    return (
        <div className={`${APP} ${CARD} w-56 p-3`}>
            <p className="text-[12px] text-[#1c1c1c]/50">Why was it lost?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {["Price too high", "Chose a competitor", "Bad timing"].map((reason, index) => (
                    <Tag key={reason} tone={index === 1 ? "bg-[#1c1c1c] text-white" : undefined}>
                        {reason}
                    </Tag>
                ))}
            </div>
        </div>
    );
}

// the popup that appears on any page when a call or meeting starts
export function ActivityCard() {
    return (
        <div className={`${APP} ${CARD} flex w-64 flex-col items-center p-5 text-center`}>
            <span className="flex size-11 animate-pulse items-center justify-center rounded-2xl bg-[#ffefd6] text-[#d14e00]">
                <IconPhone size={22} />
            </span>
            <p className="mt-3 text-[12px] font-medium text-[#d14e00]">Call starting now</p>
            <p className="mt-0.5 text-[15px] font-semibold">Discovery call with Fintrail Capital</p>
            <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#1c1c1c]/55">
                <IconCalendarTime size={14} /> 9:30 AM · 30 min
            </p>
            <div className="mt-4 grid w-full grid-cols-2 gap-2 text-[12px] font-medium">
                <span className="rounded-lg border border-[#1c1c1c]/10 py-1.5">Reschedule</span>
                <span className="rounded-lg bg-[#4a38f5] py-1.5 text-white">Mark done</span>
            </div>
        </div>
    );
}

export function MentionCard() {
    return (
        <div className={`${APP} ${CARD} flex items-center gap-3 p-3 pr-5`}>
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#f1efff] text-[#4a38f5]">
                <IconBell size={18} />
            </span>
            <div>
                <p className="text-[13px] font-semibold">Priya mentioned you on Riya Sharma</p>
                <p className="text-[12px] text-[#1c1c1c]/50">2 min ago</p>
            </div>
        </div>
    );
}

export function LiveCard() {
    return (
        <div className={`${APP} ${CARD} flex items-center gap-3 p-3 pr-5`}>
            <span className="relative flex size-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#30a46c]" />
                <span className="relative size-2.5 rounded-full bg-[#30a46c]" />
            </span>
            <p className="text-[13px] font-medium">
                <span className="font-semibold">Rohan</span> moved Umbra Studios: Renewal to <Tag tone="bg-[#e6f6eb] text-[#218358]">Won</Tag>
            </p>
        </div>
    );
}

// the progress card a big bulk action shows on every page
export function JobCard() {
    return (
        <div className={`${APP} ${CARD} w-72 p-4`}>
            <p className="flex items-center gap-2 text-[13px] font-medium">
                <IconProgress size={16} className="text-[#4a38f5]" /> Moving leads… 2,000 of 4,230
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#1c1c1c]/8">
                <div className="h-full w-full origin-left animate-[job-fill_4s_ease-in-out_infinite] rounded-full bg-[#4a38f5]" />
            </div>
        </div>
    );
}

export function ImportCard() {
    return (
        <div className={`${APP} ${CARD} flex items-center gap-3 p-3 pr-5`}>
            <IconCircleCheckFilled size={22} className="text-[#30a46c]" />
            <p className="text-[13px] font-semibold">Import finished: 4,812 leads added</p>
        </div>
    );
}
