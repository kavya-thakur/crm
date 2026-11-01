"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Every loading state in the app. All motion runs through GSAP and stays still
 * (a gentle fade instead of movement) for people who ask for reduced motion.
 *
 *  - Spinner      a small turning arc, for buttons and inline use
 *  - PageLoader   a whole panel / page / board loading for the first time
 *  - InlineLoader a compact "spinner + label" row, for menus and small sections
 *  - SkeletonList placeholder rows for feeds (notes, timeline, task lists)
 *  - SkeletonRows placeholder rows for a table, the same height as real ones
 *  - Skeleton     a single shimmering bar, the building block of the two above
 */

const NO_MOTION = "(prefers-reduced-motion: no-preference)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// A thin arc that turns and breathes (grows and shrinks) as it goes, so it feels
// alive instead of mechanical. Takes its colour from the surrounding text colour.
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const arcRef = useRef<SVGCircleElement>(null);

    useLayoutEffect(() => {
        const media = gsap.matchMedia();

        media.add(NO_MOTION, () => {
            gsap.to(svgRef.current, { rotation: 360, duration: 1.1, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
            gsap.fromTo(
                arcRef.current,
                { strokeDasharray: "12 100" },
                { strokeDasharray: "62 100", duration: 0.8, ease: "sine.inOut", repeat: -1, yoyo: true }
            );
        });
        media.add(REDUCED_MOTION, () => {
            gsap.fromTo(svgRef.current, { opacity: 0.35 }, { opacity: 1, duration: 0.9, ease: "sine.inOut", repeat: -1, yoyo: true });
        });

        return () => media.revert();
    }, []);

    return (
        <svg ref={svgRef} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 ${className}`}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
            <circle
                ref={arcRef}
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                // pathLength makes the dash lengths percentages of the circle
                pathLength={100}
                strokeDasharray="40 100"
            />
        </svg>
    );
}

// Three dots that pulse one after the other, after a label: "Loading..."
function AnimatedDots() {
    const ref = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const media = gsap.matchMedia();

        media.add(NO_MOTION, () => {
            gsap.fromTo(
                ref.current?.children ?? [],
                { opacity: 0.2 },
                { opacity: 1, duration: 0.45, ease: "sine.inOut", repeat: -1, yoyo: true, stagger: 0.18 }
            );
        });

        return () => media.revert();
    }, []);

    return (
        <span ref={ref} aria-hidden className="ml-0.5 inline-flex">
            <i className="not-italic opacity-100">.</i>
            <i className="not-italic opacity-100">.</i>
            <i className="not-italic opacity-100">.</i>
        </span>
    );
}

// Fills the space it's put in (a record panel, a board, a settings page) with a
// centred, pulsing mark and a label. It fades in after a beat, so a fast load
// never flashes a loader for a split second.
export function PageLoader({ label = "Loading", className = "" }: { label?: string; className?: string }) {
    const rootRef = useRef<HTMLDivElement>(null);
    const haloRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const media = gsap.matchMedia();

        media.add(NO_MOTION, () => {
            gsap.fromTo(rootRef.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, delay: 0.15, ease: "power2.out" });
            // a soft ring that swells and fades out from behind the mark, like a pulse
            gsap.fromTo(
                haloRef.current,
                { scale: 0.75, opacity: 0.55 },
                { scale: 1.6, opacity: 0, duration: 1.6, ease: "power2.out", repeat: -1, delay: 0.15 }
            );
        });
        media.add(REDUCED_MOTION, () => {
            gsap.set(rootRef.current, { opacity: 1 });
        });

        return () => media.revert();
    }, []);

    return (
        <div
            ref={rootRef}
            role="status"
            aria-live="polite"
            className={`flex flex-1 flex-col items-center justify-center gap-4 py-16 opacity-0 ${className}`}
        >
            <div className="relative flex size-14 items-center justify-center">
                <span ref={haloRef} aria-hidden className="absolute inset-0 rounded-full bg-accent-soft" />
                <span className="relative flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-accent shadow-light">
                    <Spinner size={22} />
                </span>
            </div>
            <p className="text-muted">
                {label}
                <AnimatedDots />
            </p>
        </div>
    );
}

// A compact spinner and label on one line, for places too small for a PageLoader
export function InlineLoader({ label = "Loading", className = "" }: { label?: string; className?: string }) {
    return (
        <div role="status" aria-live="polite" className={`flex items-center justify-center gap-2 py-6 text-sm text-faint ${className}`}>
            <Spinner size={14} className="text-accent" />
            {label}
        </div>
    );
}

// A grey bar with a soft highlight sweeping across it. `delay` offsets the sweep so a
// stack of bars ripples down instead of flashing in unison.
export function Skeleton({ className = "", delay = 0 }: { className?: string; delay?: number }) {
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const media = gsap.matchMedia();

        media.add(NO_MOTION, () => {
            gsap.fromTo(
                ref.current,
                { backgroundPositionX: "100%" },
                { backgroundPositionX: "0%", duration: 1.5, ease: "power1.inOut", repeat: -1, repeatDelay: 0.15, delay }
            );
        });

        return () => media.revert();
    }, [delay]);

    return (
        <div
            ref={ref}
            aria-hidden
            className={`rounded bg-app ${className}`}
            style={{
                backgroundImage: "linear-gradient(90deg, transparent 30%, rgb(255 255 255 / 0.85) 50%, transparent 70%)",
                backgroundSize: "200% 100%",
                backgroundRepeat: "no-repeat",
                backgroundPositionX: "100%",
            }}
        />
    );
}

// Bar widths cycle through these so the placeholder rows don't look stamped out
const ROW_WIDTHS = ["w-2/5", "w-3/5", "w-1/2", "w-2/3", "w-1/3", "w-1/2"];

// Placeholder rows for a table while its first page loads: same height as a real row
// (so nothing jumps when the data arrives), the sweep rippling down the rows
export function SkeletonRows({ colSpan, rows = 6 }: { colSpan: number; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }, (_, index) => (
                <tr key={index} role="presentation">
                    <td colSpan={colSpan} className="h-8 border-b border-line-light px-3">
                        <Skeleton className={`h-2.5 ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} delay={index * 0.1} />
                    </td>
                </tr>
            ))}
        </>
    );
}

// Placeholder rows for a feed (notes, timeline, a record's tasks): a round avatar and two lines
export function SkeletonList({ rows = 3, className = "" }: { rows?: number; className?: string }) {
    return (
        <div role="status" aria-label="Loading" className={`flex flex-col gap-4 ${className}`}>
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex gap-2.5">
                    <Skeleton className="size-6.5 shrink-0 rounded-full" delay={index * 0.12} />
                    <div className="flex flex-1 flex-col gap-2 pt-1">
                        <Skeleton className="h-2.5 w-1/4" delay={index * 0.12} />
                        <Skeleton className={`h-2.5 ${ROW_WIDTHS[(index + 2) % ROW_WIDTHS.length]}`} delay={index * 0.12 + 0.05} />
                    </div>
                </div>
            ))}
        </div>
    );
}
