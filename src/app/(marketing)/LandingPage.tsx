"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { LogoBar } from "./components/LogoBar";
import { ProblemSection } from "./components/ProblemSection";
import { PillarsSection } from "./components/PillarsSection";
import { StepsSection } from "./components/StepsSection";
import { FeaturesSection } from "./components/FeaturesSection";
import { UseCasesSection } from "./components/UseCasesSection";
import { FaqSection } from "./components/FaqSection";
import { Footer } from "./components/Footer";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function LandingPage({ loggedIn }: { loggedIn: boolean }) {
    const rootRef = useRef<HTMLDivElement>(null);

    const primaryHref = loggedIn ? "/leads" : "/register";
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

            // Every other section gets a quiet fade + rise the first time it enters view.
            gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((section) => {
                gsap.from(section, {
                    opacity: 0,
                    y: 20,
                    duration: 0.55,
                    ease: "power2.out",
                    scrollTrigger: { trigger: section, start: "top 85%" },
                });
            });
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
            <UseCasesSection />
            <FaqSection primaryHref={primaryHref} primaryLabel={primaryLabel} />
            <Footer primaryHref={primaryHref} primaryLabel={primaryLabel} />
        </div>
    );
}
