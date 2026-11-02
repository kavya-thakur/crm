import { Accent, CONTAINER, Eyebrow, Heading, PlusMark } from "./Eyebrow";
import { Halftone3D, type ShapeName } from "./Halftone3D";
import { ArrowTile, FolderCard } from "./FolderCard";

// Kinds of teams Flash is made for. Where twenty.com shows customer stories, these are
// honest examples of use, not invented customers.
const USE_CASES: { team: string; shape: ShapeName; color: string; body: string; tags: [string, string] }[] = [
    {
        team: "Agencies",
        shape: "plane",
        color: "#ed87fc",
        body: "Track every enquiry from first call to signed retainer, and see which source actually brings in the work.",
        tags: ["Lead sources", "Deals"],
    },
    {
        team: "B2B sales teams",
        shape: "trophy",
        color: "#89fc9a",
        body: "Give managers the whole pipeline and agents only their own leads, with every hand-off on the timeline.",
        tags: ["Roles", "Pipeline"],
    },
    {
        team: "Founders selling first",
        shape: "hourglass",
        color: "#feffb7",
        body: "Replace the spreadsheet before it breaks: contacts, follow-ups and notes in one place from day one.",
        tags: ["Contacts", "Tasks"],
    },
];

export function UseCasesSection() {
    return (
        <section data-reveal className="relative overflow-clip bg-[#f4f4f4] pb-30">
            {/* guide lines crossing above the heading, with a blue cross where they meet */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full">
                <div className={`${CONTAINER} relative h-full`}>
                    <span className="absolute top-0 left-1/2 h-52 w-px bg-[#1c1c1c]/10" />
                    <span className="absolute top-28 right-10 left-10 h-px bg-[#1c1c1c]/10" />
                    <PlusMark className="top-[106.5px] left-[calc(50%-5px)]" />
                </div>
            </div>

            <div className={`${CONTAINER} relative pt-60`}>
                <div className="flex flex-col items-center text-center">
                    <Eyebrow>In practice.</Eyebrow>
                    <Heading size="xl" className="mt-6 max-w-200">
                        Small teams run their <Accent>whole sales day in Flash</Accent>
                    </Heading>
                </div>

                <div className="mt-24 grid gap-6 min-[921px]:grid-cols-3 min-[921px]:items-start">
                    {USE_CASES.map((useCase, index) => (
                        // staggered down the page, the way twenty.com scatters its story cards
                        <FolderCard key={useCase.team} dark className={index === 1 ? "min-[921px]:mt-24" : index === 2 ? "min-[921px]:mt-48" : ""}>
                            <h3 className="border-b border-white/20 pt-1 pb-4 font-(family-name:--font-host-grotesk) text-[16px] font-medium text-white">{useCase.team}</h3>

                            <div className="h-64">
                                <Halftone3D shape={useCase.shape} color={useCase.color} className="h-full w-full" />
                            </div>

                            <p className="font-(family-name:--font-host-grotesk) text-[16px] leading-[1.55] text-white/60">{useCase.body}</p>

                            <div className="mt-6 flex items-end justify-between gap-3">
                                <span className="flex items-center gap-2 pb-0.5 font-(family-name:--font-host-grotesk) text-[12px] text-white">
                                    <span className="font-medium">{useCase.tags[0]}</span>
                                    <span aria-hidden className="h-4 w-px bg-white/20" />
                                    {useCase.tags[1]}
                                </span>
                                <ArrowTile href="/register" label={`Start using Flash for ${useCase.team.toLowerCase()}`} dark />
                            </div>
                        </FolderCard>
                    ))}
                </div>
            </div>
        </section>
    );
}
