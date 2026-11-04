"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "../components/Eyebrow";
import { Button } from "../components/Button";
import { GlassLogo } from "./GlassLogo";

gsap.registerPlugin(ScrollTrigger);

// The hero: the glass Flash logo, with everything Flash does orbiting it on two tilted rings,
// like a planet's. Names on the near side of a ring pass in front of the glass, the far side
// behind it. Scrolling flies the camera forward through the rings and into the page.
//
// The rings are worked out by hand rather than in WebGL, so the names stay crisp HTML: each
// frame every name's spot on its circle is turned by the ring's tilt, then shrunk or grown by
// how far it is from the camera.
const RINGS = [
    {
        radius: 1,
        tilt: 0.22,
        roll: 0.1,
        speed: 0.05,
        features: ["Web forms", "CSV import", "Lead integrations", "UTM campaigns", "Round-robin", "Kanban boards", "Saved filters", "Duplicate checks", "Merge", "Lost reasons", "Custom fields", "Dashboard", "Team performance", "⌘K search"],
    },
    {
        radius: 0.68,
        tilt: 0.4,
        roll: -0.32,
        speed: -0.08,
        features: ["Tasks", "Calls & meetings", "Reminders", "@mentions", "Timeline", "Email templates", "Open tracking", "Live updates", "Notifications", "Roles & permissions", "Bulk actions", "CSV export"],
    },
];
const LABELS = RINGS.flatMap((ring, index) => ring.features.map((text, place) => ({ text, ring: index, angle: (place / ring.features.length) * Math.PI * 2 })));

const FOCAL = 1700; // how far the camera is from the rings' centre, in pixels
const DOLLY = 2100; // how far it flies forward by the end of the scroll

export function ProductHero({ loggedIn }: { loggedIn: boolean }) {
    const heroRef = useRef<HTMLElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    // 0 to 1 through the hero's scroll, read by the orbit and the glass every frame
    const progress = useRef(0);

    useEffect(() => {
        const stage = stageRef.current!;
        const labels = [...stage.querySelectorAll<HTMLElement>("[data-orbit]")];
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let time = 0;
        let frame = 0;

        function place() {
            frame = requestAnimationFrame(place);
            if (!still) time += 0.016;
            const width = stage.clientWidth;
            const height = stage.clientHeight;
            // phones get just the outer ring (the inner one is hidden), spread wider
            const size = width < 640 ? width * 0.62 : Math.min(width * 0.4, 540);
            const dolly = progress.current * DOLLY;

            labels.forEach((label, index) => {
                const { ring: which, angle } = LABELS[index];
                const ring = RINGS[which];
                // round the circle, then tipped back by the tilt and turned by the roll
                const turn = angle + time * ring.speed;
                const x = Math.cos(turn) * ring.radius * size;
                const z = Math.sin(turn) * ring.radius * size;
                const y = z * Math.sin(ring.tilt);
                const near = z * Math.cos(ring.tilt);
                const screenX = x * Math.cos(ring.roll) - y * Math.sin(ring.roll);
                const screenY = x * Math.sin(ring.roll) + y * Math.cos(ring.roll);

                // past the camera: gone
                const depth = FOCAL - near - dolly;
                if (depth < 120) {
                    label.style.opacity = "0";
                    return;
                }
                const scale = FOCAL / depth;
                const front = near / (ring.radius * size) / 2 + 0.5; // 0 at the back, 1 at the front
                label.style.transform = `translate3d(${width / 2 + screenX * scale}px, ${height * 0.44 + screenY * scale}px, 0) translate(-50%, -50%) scale(${scale})`;
                // faint at the back, and fading as it rushes past
                label.style.opacity = String((0.3 + 0.7 * front) * (1 - gsap.utils.clamp(0, 1, (scale - 1.8) / 1.4)));
                label.style.zIndex = near > 0 ? "20" : "0";
            });
        }

        // only moving while it's on screen
        const watcher = new IntersectionObserver(([entry]) => {
            cancelAnimationFrame(frame);
            if (entry.isIntersecting) place();
        });
        watcher.observe(stage);
        return () => {
            cancelAnimationFrame(frame);
            watcher.disconnect();
        };
    }, []);

    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

            // on load: the words rise in, then the glass and its rings open out
            gsap.timeline({ defaults: { ease: "expo.out" } })
                .from("[data-rise]", { opacity: 0, y: 24, duration: 1.2, stagger: 0.1 })
                .from("[data-stage]", { opacity: 0, scale: 0.85, duration: 1.6 }, 0.3);

            // the hero holds still while you scroll: the words lift away, the camera flies in, and the
            // glass is left faint and close as the page carries it off
            gsap.timeline({
                scrollTrigger: {
                    trigger: heroRef.current,
                    start: "top top",
                    end: "+=80%",
                    pin: true,
                    scrub: 0.8,
                    refreshPriority: 1,
                    onUpdate: (self) => (progress.current = self.progress),
                },
            })
                .to("[data-hero-copy]", { y: -120, opacity: 0, duration: 0.4, ease: "power2.in" }, 0)
                .to("[data-glass], [data-glow]", { opacity: 0.25, duration: 0.4 }, 0.6)
                .set({}, {}, 1);
        },
        { scope: heroRef },
    );

    return (
        <section ref={heroRef} className="relative flex h-svh min-h-190 flex-col overflow-clip bg-white">
            <div data-hero-copy className={`${CONTAINER} relative z-30 flex flex-col items-center pt-26 text-center min-[921px]:pt-30`}>
                <div data-rise>
                    <Eyebrow>Product</Eyebrow>
                </div>
                <div data-rise>
                    <Heading as="h1" className="mt-5 max-w-300">
                        Everything you need to sell, <Accent>in one place</Accent>
                    </Heading>
                </div>
                <div data-rise>
                    <Lead className="mt-5 max-w-130 text-[17px]">Bring leads in from anywhere, work every deal, never miss a follow-up and see how the team is doing. Here&apos;s all of it.</Lead>
                </div>
                <div data-rise className="mt-8 flex flex-wrap justify-center gap-3">
                    {loggedIn ? (
                        <Button href="/dashboard">Go to your workspace</Button>
                    ) : (
                        <>
                            <Button href="/register">Get started</Button>
                            <Button href="/api/auth/demo" variant="outlined">
                                Explore the live demo
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div ref={stageRef} data-stage aria-hidden className="relative min-h-90 flex-1">
                {/* a soft violet and pink glow for the glass to sit in */}
                <div data-glow className="absolute top-[44%] left-1/2 size-130 -translate-1/2 rounded-full bg-[#8f84ff]/25 blur-[110px]" />
                <div data-glow className="absolute top-[40%] left-[42%] size-70 -translate-1/2 rounded-full bg-[#ed87fc]/20 blur-[90px]" />

                <div data-glass className="absolute inset-x-0 top-[44%] z-10 h-[min(640px,90%)] -translate-y-1/2">
                    <GlassLogo progress={progress} className="absolute inset-0" />
                </div>

                {LABELS.map((label) => (
                    <span
                        key={label.text}
                        data-orbit
                        className={`absolute top-0 left-0 flex ${label.ring === 1 ? "max-[639px]:hidden" : ""} items-center gap-1.5 rounded-full border border-[#1c1c1c]/8 bg-white/90 px-3 py-1.5 font-(family-name:--font-host-grotesk) text-[13px] font-medium whitespace-nowrap text-[#1c1c1c] shadow-[0_8px_20px_-12px_rgb(28_28_28/0.35)] will-change-transform min-[921px]:text-[14px]`}
                    >
                        <span className={`size-1.5 rounded-full ${label.ring === 0 ? "bg-[#4a38f5]" : "bg-[#ed87fc]"}`} />
                        {label.text}
                    </span>
                ))}
            </div>
        </section>
    );
}
