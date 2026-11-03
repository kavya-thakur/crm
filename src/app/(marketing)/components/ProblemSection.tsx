import { Accent, CONTAINER, Eyebrow, Heading } from "./Eyebrow";
import { Tangle } from "./Tangle";

// The notch cut into the picture's right edge, as on twenty.com
const NOTCH = "polygon(0 0, 100% 0, 100% 11%, calc(100% - 28px) 15.5%, calc(100% - 28px) 51%, 100% 55.5%, 100% 100%, 0 100%)";

const PROBLEMS = [
    {
        title: "Spreadsheets fall apart",
        body: "Two reps call the same customer, a follow-up date slips by unnoticed, and nobody can say who changed the deal value.",
    },
    {
        title: "Enterprise CRMs fight you",
        body: "Built for thousand-seat sales teams, with a setup project and a price tag to match. Most of it sits unused.",
    },
];

export function ProblemSection() {
    return (
        <section data-reveal className="bg-white pt-1.5 pb-16">
            <div className={`${CONTAINER} grid items-start gap-12 min-[921px]:grid-cols-[minmax(0,672px)_minmax(0,1fr)] min-[921px]:gap-19`}>
                {/* the tangled CRM that comes undone into one clean ring as you scroll, on a dotted plate */}
                <div className="relative aspect-672/640 w-full overflow-hidden bg-[#f4f4f4] bg-[radial-gradient(rgb(28_28_28/0.1)_1px,transparent_1px)] bg-size-[14px_14px]" style={{ clipPath: NOTCH }}>
                    <Tangle className="absolute inset-0" />
                </div>

                <div className="min-[921px]:pt-15">
                    <Eyebrow>The problem.</Eyebrow>
                    <Heading size="md" className="mt-6 max-w-138">
                        Every sales team needs a CRM, <Accent>but most of them</Accent> end up <Accent>working against you</Accent>
                    </Heading>

                    <div className="mt-20 max-w-113.5">
                        {PROBLEMS.map((item) => (
                            <div key={item.title} className="border-t border-dotted border-[#1c1c1c]/30 py-6">
                                <h3 className="font-(family-name:--font-host-grotesk) text-[16px] leading-5.5 text-[#1c1c1c]">{item.title}</h3>
                                <p className="mt-2 max-w-95 font-(family-name:--font-host-grotesk) text-[16px] leading-[1.55] text-[#1c1c1c]/60">{item.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
