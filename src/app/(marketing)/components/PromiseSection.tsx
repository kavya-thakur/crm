"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { IconCheck } from "@tabler/icons-react";

import { Avatar } from "@/components/Avatar";
import { Button } from "./Button";
import { Accent, Heading } from "./Eyebrow";

// Only things Flash actually does (they match the FAQ)
const PROMISES = [
    "Set up in minutes, no consultants or setup fees",
    "One price for your whole team, however many people",
    "Roles that decide exactly who sees what",
    "Every change logged on the record's timeline",
];

// Where getorchestra.com shows customer quotes, we show the kind of wins a team sees
// in Flash every day. Flash has no customers to quote yet.
const WINS = [
    { who: "Olivia", what: "moved Acme Industries to Won", detail: "₹4,80,000", color: "#059669", when: "2m ago" },
    { who: "Ethan", what: "logged a call with Globex Corp", detail: "12 min · follow up Tue", color: "#0284c7", when: "8m ago" },
    { who: "Aanya", what: "was assigned 4 new website leads", detail: "Lead source: Website", color: "#7c3aed", when: "15m ago" },
    { who: "Vihaan", what: "sent the proposal to Hooli Cloud", detail: "₹1,25,000 · Proposal", color: "#ca8a04", when: "32m ago" },
    { who: "Olivia", what: "mentioned you on Initech Systems", detail: "“@you can you join Thursday's demo?”", color: "#4a38f5", when: "1h ago" },
    { who: "Ethan", what: "closed Contoso Ltd", detail: "₹3,10,000 · Won", color: "#059669", when: "2h ago" },
    { who: "Aanya", what: "booked a meeting with Vandelay Imports", detail: "Fri 3:00 PM · 3 attendees", color: "#0284c7", when: "3h ago" },
    { who: "Vihaan", what: "qualified Umbrella Co", detail: "₹2,10,000 · Qualified", color: "#7c3aed", when: "4h ago" },
];

const EDGE_FADE = "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)";

function WinCard({ win }: { win: (typeof WINS)[number] }) {
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#1c1c1c]/8 bg-white p-4 font-(family-name:--font-host-grotesk) shadow-[0_4px_20px_rgb(0_0_0/0.06)]">
            <div className="flex items-start gap-2.5">
                <Avatar name={win.who} size="md" />
                <p className="text-[14px] leading-snug text-[#1c1c1c]/70">
                    <span className="font-medium text-[#1c1c1c]">{win.who}</span> {win.what}
                </p>
            </div>
            <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate rounded-full px-2 py-0.5 font-medium" style={{ color: win.color, backgroundColor: `${win.color}14` }}>
                    {win.detail}
                </span>
                <span className="shrink-0 text-[#1c1c1c]/40">{win.when}</span>
            </div>
        </div>
    );
}

// getorchestra.com's "We succeed if you do": promises on the left, two columns of cards
// on the right that slide past each other, one up and one down, as you scroll by
export function PromiseSection({ primaryHref, primaryLabel }: { primaryHref: string; primaryLabel: string }) {
    const sectionRef = useRef<HTMLElement>(null);

    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

            const scrub = { trigger: sectionRef.current, start: "top bottom", end: "bottom top", scrub: true };
            gsap.fromTo("[data-column=up]", { y: 0 }, { y: -200, ease: "none", scrollTrigger: scrub });
            gsap.fromTo("[data-column=down]", { y: 0 }, { y: 200, ease: "none", scrollTrigger: scrub });
        },
        { scope: sectionRef }
    );

    return (
        <section ref={sectionRef} className="flex flex-col overflow-clip bg-[#f4f4f4] px-4 py-20 min-[921px]:h-[115vh] min-[921px]:max-h-275 min-[921px]:flex-row min-[921px]:px-10 min-[921px]:py-0">
            <div className="flex flex-1 items-center justify-center">
                <div className="flex max-w-120 flex-col">
                    <Heading size="md">
                        We win <Accent>when your team does.</Accent>
                    </Heading>

                    <ul className="mt-8 flex flex-col gap-4 font-(family-name:--font-host-grotesk) text-[16px] text-[#1c1c1c]/80">
                        {PROMISES.map((promise) => (
                            <li key={promise} className="flex items-center gap-3">
                                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#4a38f5]/10 text-[#4a38f5]">
                                    <IconCheck size={12} stroke={3} />
                                </span>
                                {promise}
                            </li>
                        ))}
                    </ul>

                    <div className="mt-10 flex flex-wrap gap-3">
                        <Button href={primaryHref}>{primaryLabel}</Button>
                        <Button href="#pricing" variant="outlined">
                            See pricing
                        </Button>
                    </div>
                </div>
            </div>

            {/* the two columns, faded out at the top and bottom edges. On a phone there's room for
                one: the first (whose cards are all positioned, so it has no width of its own) would
                otherwise be squeezed to a sliver beside the second */}
            <div className="relative mt-12 flex h-130 flex-1 gap-4 overflow-clip min-[921px]:mt-0 min-[921px]:h-auto min-[921px]:gap-6" style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}>
                <div className="relative hidden min-w-0 flex-1 min-[921px]:block">
                    <div data-column="up" className="absolute inset-x-0 top-0 flex flex-col gap-4 pt-32 min-[921px]:gap-6">
                        {WINS.map((win) => (
                            <WinCard key={win.what} win={win} />
                        ))}
                    </div>
                </div>
                <div data-column="down" className="flex min-w-0 flex-1 flex-col gap-4 min-[921px]:gap-6">
                    {[...WINS.slice(4), ...WINS.slice(0, 4)].map((win) => (
                        <WinCard key={win.what} win={win} />
                    ))}
                </div>
            </div>
        </section>
    );
}
