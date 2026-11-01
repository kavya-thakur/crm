import { Eyebrow, Heading } from "./Eyebrow";
import { Halftone } from "./Halftone";

const PILLARS = [
    {
        title: "One pipeline, start to finish",
        shape: "target" as const,
        body: "Leads, deals and contacts live in the same workspace, so a lead becomes a deal without re-entering a thing.",
    },
    {
        title: "Shaped around your process",
        shape: "bolt" as const,
        body: "Add the fields your team actually tracks, name your own pipeline stages and lead sources — not someone else's defaults.",
    },
    {
        title: "Access that matches your org",
        shape: "shield" as const,
        body: "Roles decide exactly who can see, assign or delete what, down to whether an agent sees only their own leads.",
    },
];

// The cut top-right corner is Twenty's recurring card shape — a ticket, not a
// plain rounded rectangle.
const TICKET_CLIP = "polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%)";

export function PillarsSection() {
    return (
        <section id="product" data-reveal className="border-t border-line bg-paper py-24">
            <div className="mx-auto max-w-5xl px-6">
                <Eyebrow>What you get</Eyebrow>
                <Heading className="mt-3 text-[30px] leading-tight sm:text-[40px]">
                    Everything a sales team needs, <span className="font-light">nothing it doesn&apos;t</span>
                </Heading>

                <div className="mt-14 grid gap-6 sm:grid-cols-3">
                    {PILLARS.map((pillar) => (
                        <div key={pillar.title} className="relative border border-line bg-white p-6" style={{ clipPath: TICKET_CLIP }}>
                            <span className="pointer-events-none absolute top-0 right-0 h-7 w-7 border-b border-l border-line" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 0)" }} />
                            <h3 className="border-b border-dashed border-line pb-3 text-[16px] font-medium text-[#1c1c1c]">{pillar.title}</h3>
                            <div className="flex h-32 items-center justify-center">
                                <Halftone shape={pillar.shape} size={110} fade="even" className="text-[#4F46E5]" />
                            </div>
                            <p className="border-t border-dashed border-line pt-3 text-[14px] leading-relaxed text-muted">{pillar.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
