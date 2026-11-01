import { Eyebrow, Heading } from "./Eyebrow";
import { Halftone } from "./Halftone";

const PROBLEMS = [
    {
        title: "Spreadsheets fall apart",
        body: "A shared sheet works until two people edit the same row, a formula breaks, or someone leaves and takes the only copy with them.",
    },
    {
        title: "Enterprise CRMs fight you",
        body: "Built for thousand-seat sales orgs, with a setup process and a price tag to match — most of it sits unused by a small team.",
    },
];

export function ProblemSection() {
    return (
        <section data-reveal className="mx-auto max-w-5xl px-6 py-24">
            <Eyebrow>The problem</Eyebrow>
            <Heading className="mt-3 text-[30px] leading-tight sm:text-[40px]">
                A CRM should fit your team, <span className="font-light">not the other way around</span>
            </Heading>

            <div className="mt-14 grid gap-10 lg:grid-cols-[320px_1fr] lg:items-start">
                <div className="flex aspect-square items-center justify-center rounded-xl border border-line bg-[#1c1c1c]">
                    <Halftone shape="shield" size={180} fade="even" className="text-[#4F46E5]" />
                </div>

                <div className="divide-y divide-dashed divide-line">
                    {PROBLEMS.map((item) => (
                        <div key={item.title} className="py-6 first:pt-0">
                            <h3 className="text-[19px] font-medium text-[#1c1c1c]">{item.title}</h3>
                            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">{item.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
