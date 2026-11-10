"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { IconMinus, IconPlus } from "@tabler/icons-react";

import { Accent, CONTAINER, Eyebrow, Heading } from "./Eyebrow";
import { Button } from "./Button";
import { DashArt, blobs } from "./DashArt";
import { Orb } from "./Orb";
import { PRO_PLANS, TRIAL_DAYS } from "@/lib/billing/plans";

const FAQS = [
    {
        q: "Can my whole team work in one workspace?",
        a: "Yes. Invite your team, give each person a role, and everyone works from the same leads, deals and contacts. No per-person silos.",
    },
    {
        q: "Can I bring in my existing spreadsheet?",
        a: "Yes. Upload a CSV of your leads and Flash guesses which column is which, including your custom fields; fix any guess it gets wrong. The import runs in the background, skips anyone who's already an open lead, and lists any rows it couldn't add.",
    },
    {
        q: "What if the same customer gets in touch twice?",
        a: "Flash keeps one open lead per person, matched on phone number or email. Adding them again by hand or by import is stopped, and a second web form enquiry fills in their existing lead instead of making a new one.",
    },
    {
        q: "Will my team know when something needs them?",
        a: "Yes. People are notified when a lead, deal or task is assigned to them, when they're added to a meeting and when someone @mentions them. Calls and meetings also get a reminder 10 minutes before.",
    },
    {
        q: "Can I change the fields and pipeline stages?",
        a: "Add custom fields to leads, deals or contacts, and set up your own pipeline stages and lead sources to match how your team sells.",
    },
    {
        q: "How do permissions work?",
        a: "Every role is built from permissions to view, create, edit, delete and assign, so an agent can be limited to their own leads while a manager sees everything.",
    },
    {
        q: "Is there a history of what happened on a record?",
        a: "Yes. Every stage change, assignment, task and update is logged automatically on that record's timeline.",
    },
    {
        q: "What does it cost?",
        a: `Try everything free for ${TRIAL_DAYS} days, no card needed. Then Pro is ₹${PRO_PLANS.MONTHLY.price.toLocaleString("en-IN")} a month, or ₹${PRO_PLANS.YEARLY.price.toLocaleString("en-IN")} a year (two months free), for your whole team: add as many people as you like, the price stays the same. No setup fees.`,
    },
];

const ART_WIDTH = 760;
const ART_HEIGHT = 1100;

// Drifting blue patches behind the right half of the section
const CLOUDS = blobs([
    { x: 300, y: 80, rx: 260, ry: 90 },
    { x: 690, y: 210, rx: 120, ry: 200 },
    { x: 380, y: 620, rx: 330, ry: 120 },
    { x: 700, y: 820, rx: 110, ry: 170 },
]);

export function FaqSection({ primaryHref, primaryLabel }: { primaryHref: string; primaryLabel: string }) {
    const [open, setOpen] = useState<number | null>(null);
    // the orb beside the heading stirs whenever a question is opened
    const energy = useRef(0);

    return (
        <section id="faq" data-scheme="dark" data-reveal className="relative overflow-clip bg-[#1c1c1c] py-30">
            <DashArt
                width={ART_WIDTH}
                height={ART_HEIGHT}
                sample={CLOUDS}
                className="pointer-events-none absolute top-0 right-0 hidden text-[#4a38f5]/45 min-[921px]:block"
            />
            {/* lilac and white, so it stands out from the violet clouds behind it */}
            <Orb energy={energy} color="#8f84ff" glow="#ffffff" className="absolute top-10 right-[8%] hidden size-90 min-[921px]:block" />

            <div className={`${CONTAINER} relative`}>
                <Eyebrow dark>Any questions?</Eyebrow>
                <Heading dark className="mt-6 max-w-175">
                    Stop chasing spreadsheets. <Accent>Start selling, with Flash</Accent>
                </Heading>
                <div className="mt-8 flex flex-wrap gap-2">
                    <Button href={primaryHref} scheme="dark">
                        {primaryLabel}
                    </Button>
                    <Button href="/login" variant="outlined" scheme="dark">
                        Log in
                    </Button>
                </div>

                <ul className="mx-auto mt-20 max-w-224.5">
                    {FAQS.map((item, index) => (
                        <FaqRow
                            key={item.q}
                            question={item.q}
                            answer={item.a}
                            isOpen={open === index}
                            onToggle={() => {
                                setOpen(open === index ? null : index);
                                energy.current = 1;
                            }}
                        />
                    ))}
                </ul>
            </div>
        </section>
    );
}

function FaqRow({ question, answer, isOpen, onToggle }: { question: string; answer: string; isOpen: boolean; onToggle: () => void }) {
    const panelRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        gsap.to(panelRef.current, { height: isOpen ? "auto" : 0, duration: 0.3, ease: "power2.out" });
    }, [isOpen]);

    return (
        <li className="border-t border-white/20 last:border-b">
            <button type="button" onClick={onToggle} aria-expanded={isOpen} className="group flex w-full items-center gap-6 py-8 text-left min-[921px]:gap-16">
                <span aria-hidden className={`h-1.5 w-3.5 shrink-0 border ${isOpen ? "border-[#4a38f5] bg-[#4a38f5]" : "border-white/60"}`} />
                <span
                    className={`flex-1 font-(family-name:--font-host-grotesk) text-[22px] leading-[1.35] tracking-[-0.02em] transition-colors duration-200 min-[921px]:text-[32px] ${isOpen ? "text-white" : "text-white/40 group-hover:text-white/70"}`}
                >
                    {question}
                </span>
                <span className="flex size-9 shrink-0 items-center justify-center border border-white/40 text-white transition-colors duration-200 group-hover:border-white">
                    {isOpen ? <IconMinus size={16} /> : <IconPlus size={16} />}
                </span>
            </button>
            <div ref={panelRef} className="h-0 overflow-hidden">
                <p className="max-w-160 pb-8 pl-9.5 font-(family-name:--font-host-grotesk) text-[18px] leading-[1.55] text-white/60 min-[921px]:pl-19.5">{answer}</p>
            </div>
        </li>
    );
}
