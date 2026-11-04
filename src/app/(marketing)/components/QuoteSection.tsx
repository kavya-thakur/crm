"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { TeamSwarm } from "./TeamSwarm";

// Our own line, not a customer quote: Flash has no customers to quote yet
const QUOTE = "A CRM should be the fastest part of your sales day, not the thing everyone works around.";

// Attio's reveal: this section is pulled up a full screen underneath the section
// before it, so that section slides away to uncover it. It then stays put while
// the quote darkens word by word as you keep scrolling, while behind it a team gathers:
// three people at first, then more and more until they make a whole sphere round the words.
// The quote and the team are both complete by END, while a good stretch of scroll is still left,
// so the finished picture holds still on screen for a while before the section moves on
const END = "bottom 140%";

export function QuoteSection() {
    const tallRef = useRef<HTMLDivElement>(null);
    // the whole team when nothing moves (reduced motion), else set by the scroll below
    const people = useRef(1600);

    useGSAP(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        gsap.fromTo(
            "[data-quote-word]",
            { color: "#c4c4c4" },
            {
                color: "#1c1c1c",
                stagger: 0.1,
                ease: "none",
                // start once the section above has mostly slid away
                scrollTrigger: { trigger: tallRef.current, start: "top -70%", end: END, scrub: true },
            }
        );

        // the same stretch of scroll grows the team from 3 to 1600, evenly in proportion (×2 every so often)
        people.current = 3;
        ScrollTrigger.create({
            trigger: tallRef.current,
            start: "top -70%",
            end: END,
            onUpdate: (self) => (people.current = 3 * Math.pow(1600 / 3, self.progress)),
        });
    }, { scope: tallRef });

    return (
        <section className="relative z-0 -mt-[100svh] bg-white">
            <div ref={tallRef} className="h-[290svh]">
                <div
                    className="sticky top-16 isolate flex h-[calc(100svh-64px)] flex-col items-center justify-center px-6"
                >
                    {/* behind the words (isolate keeps it above the section's white) */}
                    <TeamSwarm people={people} className="absolute inset-0 -z-10" />
                    <p className="max-w-[18em] text-center font-(family-name:--font-aleo) text-[32px] leading-[1.25] font-light tracking-[-0.02em] text-balance text-[#1c1c1c] min-[921px]:text-[48px]">
                        {QUOTE.split(" ").map((word, index) => (
                            <span key={index} data-quote-word>
                                {word}{" "}
                            </span>
                        ))}
                    </p>
                    <p className="mt-10 font-(family-name:--font-host-grotesk) text-[14px] font-medium text-[#1c1c1c]">The Flash team</p>
                    <p className="mt-0.5 font-(family-name:--font-host-grotesk) text-[14px] text-[#1c1c1c]/50">Why we built it</p>
                </div>
            </div>
        </section>
    );
}
