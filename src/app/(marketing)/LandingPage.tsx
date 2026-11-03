"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { LogoBar } from "./components/LogoBar";
import { ProblemSection } from "./components/ProblemSection";
import { PillarsSection } from "./components/PillarsSection";
import { StepsSection } from "./components/StepsSection";
import { FeaturesSection } from "./components/FeaturesSection";
import { QuoteSection } from "./components/QuoteSection";
import { UseCasesSection } from "./components/UseCasesSection";
import { PromiseSection } from "./components/PromiseSection";
import { CaptureSection } from "./components/CaptureSection";
import { PricingSection } from "./components/PricingSection";
import { SecuritySection } from "./components/SecuritySection";
import { FaqSection } from "./components/FaqSection";
import { Footer } from "./components/Footer";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export default function LandingPage({ loggedIn }: { loggedIn: boolean }) {
    const rootRef = useRef<HTMLDivElement>(null);

    const primaryHref = loggedIn ? "/dashboard" : "/register";
    const primaryLabel = loggedIn ? "Go to your workspace" : "Get started";

    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

            // The one orchestrated page-load moment: headline, subhead, actions and
            // the product mockup settle in as a single sequence.
            const heroLines = gsap.utils.toArray<HTMLElement>("[data-hero-line]");
            const heroMockup = document.querySelector("[data-hero-mockup]");

            gsap.timeline({ defaults: { ease: "power3.out" } })
                .from(heroLines, { opacity: 0, y: 16, duration: 0.6, stagger: 0.08 })
                .from(heroMockup, { opacity: 0, y: 28, duration: 0.7 }, "-=0.25");

            // Desktop: the hero holds still while the product window tips up from a
            // tilt to flat and rises, the headline lifts away, and two update cards
            // slide in beside the window.
            gsap.matchMedia().add("(min-width: 921px)", () => {
                gsap.timeline({
                    defaults: { ease: "none" },
                    // measured first, so the space the pin adds is counted by every trigger below it
                    scrollTrigger: { trigger: "[data-hero]", start: "top 64px", end: "+=90%", pin: true, scrub: 0.6, refreshPriority: 1 },
                })
                    .fromTo("[data-hero-tilt]", { rotationX: 26, scale: 0.9, transformPerspective: 1600, transformOrigin: "50% 0%" }, { rotationX: 0, scale: 1, y: -300, duration: 1 }, 0)
                    .to("[data-hero-copy]", { y: -140, opacity: 0, duration: 0.6 }, 0)
                    .fromTo("[data-hero-card]", { opacity: 0, x: (index) => (index === 0 ? -80 : 80) }, { opacity: 1, x: 0, stagger: 0.15, duration: 0.4 }, 0.45);
            });

            // Every other section gets a quiet fade + rise the first time it enters view.
            gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((section) => {
                gsap.from(section, {
                    opacity: 0,
                    y: 24,
                    duration: 1.2,
                    ease: "power3.out",
                    scrollTrigger: { trigger: section, start: "top 85%" },
                });
            });

            // Below the hero, each heading's words rise out of their lines when it comes into view.
            // They play on their own clock (not tied to the scroll), so every word gets the whole
            // soft motion however fast you scroll; scrolling back above a heading resets it, so it
            // plays again next time. The lines are split again whenever they change (a resize, the
            // fonts arriving), so the words always fit their lines.
            const onEnter = (trigger: Element) => ({ trigger, start: "top 85%", toggleActions: "play none none reverse" });
            gsap.utils.toArray<HTMLElement>("[data-heading]").forEach((heading) => {
                SplitText.create(heading, {
                    type: "lines,words",
                    mask: "lines",
                    autoSplit: true,
                    onSplit: (split) => {
                        // a little room below each line, so the hidden edge doesn't clip a "g" or a "y"
                        gsap.set(split.masks, { paddingBottom: "0.12em", marginBottom: "-0.12em" });
                        // each word tips up from a slight lean as it rises and fades in, one after another
                        return gsap.from(split.words, {
                            yPercent: 120,
                            rotate: 5,
                            opacity: 0,
                            transformOrigin: "0% 100%",
                            duration: 1.4,
                            ease: "expo.out",
                            stagger: 0.07,
                            scrollTrigger: onEnter(heading),
                        });
                    },
                });
            });
            // the eyebrow's blue bar draws in, and the text under a heading fades up just after its words
            gsap.utils.toArray<HTMLElement>("[data-eyebrow-bar]").forEach((bar) =>
                gsap.from(bar, { scaleX: 0, transformOrigin: "0% 50%", duration: 1, ease: "expo.out", scrollTrigger: onEnter(bar) }),
            );
            gsap.utils.toArray<HTMLElement>("[data-lead]").forEach((lead) =>
                gsap.from(lead, { opacity: 0, y: 28, duration: 1.4, delay: 0.25, ease: "expo.out", scrollTrigger: onEnter(lead) }),
            );

            // the sections' own triggers were set up before the hero's pin existed
            ScrollTrigger.refresh();
        },
        { scope: rootRef }
    );

    return (
        <div ref={rootRef} className="bg-white text-[#1c1c1c]">
            <Nav loggedIn={loggedIn} primaryHref={primaryHref} primaryLabel={primaryLabel} />
            <Hero loggedIn={loggedIn} primaryHref={primaryHref} primaryLabel={primaryLabel} />
            <LogoBar />
            <ProblemSection />
            <PillarsSection />
            <StepsSection />
            <FeaturesSection />
            <QuoteSection />
            <UseCasesSection />
            <CaptureSection />
            <PromiseSection primaryHref={primaryHref} primaryLabel={primaryLabel} />
            <PricingSection />
            <SecuritySection />
            <FaqSection primaryHref={primaryHref} primaryLabel={primaryLabel} />
            <Footer />
        </div>
    );
}
