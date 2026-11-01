"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { IconChevronDown } from "@tabler/icons-react";
import { Eyebrow, Heading } from "./Eyebrow";

const FAQS = [
    {
        q: "Can my whole team work in one workspace?",
        a: "Yes. Invite your team, assign each person a role, and everyone works from the same leads, deals and contacts — no per-person silos.",
    },
    {
        q: "Can I customize the fields and pipeline stages?",
        a: "Add custom fields to leads, deals or contacts, and set up your own pipeline stages and lead sources to match how your team actually sells.",
    },
    {
        q: "How do permissions work?",
        a: "Every role is built from granular permissions — view, create, edit, delete and assign — scoped per area, so an agent can be limited to their own leads while a manager sees everything.",
    },
    {
        q: "Can the team leave notes and loop each other in?",
        a: "Every record has a notes thread with @mentions, plus a dedicated Notes feed showing everything tagged to you or written by you.",
    },
    {
        q: "Is there a history of what happened on a record?",
        a: "Yes — every stage change, assignment and update is logged automatically on that record's timeline.",
    },
    {
        q: "What does it cost?",
        a: "₹999 per user, per month, billed monthly. No setup fees, no minimum seats.",
    },
];

export function FaqSection() {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <section id="pricing" data-reveal className="border-t border-line bg-paper py-24">
            <div className="mx-auto max-w-2xl px-6">
                <Eyebrow>Common questions</Eyebrow>
                <Heading className="mt-3 text-[28px] leading-tight sm:text-[34px]">Answers, before you ask</Heading>

                <div className="mt-8 divide-y divide-line rounded-lg border border-line bg-white">
                    {FAQS.map((item, index) => (
                        <FaqRow
                            key={item.q}
                            question={item.q}
                            answer={item.a}
                            isOpen={open === index}
                            onToggle={() => setOpen(open === index ? null : index)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

function FaqRow({
    question,
    answer,
    isOpen,
    onToggle,
}: {
    question: string;
    answer: string;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        if (!panelRef.current) return;
        gsap.to(panelRef.current, { height: isOpen ? "auto" : 0, duration: 0.25, ease: "power2.out" });
    }, [isOpen]);

    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-[#1c1c1c]"
            >
                {question}
                <IconChevronDown size={16} className={`shrink-0 text-light transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <div ref={panelRef} className="h-0 overflow-hidden">
                <p className="px-5 pb-4 text-[14px] leading-relaxed text-muted">{answer}</p>
            </div>
        </div>
    );
}
