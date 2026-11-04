"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { IconCheck } from "@tabler/icons-react";

import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "../components/Eyebrow";
import { Button } from "../components/Button";
import { revealText } from "../components/revealText";
import { ProductHero } from "./ProductHero";
import { GlassLogo } from "./GlassLogo";
import { ActivityCard, CapturePicture, DuplicateCard, EmailPicture, ImportCard, JobCard, LiveCard, LostReasonCard, MentionCard } from "./FeaturePictures";

gsap.registerPlugin(ScrollTrigger);

// The screenshots are the demo workspace at 1440 × 900, taken at 2× (public/product)
type Shot = { src: string; width: number; height: number; alt: string };

// Everything Flash does, in six groups. Each has a picture: a real screenshot with a couple of
// the app's own cards floating in front of it, or a drawn one where the demo has nothing to show.
const GROUPS: {
    id: string;
    eyebrow: string;
    heading: ReactNode;
    lead: string;
    features: [string, string][];
    tone: string;
    shot?: Shot;
    picture?: ReactNode;
    floats?: { node: ReactNode; place: string }[];
}[] = [
    {
        id: "capture",
        eyebrow: "Capture",
        heading: (
            <>
                Every lead, <Accent>from everywhere</Accent>
            </>
        ),
        lead: "Web forms, spreadsheets, ad platforms and your own code all land in one place, tagged with where they came from and given to the right person.",
        features: [
            ["Web forms", "Choose the fields, the wording and the thank-you message. Embed it, or share its own page."],
            ["CSV import", "Columns matched for you, custom fields included. Thousands of rows, in the background."],
            ["Lead integrations", "A private link for Google Ads, IndiaMART, Zapier, Make or your own code."],
            ["Campaign tracking", "The utm_campaign on a link is saved on the lead, and the dashboard shows what each campaign brought in."],
            ["Shared out in turn", "New leads go round the team, each with a task to reply today."],
        ],
        tone: "bg-[linear-gradient(135deg,#f1efff,#f4f4f4_70%)]",
        picture: <CapturePicture />,
    },
    {
        id: "pipeline",
        eyebrow: "Pipeline",
        heading: (
            <>
                A pipeline <Accent>you can trust</Accent>
            </>
        ),
        lead: "Leads and deals as a list or a Kanban board, with no duplicates and a reason for every loss.",
        features: [
            ["List or Kanban", "Drag cards between stages, or edit right in the table."],
            ["Filters that stick", "By stage, source, owner, dates or any custom field. Save the ones you use."],
            ["One lead per person", "Matched on phone or email, flagged while you type, merged in a click."],
            ["Lost reasons", "Asked every time something is lost, so you can see why."],
            ["Your own fields and stages", "Custom fields and pipeline stages for leads, deals and contacts."],
            ["Lead to deal", "Convert a lead when it's ready, and its history comes along."],
        ],
        tone: "bg-[linear-gradient(135deg,#fdeaff,#f4f4f4_70%)]",
        shot: { src: "/product/pipeline.jpg", width: 1206, height: 640, alt: "Leads on a Kanban board in Flash, in columns for each stage: New, Screening, Meeting and Proposal" },
        floats: [
            { node: <DuplicateCard />, place: "-bottom-8 -left-3 min-[921px]:-left-8" },
            { node: <LostReasonCard />, place: "-top-8 -right-3 min-[921px]:-right-8" },
        ],
    },
    {
        id: "follow-ups",
        eyebrow: "Follow-ups",
        heading: (
            <>
                Nobody <Accent>forgets a follow-up</Accent>
            </>
        ),
        lead: "Tasks, calls and meetings on every record, with reminders that find you on whatever page you're on.",
        features: [
            ["Tasks", "Due dates, priorities and a board from To do to Done."],
            ["Calls and meetings", "Booked for a time, with attendees, and moved in one click."],
            ["Reminders", "10 minutes before, then a popup on any page when it starts."],
            ["Notes and @mentions", "Mention a teammate and they're told straight away."],
            ["Timeline", "Every stage change, assignment and update, logged on the record."],
        ],
        tone: "bg-[linear-gradient(135deg,#fffbe0,#f4f4f4_70%)]",
        shot: { src: "/product/tasks.jpg", width: 930, height: 640, alt: "Tasks in Flash on a board with To do, In progress and Done columns, each with a due date and priority" },
        floats: [
            { node: <ActivityCard />, place: "top-[12%] -right-3 min-[921px]:-right-10" },
            { node: <MentionCard />, place: "-bottom-7 -left-3 min-[921px]:-left-8" },
        ],
    },
    {
        id: "email",
        eyebrow: "Email",
        heading: (
            <>
                Email, <Accent>without leaving Flash</Accent>
            </>
        ),
        lead: "Write to a lead or deal from its own page, start from a template, and know the moment it's read.",
        features: [
            ["Send from the record", "Replies come straight back to your own inbox."],
            ["Templates", "Placeholders like {{lead.firstName}} fill themselves in as you pick one."],
            ["Open tracking", "Sending, Sent, then Opened, and you're told when it happens."],
            ["On the timeline", "Every email is kept with the rest of the record's history."],
        ],
        tone: "bg-[linear-gradient(135deg,#e9fbec,#f4f4f4_70%)]",
        picture: <EmailPicture />,
    },
    {
        id: "team",
        eyebrow: "Team",
        heading: (
            <>
                See how <Accent>the team is doing</Accent>
            </>
        ),
        lead: "A live dashboard for revenue, pipeline and win rate, a ranking of who's doing well, and the right access for everyone.",
        features: [
            ["Dashboard", "Revenue won, weighted pipeline, win rate and what's closing soon, for any period or person."],
            ["Team performance", "Revenue, deals won, win rate and activity for every teammate, ranked."],
            ["Sources and campaigns", "Which ones bring leads that turn into revenue."],
            ["Roles and permissions", "View, create, edit, delete and assign, for their own records or everyone's."],
            ["Live updates", "Changes show up on everyone's screen as they happen, with a bell for what needs you."],
        ],
        tone: "bg-[linear-gradient(135deg,#f1efff,#f4f4f4_70%)]",
        shot: { src: "/product/dashboard.jpg", width: 1440, height: 900, alt: "Flash's dashboard: open pipeline, weighted forecast, win rate, revenue won and deals closing soon" },
        floats: [
            { node: <LiveCard />, place: "-top-6 left-4 min-[921px]:left-10" },
            {
                node: <Image src="/product/team.jpg" width={1146} height={431} alt="The team performance table, ranking each teammate by revenue won" className="rounded-xl border border-[#1c1c1c]/8 shadow-[0_30px_60px_-20px_rgb(28_28_28/0.4)]" />,
                place: "-right-3 -bottom-10 w-[78%] min-[921px]:-right-10",
            },
        ],
    },
    {
        id: "more",
        eyebrow: "At scale",
        heading: (
            <>
                Built for <Accent>thousands of records</Accent>
            </>
        ),
        lead: "Find anything in a keystroke and change thousands of records at once, without waiting for it.",
        features: [
            ["⌘K search", "Leads, deals, contacts, tasks and meetings, with a preview as you move through them."],
            ["Bulk actions", "Select everything that matches your filters, then move, assign or delete it in the background."],
            ["CSV export", "The rows on screen, filters and all, ready to open in a spreadsheet."],
            ["Still quick at 10,000 leads", "Lists and boards load in tens of milliseconds."],
        ],
        tone: "bg-[linear-gradient(135deg,#eaf3ff,#f4f4f4_70%)]",
        shot: { src: "/product/search.jpg", width: 860, height: 573, alt: "Flash's search: typing \"acme\" finds matching leads and deals, with a preview of the highlighted lead" },
        floats: [
            { node: <JobCard />, place: "-bottom-8 -left-3 min-[921px]:-left-10" },
            { node: <ImportCard />, place: "-top-6 -right-3 min-[921px]:-right-8" },
        ],
    },
];

export function ProductPage({ loggedIn }: { loggedIn: boolean }) {
    const groupsRef = useRef<HTMLDivElement>(null);
    // the closing logo never flies anywhere
    const resting = useRef(0);

    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            revealText();

            gsap.utils.toArray<HTMLElement>("[data-visual]").forEach((visual, index) => {
                // the picture lies tipped back in depth and stands up flat as it scrolls into view
                gsap.fromTo(
                    visual.querySelector("[data-tilt]"),
                    { rotationX: 16, rotationY: index % 2 ? 12 : -12, scale: 0.9 },
                    { rotationX: 0, rotationY: 0, scale: 1, ease: "none", scrollTrigger: { trigger: visual, start: "top bottom", end: "center 55%", scrub: 0.6 } },
                );
                // then its cards (if it has any) pop up in front of it
                const floats = visual.querySelectorAll("[data-float]");
                if (floats.length === 0) return;
                gsap.from(floats, {
                    opacity: 0,
                    y: 30,
                    scale: 0.9,
                    duration: 1.2,
                    ease: "expo.out",
                    stagger: 0.15,
                    scrollTrigger: { trigger: visual, start: "top 55%", toggleActions: "play none none reverse" },
                });
            });
            gsap.utils.toArray<HTMLElement>("[data-features]").forEach((list) =>
                gsap.from(list.children, {
                    opacity: 0,
                    y: 20,
                    duration: 1,
                    ease: "expo.out",
                    stagger: 0.08,
                    scrollTrigger: { trigger: list, start: "top 85%", toggleActions: "play none none reverse" },
                }),
            );
        },
        { scope: groupsRef },
    );

    return (
        <div className="overflow-x-clip">
            <ProductHero loggedIn={loggedIn} />

            <div ref={groupsRef}>
                {GROUPS.map((group, index) => (
                    <section key={group.id} id={group.id} className="scroll-mt-16 py-20 min-[921px]:py-32">
                        <div className={`${CONTAINER} grid items-center gap-16 min-[921px]:grid-cols-2 min-[921px]:gap-20`}>
                            <div className={index % 2 ? "min-[921px]:order-2" : ""}>
                                <Eyebrow>{group.eyebrow}</Eyebrow>
                                <Heading className="mt-6">{group.heading}</Heading>
                                <Lead className="mt-5 max-w-130 text-[17px]">{group.lead}</Lead>
                                <ul data-features className="mt-10 grid gap-x-8 gap-y-6 font-(family-name:--font-host-grotesk) sm:grid-cols-2">
                                    {group.features.map(([name, body]) => (
                                        <li key={name} className="flex gap-3">
                                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#4a38f5]/10 text-[#4a38f5]">
                                                <IconCheck size={12} stroke={3} />
                                            </span>
                                            <div>
                                                <p className="text-[16px] font-medium tracking-[-0.02em]">{name}</p>
                                                <p className="mt-1 text-[15px] leading-[1.5] text-[#1c1c1c]/55">{body}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <Visual tone={group.tone} shot={group.shot} floats={group.floats}>
                                {group.picture}
                            </Visual>
                        </div>
                    </section>
                ))}
            </div>

            <section data-scheme="dark" className="relative overflow-clip bg-[#1c1c1c] pt-10 pb-28">
                <div className="absolute top-20 left-1/2 size-100 -translate-x-1/2 rounded-full bg-[#4a38f5]/30 blur-[120px]" />
                <div className={`${CONTAINER} relative flex flex-col items-center text-center`}>
                    <GlassLogo progress={resting} className="relative size-70" />
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
                                <Button href="/api/auth/demo" scheme="dark">
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

// A group's picture on its tinted panel. The panel tips in 3D as you scroll (data-tilt) and leans
// towards the pointer (data-lean); the floating cards sit nearer the viewer, so they move more.
function Visual({ tone, shot, floats = [], children }: { tone: string; shot?: Shot; floats?: { node: ReactNode; place: string }[]; children?: ReactNode }) {
    const leanRef = useRef<HTMLDivElement>(null);

    function onMove(event: PointerEvent) {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        gsap.to(leanRef.current, { rotationY: x * 10, rotationX: -y * 8, duration: 0.8, ease: "power3.out" });
    }

    function onLeave() {
        gsap.to(leanRef.current, { rotationY: 0, rotationX: 0, duration: 1.2, ease: "power3.out" });
    }

    return (
        <div data-visual onPointerMove={onMove} onPointerLeave={onLeave} className={`relative rounded-[32px] p-6 perspective-[1600px] min-[921px]:p-12 ${tone}`}>
            <div data-tilt className="transform-3d">
                <div ref={leanRef} className="relative transform-3d">
                    {shot ? (
                        <Image src={shot.src} width={shot.width} height={shot.height} alt={shot.alt} className="w-full rounded-xl border border-[#1c1c1c]/8 shadow-[0_30px_60px_-24px_rgb(28_28_28/0.35)]" />
                    ) : (
                        children
                    )}
                    {floats.map((float, index) => (
                        // nearer the viewer than the screenshot; the inner box is what animates in
                        <div key={index} className={`absolute ${float.place}`} style={{ transform: "translateZ(70px)" }}>
                            <div data-float>{float.node}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
