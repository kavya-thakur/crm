"use client";

import { useRef, useState, type ComponentType } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { IconAdjustmentsHorizontal, IconCheck, IconCopy, IconFileImport, IconFilter, IconForms, IconSearch, IconShieldLock, IconStack2, IconTimeline } from "@tabler/icons-react";

import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "../components/Eyebrow";
import { Button } from "../components/Button";
import { DashArt, noise, type Sampler } from "../components/DashArt";
import { Halftone3D, type ShapeName } from "../components/Halftone3D";
import { Journey } from "./Journey";
import { WaveField } from "../components/WaveField";
import { buildLoops, DealsPicture, DuplicatePicture, FollowUpsPicture, LeadsPicture } from "./TourPictures";

gsap.registerPlugin(ScrollTrigger);

// --- the hero: a real dashboard screenshot, cut into its cards ---

// The screenshot (public/product/dashboard.jpg) is the demo workspace at 1440×900, taken at 2×.
// Each tile is one card of it, by its box on that screen; `z` is how far it floats above the
// screen before the page assembles it.
const SHOT = { src: "/product/dashboard.jpg", width: 1440, height: 900 };
const TILES = [
    { x: 0, y: 0, w: 218, h: 900, z: 40 },
    { x: 221, y: 9, w: 1210, h: 48, z: 70 },
    { x: 245, y: 80, w: 1162, h: 76, z: 100 },
    { x: 251, y: 159, w: 279, h: 162, z: 170 },
    { x: 542, y: 159, w: 279, h: 162, z: 210 },
    { x: 832, y: 159, w: 279, h: 162, z: 250 },
    { x: 1123, y: 159, w: 279, h: 162, z: 290 },
    { x: 251, y: 333, w: 763, h: 425, z: 130 },
    { x: 1026, y: 333, w: 375, h: 425, z: 230 },
    { x: 251, y: 769, w: 1150, h: 122, z: 90 },
];
const pct = (value: number, of: number) => `${(value / of) * 100}%`;

// Once the dashboard has come together, these labels pop up on it, each pinned to what it explains
// (positions on the same 1440×900 screen)
const NOTES = [
    { x: 1112, y: 120, text: "One teammate's numbers, or everyone's" },
    { x: 400, y: 236, text: "Every open deal, added up" },
    { x: 690, y: 236, text: "Each deal × its chance to close" },
    { x: 975, y: 250, text: "Won ÷ closed, against last period" },
    { x: 640, y: 560, text: "Revenue won, day by day" },
    { x: 1210, y: 585, text: "Due in 30 days, late ones flagged" },
];

function Tile({ x, y, w, h }: (typeof TILES)[number]) {
    return (
        <div
            data-tile
            className="absolute overflow-hidden rounded-xl shadow-[0_30px_60px_-20px_rgb(28_28_28/0.4)]"
            style={{
                left: pct(x, SHOT.width),
                top: pct(y, SHOT.height),
                width: pct(w, SHOT.width),
                height: pct(h, SHOT.height),
            }}
        >
            {/* the whole screenshot, shifted so only this card shows */}
            {/* eslint-disable-next-line @next/next/no-img-element -- one shared file cut into tiles; next/image can't crop */}
            <img
                src={SHOT.src}
                alt=""
                className="absolute max-w-none"
                style={{
                    width: pct(SHOT.width, w),
                    left: `-${pct(x, w)}`,
                    top: `-${pct(y, h)}`,
                }}
            />
        </div>
    );
}

// --- the tour: four chapters, one picture each ---

const CHAPTERS = [
    {
        id: "leads",
        title: "Every lead, in the view that suits you",
        body: "Work through leads as a list when you're calling down a queue, or as a Kanban board when you want to see where each one stands. Same leads, same filters, one click apart.",
        points: ["Filter on any field, your own included, and save the view", "Change the stage or owner of hundreds of leads at once", "Import a CSV, and export one any time"],
        picture: <LeadsPicture />,
        shape: "funnel" as ShapeName,
        color: "#8f84ff",
    },
    {
        id: "duplicates",
        title: "One customer, one open lead",
        body: "Flash matches every new lead on phone number and email. If that person is already being worked on, you're told who owns them, before anyone calls twice.",
        points: [
            "Checked whether a lead is typed in, imported or sent by a web form",
            "A repeat web form enquiry fills in the existing lead",
            "Old duplicates can be merged into one",
        ],
        picture: <DuplicatePicture />,
        shape: "magnet" as ShapeName,
        color: "#ed87fc",
    },
    {
        id: "deals",
        title: "A pipeline that tells you why",
        body: "Turn a qualified lead into a deal in one click, then drag it across your own stages. Column totals move with it, and every lost deal records a reason, so you learn what's costing you.",
        points: ["Amount, probability and close date on every deal", "Win rate and a weighted forecast on the dashboard", "Every move written to the deal's timeline"],
        picture: <DealsPicture />,
        shape: "trophy" as ShapeName,
        color: "#89fc9a",
    },
    {
        id: "follow-ups",
        title: "Nobody forgets a follow-up",
        body: "Book calls and meetings with teammates and get a reminder 10 minutes before. Pull someone in with an @mention, and their bell lights up the moment you post.",
        points: ["Tasks with due dates and priorities, as a list or a board", "Notifications for assignments, meetings and mentions", "Notes on every lead, deal and contact"],
        picture: <FollowUpsPicture />,
        shape: "hourglass" as ShapeName,
        color: "#feffb7",
    },
];

// faint grey streaks across the dark stage, as on the landing page's feature cards
const streaks: Sampler = (x, y) => (noise(Math.floor(x / 24), y) > 0.82 ? 0.95 : 0);

// --- everything else ---

type Icon = ComponentType<{ size?: number; className?: string }>;

const MORE: { icon: Icon; title: string; body: string }[] = [
    { icon: IconFileImport, title: "CSV import and export", body: "Bring a spreadsheet in with column matching. Take leads, contacts and deals out whenever you like." },
    { icon: IconForms, title: "Web forms", body: "Paste a snippet on your site. Enquiries become leads, shared out in turn, each with a task to reply today." },
    { icon: IconAdjustmentsHorizontal, title: "Custom fields", body: "Add text, number, date and dropdown fields to leads, deals and contacts." },
    { icon: IconShieldLock, title: "Roles and permissions", body: "Build roles from view, create, edit, delete and assign. Limit agents to their own records." },
    { icon: IconSearch, title: "⌘K search", body: "Find any lead, deal, contact, task or meeting from anywhere in Flash." },
    { icon: IconCopy, title: "Merge duplicates", body: "Spot old duplicates and merge two leads, or two deals, into one." },
    { icon: IconStack2, title: "Bulk edit", body: "Select thousands of records and change them together. Big deletes run in the background." },
    { icon: IconFilter, title: "Saved filters", body: "Filter on any field, then save the view to come back to." },
    { icon: IconTimeline, title: "Timeline", body: "Every change, note, call and hand-off on one history per record." },
];

export function ProductPage({ loggedIn }: { loggedIn: boolean }) {
    const rootRef = useRef<HTMLDivElement>(null);
    // which chapter's 3D object turns behind the stage (only one is drawn at a time)
    const [chapter, setChapter] = useState(0);

    useGSAP(
        () => {
            // with reduced motion: no hero or grid animation, and the tour swaps pictures instantly
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            // Hero, desktop: the dashboard starts on the right as floating layers on a tilted, turned
            // screen. Scrolling (while the hero holds still) lowers every card onto the screen while
            // it turns to face you, glides to the middle and grows; the headline slides away to the
            // left. At the end the full screenshot fades over the cards to hide the cuts.
            gsap.matchMedia().add("(min-width: 921px) and (prefers-reduced-motion: no-preference)", () => {
                gsap.from("[data-tile]", {
                    opacity: 0,
                    y: -160,
                    duration: 1,
                    ease: "power3.out",
                    stagger: 0.06,
                    delay: 0.2,
                });

                // where the finished dashboard ends up: as big as fits under the nav, in the middle
                const hero = rootRef.current!.querySelector<HTMLElement>("[data-product-hero]")!;
                const turn = hero.querySelector<HTMLElement>("[data-turn]")!;
                // its place within the hero, added up parent by parent (a transformed wrapper counts as one)
                const placeInHero = (side: "offsetTop" | "offsetLeft") => {
                    let total = 0;
                    for (let node: HTMLElement | null = turn; node && node !== hero; node = node.offsetParent as HTMLElement | null) total += node[side];
                    return total;
                };
                const room = () => window.innerHeight - 64;
                // at most 1080px wide, the size the labels on it are laid out for
                const endScale = () => Math.min((room() - 64) / turn.offsetHeight, Math.min(1080, hero.clientWidth - 160) / turn.offsetWidth);
                const endX = () => (hero.clientWidth - turn.offsetWidth) / 2 - placeInHero("offsetLeft");
                const endY = () => (room() - turn.offsetHeight) / 2 - placeInHero("offsetTop");

                gsap.timeline({
                    defaults: { ease: "none" },
                    // measured first, so the space the pin adds is counted by every trigger below it
                    scrollTrigger: {
                        trigger: "[data-product-hero]",
                        start: "top 64px",
                        end: "+=170%",
                        pin: true,
                        scrub: 0.6,
                        invalidateOnRefresh: true,
                        refreshPriority: 1,
                    },
                })
                    .fromTo("[data-tilt]", { rotationX: 48, rotationY: -14 }, { rotationX: 0, rotationY: 0, duration: 1 }, 0)
                    .fromTo("[data-turn]", { rotation: -22, scale: 0.9, x: 0, y: 0 }, { rotation: 0, scale: endScale, x: endX, y: endY, duration: 1 }, 0)
                    .fromTo("[data-tile]", { z: (index) => TILES[index].z }, { z: 0, duration: 0.85, ease: "power2.inOut" }, 0)
                    .fromTo("[data-shot-base]", { opacity: 0.25 }, { opacity: 1, duration: 0.8 }, 0)
                    .to("[data-product-copy]", { x: -160, opacity: 0, duration: 0.45 }, 0)
                    .fromTo("[data-shot-full]", { opacity: 0 }, { opacity: 1, duration: 0.12 }, 0.88)
                    // then the labels pop up one by one (shrunk back by the dashboard's growth, so they
                    // stay their normal size), and hold for a moment before the page moves on
                    .fromTo(
                        "[data-note]",
                        { opacity: 0, scale: () => 0.6 / endScale() },
                        { opacity: 1, scale: () => 1 / endScale(), duration: 0.12, stagger: 0.07, ease: "back.out(2)" },
                        1.02,
                    )
                    .to({}, { duration: 0.35 });
            });

            // Tour: whichever chapter is in the middle of the screen gets the stage. The old
            // picture tips back and away, the new one swings up into place, and only its loop runs.
            const stage = rootRef.current!.querySelector<HTMLElement>("[data-stage]")!;
            const pictures = gsap.utils.toArray<HTMLElement>("[data-picture]");
            const loops = buildLoops(stage);
            const chapters = gsap.utils.toArray<HTMLElement>("[data-chapter]");
            let active = -1;

            gsap.set(pictures, { opacity: 0, transformPerspective: 1200 });
            gsap.set(chapters, { opacity: 0.3 });

            const show = (index: number) => {
                if (index === active) return;
                const previous = active;
                active = index;
                if (reduced) {
                    gsap.set(pictures, { opacity: 0 });
                    gsap.set(pictures[index], { opacity: 1 });
                    gsap.set(chapters, { opacity: 0.3 });
                    gsap.set(chapters[index], { opacity: 1 });
                    return;
                }
                if (previous >= 0) {
                    loops[previous].pause();
                    gsap.to(pictures[previous], {
                        opacity: 0,
                        rotationX: -35,
                        y: -80,
                        scale: 0.85,
                        duration: 0.5,
                        ease: "power2.in",
                        overwrite: true,
                    });
                    gsap.to(chapters[previous], { opacity: 0.3, duration: 0.4 });
                }
                gsap.fromTo(
                    pictures[index],
                    { opacity: 0, rotationX: 40, y: 120, scale: 0.85 },
                    {
                        opacity: 1,
                        rotationX: 0,
                        y: 0,
                        scale: 1,
                        duration: 0.9,
                        ease: "expo.out",
                        delay: previous >= 0 ? 0.25 : 0,
                        overwrite: true,
                    },
                );
                gsap.to(chapters[index], { opacity: 1, duration: 0.4 });
                setChapter(index);
                gsap.to("[data-progress]", {
                    scaleY: (index + 1) / chapters.length,
                    duration: 0.6,
                    ease: "power3.out",
                });
                loops[index].restart();
            };

            chapters.forEach((chapter, index) => {
                ScrollTrigger.create({
                    trigger: chapter,
                    start: "top 60%",
                    end: "bottom 60%",
                    onToggle: (self) => self.isActive && show(index),
                });
            });
            // nothing plays while the stage is off screen
            ScrollTrigger.create({
                trigger: stage,
                start: "top bottom",
                end: "bottom top",
                onToggle: (self) => !reduced && active >= 0 && (self.isActive ? loops[active].play() : loops[active].pause()),
            });

            // Everything else: the cards flip up off the page in a wave
            if (!reduced)
                gsap.from("[data-more]", {
                    opacity: 0,
                    rotationX: -70,
                    y: 60,
                    transformPerspective: 900,
                    transformOrigin: "50% 0%",
                    duration: 0.9,
                    ease: "power3.out",
                    stagger: { each: 0.07, grid: "auto", from: "start" },
                    scrollTrigger: {
                        trigger: "[data-more-grid]",
                        start: "top 80%",
                        once: true,
                    },
                });

            ScrollTrigger.refresh();
            return () => loops.forEach((loop) => loop.kill());
        },
        { scope: rootRef },
    );

    return (
        <div ref={rootRef} className="font-(family-name:--font-host-grotesk)">
            {/* hero: the headline on the left and the dashboard floating over the wave field */}
            <section data-product-hero className="relative overflow-clip bg-white pt-14 pb-20 min-[921px]:h-[calc(100svh-64px)] min-[921px]:py-0">
                <WaveField className="absolute inset-x-0 bottom-0 h-[80%]" />
                {/* a soft violet light behind the dashboard */}
                <div aria-hidden className="pointer-events-none absolute top-[18%] right-[6%] size-140 rounded-full bg-[#4a38f5]/8 blur-[140px]" />

                <div className={`${CONTAINER} relative grid h-full items-center gap-14 min-[921px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] min-[921px]:gap-8`}>
                    <div data-product-copy className="relative z-10">
                        <Eyebrow>The product.</Eyebrow>
                        <Heading as="h1" className="mt-6 max-w-150">
                            Everything your team sells with, <Accent>in one fast workspace</Accent>
                        </Heading>
                        <Lead className="mt-6 max-w-110">
                            Leads, deals, follow-ups and the numbers behind them. Here&apos;s a closer look at each part, and how they work together.
                        </Lead>
                        <div className="mt-9 flex flex-wrap gap-3">
                            {loggedIn ? (
                                <Button href="/dashboard">Go to your workspace</Button>
                            ) : (
                                <>
                                    <Button href="/register">Get started</Button>
                                    <Button href="/api/auth/demo?as=manager" variant="outlined">
                                        Explore the live demo
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* the dashboard: tilt (lean back) → turn (spin and size) → the cards, each at its own height */}
                    <div className="[perspective:2200px]">
                        <div data-tilt className="transform-3d">
                            <div data-turn className="relative aspect-1440/900 w-full transform-3d">
                                {/* eslint-disable-next-line @next/next/no-img-element -- the same file the tiles use, so it's fetched once */}
                                <img data-shot-base src={SHOT.src} alt="" className="absolute inset-0 h-full w-full rounded-2xl" />
                                {TILES.map((tile, index) => (
                                    <Tile key={index} {...tile} />
                                ))}
                                {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                                <img
                                    data-shot-full
                                    src={SHOT.src}
                                    alt="Flash's dashboard: open pipeline, weighted forecast, win rate, revenue won and deals closing soon"
                                    className="absolute inset-0 h-full w-full rounded-2xl opacity-0 shadow-[0_40px_100px_-30px_rgb(28_28_28/0.45)] ring-1 ring-[#1c1c1c]/8 max-[920px]:opacity-100"
                                />
                                {NOTES.map((note) => (
                                    <span
                                        key={note.text}
                                        data-note
                                        className="absolute hidden opacity-0 min-[921px]:block"
                                        style={{
                                            left: pct(note.x, SHOT.width),
                                            top: pct(note.y, SHOT.height),
                                        }}
                                    >
                                        <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-[#4a38f5] ring-4 ring-[#4a38f5]/25" />
                                        <span className="absolute bottom-3 left-0 -translate-x-1/2 rounded-full bg-[#1c1c1c] px-3 py-1.5 text-[12px] font-medium whitespace-nowrap text-white shadow-[0_10px_30px_rgb(0_0_0/0.3)]">
                                            {note.text}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* tour */}
            <section className="bg-white pt-28 pb-16">
                <div className={CONTAINER}>
                    <div className="flex flex-col items-center text-center">
                        <Eyebrow>A closer look.</Eyebrow>
                        <Heading className="mt-6 max-w-200">
                            Four things your team does all day, <Accent>made quick</Accent>
                        </Heading>
                    </div>

                    <div className="mt-16 flex flex-col gap-10 min-[921px]:grid min-[921px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[921px]:gap-16">
                        {/* the stage: sticky on every screen size, so the text scrolls past it */}
                        <div className="sticky top-16 z-10 bg-white pb-4 min-[921px]:order-2 min-[921px]:top-24 min-[921px]:h-[calc(100svh-8rem)] min-[921px]:pb-0">
                            <div data-stage aria-hidden className="relative h-[46svh] overflow-hidden rounded-3xl bg-[#1c1c1c] min-[921px]:h-full">
                                <DashArt width={600} height={700} sample={streaks} rowGap={12} barHeight={3} cell={6} className="absolute inset-0 h-full w-full text-white/8" />
                                {/* the chapter's 3D object, turning behind its window; remounted per chapter so it fades in */}
                                <div key={chapter} className="pointer-events-none absolute -right-[14%] -bottom-[12%] size-[80%] animate-[fade-in_0.9s_ease-out]">
                                    <Halftone3D shape={CHAPTERS[chapter].shape} color={CHAPTERS[chapter].color} className="h-full w-full" />
                                </div>
                                {CHAPTERS.map((chapter) => (
                                    <div key={chapter.id} data-picture className="absolute inset-0 flex items-center justify-center p-4 max-[920px]:scale-[0.82] min-[921px]:p-10">
                                        <div className="w-full max-w-130">{chapter.picture}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="relative min-[921px]:order-1">
                            {/* progress rail */}
                            <span aria-hidden className="absolute top-0 bottom-0 left-0 hidden w-px bg-[#1c1c1c]/10 min-[921px]:block">
                                <span data-progress className="absolute inset-0 origin-top bg-[#4a38f5]" style={{ transform: "scaleY(0)" }} />
                            </span>

                            {CHAPTERS.map((chapter, index) => (
                                <article
                                    key={chapter.id}
                                    id={chapter.id}
                                    data-chapter
                                    className="flex scroll-mt-24 flex-col justify-center py-10 min-[921px]:min-h-[85svh] min-[921px]:pl-12 max-[920px]:min-h-[60svh]"
                                >
                                    <p className="font-(family-name:--font-azeret-mono) text-[12px] font-medium text-[#4a38f5]">
                                        {String(index + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")}
                                    </p>
                                    <Heading as="h3" size="md" className="mt-4">
                                        {chapter.title}
                                    </Heading>
                                    <Lead className="mt-5 max-w-115">{chapter.body}</Lead>
                                    <ul className="mt-7 flex flex-col gap-3 text-[15px] text-[#1c1c1c]/80">
                                        {chapter.points.map((point) => (
                                            <li key={point} className="flex items-start gap-3">
                                                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#4a38f5]/10 text-[#4a38f5]">
                                                    <IconCheck size={12} stroke={3} />
                                                </span>
                                                {point}
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <Journey />

            {/* everything else */}
            <section id="more" className="bg-[#f4f4f4] py-28">
                <div className={CONTAINER}>
                    <Eyebrow>And the rest.</Eyebrow>
                    <Heading className="mt-6 max-w-200">
                        Everything else <Accent>that comes in the box</Accent>
                    </Heading>

                    <div data-more-grid className="mt-16 grid gap-4 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-3">
                        {MORE.map((item) => (
                            <article
                                key={item.title}
                                data-more
                                className="group rounded-2xl border border-[#1c1c1c]/8 bg-white p-6 transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgb(28_28_28/0.3)]"
                            >
                                <span className="flex size-10 items-center justify-center rounded-xl bg-[#4a38f5]/8 text-[#4a38f5] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:-rotate-8">
                                    <item.icon size={20} />
                                </span>
                                <h3 className="mt-5 text-[18px] font-medium tracking-[-0.02em] text-[#1c1c1c]">{item.title}</h3>
                                <p className="mt-2 text-[15px] leading-[1.55] text-[#1c1c1c]/60">{item.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* the way in */}
            <section data-scheme="dark" className="bg-[#1c1c1c] py-28">
                <div className={`${CONTAINER} flex flex-col items-center text-center`}>
                    <Heading dark className="max-w-200">
                        See it with <Accent>real data</Accent>
                    </Heading>
                    <Lead dark className="mt-5 max-w-120">
                        The demo workspace has hundreds of leads and deals and a team already at work. Open it in one click, no sign-up.
                    </Lead>
                    <div className="mt-10 flex flex-wrap justify-center gap-3">
                        {loggedIn ? (
                            <Button href="/dashboard" scheme="dark">
                                Go to your workspace
                            </Button>
                        ) : (
                            <>
                                <Button href="/api/auth/demo?as=manager" scheme="dark">
                                    Explore the live demo
                                </Button>
                                <Button href="/register" variant="outlined" scheme="dark">
                                    Create your workspace
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
