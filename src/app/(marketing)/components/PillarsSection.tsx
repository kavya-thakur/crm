import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "./Eyebrow";
import { DashArt, iconArt, type ShapeName } from "./DashArt";
import { ArrowTile, FolderCard } from "./FolderCard";

const ICON_SIZE = 190;

const PILLARS: { title: string; shape: ShapeName; body: string; tags: [string, string] }[] = [
    {
        title: "Capture every lead",
        shape: "target",
        body: "Leads from your website, referrals and events land with the right person straight away, instead of sitting in a shared inbox.",
        tags: ["Leads", "Lead sources"],
    },
    {
        title: "Close deals faster",
        shape: "bolt",
        body: "Move deals across a board that matches your pipeline. Every stage change, note and hand-off is logged, so anyone can pick it up.",
        tags: ["Deals", "Pipeline"],
    },
    {
        title: "Control who sees what",
        shape: "shield",
        body: "Roles decide exactly who can see, assign or delete what, right down to agents seeing only their own leads. No shared logins.",
        tags: ["Roles", "Permissions"],
    },
];

export function PillarsSection() {
    return (
        <section id="product" data-reveal className="bg-white pt-1.5 pb-16">
            <div className={CONTAINER}>
                <Eyebrow>Stop juggling tools.</Eyebrow>
                <Heading className="mt-6 max-w-230">
                    Capture, track and close every deal, <Accent>in one workspace</Accent>
                </Heading>
                <Lead className="mt-6 max-w-143">Leads, deals, contacts, tasks and notes together, set up around how your team already sells.</Lead>

                <div className="mt-20 grid gap-4 min-[921px]:grid-cols-3">
                    {PILLARS.map((pillar) => (
                        <FolderCard key={pillar.title}>
                            <h3 className="border-b border-dotted border-[#1c1c1c]/30 pt-1 pb-4 font-(family-name:--font-host-grotesk) text-[22px] leading-6 font-medium tracking-[-0.02em] text-[#1c1c1c]">
                                {pillar.title}
                            </h3>

                            <div className="flex h-68 items-center justify-center border-b border-dotted border-[#1c1c1c]/30">
                                <DashArt
                                    width={ICON_SIZE}
                                    height={ICON_SIZE}
                                    sample={iconArt(pillar.shape, ICON_SIZE)}
                                    rowGap={6}
                                    barHeight={3}
                                    cell={4}
                                    className="text-[#4a38f5]"
                                />
                            </div>

                            <p className="mt-6 flex-1 font-(family-name:--font-host-grotesk) text-[16px] leading-[1.55] text-[#1c1c1c]">{pillar.body}</p>

                            <div className="mt-6 flex items-end justify-between gap-3">
                                <span className="flex items-center gap-2 pb-0.5 font-(family-name:--font-host-grotesk) text-[12px] text-[#1c1c1c]">
                                    <span className="font-medium">{pillar.tags[0]}</span>
                                    <span aria-hidden className="h-4 w-px bg-[#1c1c1c]/20" />
                                    {pillar.tags[1]}
                                </span>
                                <ArrowTile href="#how-it-works" label={`See how ${pillar.title.toLowerCase()} works`} />
                            </div>
                        </FolderCard>
                    ))}
                </div>
            </div>
        </section>
    );
}
