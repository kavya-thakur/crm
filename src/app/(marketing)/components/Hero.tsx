import { CutButton } from "./CutButton";
import { DashArt, skyline } from "./DashArt";
import { HeroPreview } from "./HeroPreview";

const ART_WIDTH = 420;
const ART_HEIGHT = 800;

// Two skylines either side of the product window, climbing toward it like a chart.
// Fixed shapes, so they look the same on every visit.
const LEFT_TOWERS = [
    { x: 0, width: 42, height: 0.5 },
    { x: 48, width: 30, height: 0.44 },
    { x: 84, width: 54, height: 0.62 },
    { x: 144, width: 36, height: 0.56 },
    { x: 186, width: 60, height: 0.74 },
    { x: 252, width: 42, height: 0.68 },
    { x: 300, width: 120, height: 0.9 },
];
const RIGHT_TOWERS = [
    { x: 0, width: 120, height: 0.94 },
    { x: 126, width: 48, height: 0.78 },
    { x: 180, width: 66, height: 0.86 },
    { x: 252, width: 36, height: 0.66 },
    { x: 294, width: 60, height: 0.74 },
    { x: 360, width: 30, height: 0.56 },
    { x: 396, width: 24, height: 0.62 },
];

export function Hero({ loggedIn, primaryHref, primaryLabel }: { loggedIn: boolean; primaryHref: string; primaryLabel: string }) {
    return (
        <section className="relative overflow-clip bg-[#f4f4f4]">
            {/* a soft warm glow behind the headline */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -inset-x-[20%]"
                style={{ background: "radial-gradient(80% 60% at 50% 40%, #f5f3f099 0%, #0000 70%)" }}
            />
            <DashArt
                width={ART_WIDTH}
                height={ART_HEIGHT}
                sample={skyline(LEFT_TOWERS, ART_HEIGHT)}
                className="pointer-events-none absolute bottom-0 left-0 hidden text-[#4a38f5] min-[921px]:block"
            />
            <DashArt
                width={ART_WIDTH}
                height={ART_HEIGHT}
                sample={skyline(RIGHT_TOWERS, ART_HEIGHT)}
                className="pointer-events-none absolute right-0 bottom-0 hidden text-[#4a38f5] min-[921px]:block"
            />

            <div className="relative mx-auto flex w-full max-w-378 flex-col px-4 pt-12 pb-10 min-[921px]:px-10">
                <div className="flex w-full flex-col items-center text-center [&>*+*]:mt-8">
                    <div className="grid w-full justify-items-center [&>*+*]:mt-3">
                        <div className="w-full max-w-168">
                            <h1
                                data-hero-line
                                className="font-(family-name:--font-aleo) text-[clamp(2.5rem,1.5819rem+3.7665vw,3.75rem)] leading-[clamp(2.875rem,1.9569rem+3.7665vw,4.125rem)] font-light tracking-[-0.02em] text-balance text-[#1c1c1c]"
                            >
                                Run your pipeline,{" "}
                                {/* the second half of the headline switches to the sans face, as on twenty.com */}
                                <span className="font-(family-name:--font-host-grotesk) tracking-[-0.04em]">not your inbox</span>
                            </h1>
                        </div>
                        <div className="mx-auto max-w-147.75">
                            <p data-hero-line className="font-(family-name:--font-host-grotesk) text-[16px] leading-[1.55] font-normal text-[#1c1c1c]/60">
                                Flash keeps every lead, deal and conversation in one workspace your whole team actually uses, set up in minutes and shaped around how you sell.
                            </p>
                        </div>
                    </div>

                    <div data-hero-line className="flex flex-wrap justify-center gap-3">
                        <CutButton href={primaryHref}>{primaryLabel}</CutButton>
                        {!loggedIn && (
                            <CutButton href="#how-it-works" variant="outlined">
                                See how it works
                            </CutButton>
                        )}
                    </div>
                </div>

                <div data-hero-mockup className="relative z-10 mt-17 w-full">
                    <HeroPreview />
                </div>
            </div>
        </section>
    );
}
