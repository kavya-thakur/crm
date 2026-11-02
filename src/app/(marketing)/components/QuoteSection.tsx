"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// Our own line, not a customer quote: Flash has no customers to quote yet
const QUOTE = "A CRM should be the fastest part of your sales day, not the thing everyone works around.";

// Attio's reveal: this section is pulled up a full screen underneath the section
// before it, so that section slides away to uncover it. It then stays put while
// the quote darkens word by word as you keep scrolling.
export function QuoteSection() {
    const tallRef = useRef<HTMLDivElement>(null);

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
                scrollTrigger: { trigger: tallRef.current, start: "top -70%", end: "bottom bottom", scrub: true },
            }
        );
    }, { scope: tallRef });

    return (
        <section className="relative z-0 -mt-[100svh] bg-white">
            <div ref={tallRef} className="h-[250svh]">
                <div
                    className="sticky top-16 flex h-[calc(100svh-64px)] flex-col items-center justify-center bg-[radial-gradient(rgb(28_28_28/0.12)_1px,transparent_1px)] bg-size-[12px_12px] px-6"
                >
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
