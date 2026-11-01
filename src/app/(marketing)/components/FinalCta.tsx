import Link from "next/link";
import { Halftone } from "./Halftone";

export function FinalCta({ primaryHref, primaryLabel }: { primaryHref: string; primaryLabel: string }) {
    return (
        <section data-reveal className="relative overflow-hidden bg-[#1c1c1c] pt-20 pb-28">
            <Halftone shape="bolt" size={320} fade="top" className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 text-white/10" />

            <div className="relative mx-auto max-w-2xl px-6 text-center">
                <h2 className="font-(family-name:--font-aleo) text-[32px] font-light tracking-tight text-white">
                    Ready to run a <span className="font-normal">tighter pipeline?</span>
                </h2>
                <p className="mt-3 font-(family-name:--font-host-grotesk) text-base text-white/60">
                    Set up a workspace for your team in a few minutes.
                </p>
                <Link
                    href={primaryHref}
                    className="mt-7 inline-flex h-11 items-center rounded-lg bg-white px-6 font-(family-name:--font-azeret-mono) text-xs font-medium tracking-wide text-[#1c1c1c] uppercase hover:bg-white/90"
                >
                    {primaryLabel}
                </Link>
            </div>

            {/* the wavy seam into the (white) footer below */}
            <svg
                className="absolute inset-x-0 bottom-0 text-white"
                viewBox="0 0 1440 60"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <path fill="currentColor" d="M0,60 L0,30 Q360,0 720,20 Q1080,40 1440,10 L1440,60 Z" />
            </svg>
        </section>
    );
}
