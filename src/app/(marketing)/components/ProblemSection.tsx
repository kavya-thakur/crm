import { Accent, CONTAINER, Eyebrow, Heading } from "./Eyebrow";
import { DashArt, noise, type Sampler } from "./DashArt";

const ART_WIDTH = 672;
const ART_HEIGHT = 640;

// Our own scene, drawn in bars: a tall slab (the heavyweight CRM) standing in a valley,
// rock rising up behind it on the right, open sky above. Two layers: grey sky, black rock.
const SLAB_LEFT = ART_WIDTH * 0.4;
const SLAB_RIGHT = ART_WIDTH * 0.53;
const SLAB_TOP = ART_HEIGHT * 0.07;

// where the rock begins at a given x (higher on the right, a low ridge on the left)
function rockTop(x: number) {
    if (x > SLAB_RIGHT) return ART_HEIGHT * (0.62 - ((x - SLAB_RIGHT) / (ART_WIDTH - SLAB_RIGHT)) * 0.58);
    return ART_HEIGHT * (0.68 + Math.sin(x / 70) * 0.03);
}

const inSlab = (x: number, y: number) => x >= SLAB_LEFT && x < SLAB_RIGHT && y >= SLAB_TOP;

const sky: Sampler = (x, y) => {
    if (inSlab(x, y) || y >= rockTop(x)) return 0;
    // long grey bars near the horizon, breaking up more and more toward the top
    const height = 1 - y / ART_HEIGHT;
    const grain = noise(x, y);
    if (grain < 0.1 + height * 0.25) return 0;
    return grain < 0.2 + height * 0.45 ? 0.5 : 0.95;
};

const rock: Sampler = (x, y) => {
    if (inSlab(x, y)) {
        // a thin lit edge down the left side of the slab
        return x < SLAB_LEFT + 10 ? 0.45 : 0.97;
    }
    if (y < rockTop(x)) return 0;
    const grain = noise(x, y);
    return grain < 0.22 ? 0.3 + grain : 0.95;
};

// The notch cut into the picture's right edge, as on twenty.com
const NOTCH = "polygon(0 0, 100% 0, 100% 11%, calc(100% - 28px) 15.5%, calc(100% - 28px) 51%, 100% 55.5%, 100% 100%, 0 100%)";

const PROBLEMS = [
    {
        title: "Spreadsheets fall apart",
        body: "A shared sheet works until two people edit the same row, a formula breaks, or someone leaves with the only copy.",
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
                <div className="relative aspect-672/640 w-full overflow-hidden" style={{ clipPath: NOTCH }}>
                    <DashArt width={ART_WIDTH} height={ART_HEIGHT} sample={sky} className="absolute inset-0 h-full w-full text-[#bababa]" />
                    <DashArt width={ART_WIDTH} height={ART_HEIGHT} sample={rock} className="absolute inset-0 h-full w-full text-[#1c1c1c]" />
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
