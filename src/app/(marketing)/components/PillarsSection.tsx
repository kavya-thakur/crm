import { Accent, CONTAINER, Eyebrow, Heading, Lead } from "./Eyebrow";
import { Halftone3D, type ShapeName } from "./Halftone3D";
import { ArrowTile, FolderCard } from "./FolderCard";

const PILLARS: { title: string; shape: ShapeName; body: string; tags: [string, string] }[] = [
    {
        title: "Capture every lead",
        shape: "magnet",
        body: "Forms on your website create leads by themselves and share them out across your team in turn. If that phone number or email is already an open lead, Flash stops the duplicate.",
        tags: ["Web forms", "Duplicate check"],
    },
    {
        title: "Close deals faster",
        shape: "target",
        body: "Turn a qualified lead into a deal in one click, then drag it across your own stages. When a deal is lost, the reason is recorded, so you learn why.",
        tags: ["Deals", "Pipeline"],
    },
    {
        title: "Control who sees what",
        shape: "team",
        body: "Roles decide who can view, create, edit, delete and assign. Managers see the whole pipeline, while agents can be limited to their own leads, deals and tasks.",
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

                            <div className="h-68 border-b border-dotted border-[#1c1c1c]/30">
                                <Halftone3D shape={pillar.shape} className="h-full w-full" />
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
