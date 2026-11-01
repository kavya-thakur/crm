"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Every loading state in the app.
 *
 *  - Spinner      a small turning arc, for buttons and inline use
 *  - PageLoader   a shimmering placeholder in the shape of what's loading (a list, a
 *                 record panel, a board or a whole page), so nothing jumps when it arrives
 *  - InlineLoader a compact "spinner + label" row, for menus and small sections
 *  - SkeletonList placeholder rows for feeds (notes, timeline, task lists)
 *  - SkeletonRows placeholder rows for a table, the same height as real ones
 *  - Skeleton     a single shimmering bar, the building block of all of the above
 *
 * The shimmer itself is the `.skeleton` class in globals.css.
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

// One shimmering bar. `delay` (seconds) offsets the sweep so a stack of bars ripples
// down the page instead of flashing in unison.
export function Skeleton({ className = "", delay = 0 }: { className?: string; delay?: number }) {
    return <div aria-hidden className={`skeleton rounded ${className}`} style={{ animationDelay: `${delay}s` }} />;
}

// Bar widths cycle through these so the placeholder rows don't look stamped out
const WIDTHS = ["w-2/5", "w-3/5", "w-1/2", "w-2/3", "w-1/3", "w-1/2"];

// Fades the placeholder in after a beat, so a quick load never flashes a skeleton
function FadeIn({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <div role="status" aria-live="polite" className={`animate-[fade-in_0.3s_ease-out_0.12s_both] ${className}`}>
            <span className="sr-only">{label}</span>
            {children}
        </div>
    );
}

// A card of list rows: a coloured dot, a name, a small label and an action at the end
function ListShape() {
    return (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
            {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex h-13 items-center gap-3 border-b border-line-light px-4 last:border-b-0">
                    <Skeleton className="size-2.5 rounded-full" delay={index * 0.08} />
                    <Skeleton className={`h-3 ${WIDTHS[index % WIDTHS.length]} max-w-56`} delay={index * 0.08} />
                    {index % 2 === 0 && <Skeleton className="h-4 w-14 rounded-full" delay={index * 0.08} />}
                    <Skeleton className="ml-auto size-5 rounded-md" delay={index * 0.08} />
                </div>
            ))}
        </div>
    );
}

// A record's side panel: the identity block and field rows on the left, tabs and a feed on the right
function RecordShape() {
    return (
        <div className="flex min-h-0 flex-1">
            <div className="flex w-full max-w-sm shrink-0 flex-col border-r border-line-light">
                <div className="flex items-center gap-3 border-b border-line-light px-4 py-4">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3" delay={0.05} />
                    </div>
                </div>
                <div className="flex flex-col gap-3.5 px-4 py-4">
                    {Array.from({ length: 7 }, (_, index) => (
                        <div key={index} className="flex items-center gap-3">
                            <Skeleton className="h-3 w-20" delay={index * 0.06} />
                            <Skeleton className={`h-3 ${WIDTHS[index % WIDTHS.length]}`} delay={index * 0.06} />
                        </div>
                    ))}
                </div>
            </div>
            <div className="hidden min-w-0 flex-1 flex-col md:flex">
                <div className="flex h-11 items-center gap-4 border-b border-line-light px-4">
                    {["w-14", "w-12", "w-12", "w-16"].map((width, index) => (
                        <Skeleton key={index} className={`h-3 ${width}`} delay={index * 0.05} />
                    ))}
                </div>
                <div className="px-4 py-4">
                    <SkeletonList rows={4} />
                </div>
            </div>
        </div>
    );
}

// Board columns, each with a heading pill and a few cards
function BoardShape() {
    return (
        <div className="flex gap-3 overflow-hidden p-3">
            {[3, 2, 4, 1, 2].map((cards, column) => (
                <div key={column} className="flex w-68 shrink-0 flex-col gap-2">
                    <Skeleton className="mb-1 h-5 w-24 rounded-md" delay={column * 0.08} />
                    {Array.from({ length: cards }, (_, index) => (
                        <div key={index} className="flex flex-col gap-2.5 rounded-lg border border-line-light bg-surface p-3">
                            <Skeleton className="h-3 w-3/4" delay={column * 0.08 + index * 0.05} />
                            <Skeleton className="h-3 w-1/2" delay={column * 0.08 + index * 0.05} />
                            <Skeleton className="h-3 w-2/5" delay={column * 0.08 + index * 0.05} />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// A whole list page: the title bar, the toolbar and a table of rows
function PageShape() {
    return (
        <div className="flex h-full flex-col">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="ml-auto h-6 w-24 rounded-lg" />
            </div>
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line-light px-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="ml-auto h-3 w-16" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-14" />
            </div>
            {Array.from({ length: 12 }, (_, index) => (
                <div key={index} className="flex h-8 shrink-0 items-center gap-6 border-b border-line-light px-3">
                    <Skeleton className="size-3.5 rounded" delay={index * 0.05} />
                    <Skeleton className="h-3 w-40" delay={index * 0.05} />
                    <Skeleton className={`h-3 ${WIDTHS[index % WIDTHS.length]} max-w-48`} delay={index * 0.05} />
                    <Skeleton className="hidden h-3 w-28 md:block" delay={index * 0.05} />
                    <Skeleton className="hidden h-4 w-16 rounded-md md:block" delay={index * 0.05} />
                </div>
            ))}
        </div>
    );
}

const SHAPES = { list: ListShape, record: RecordShape, board: BoardShape, page: PageShape };

// The placeholder shown while a section loads for the first time, in the shape of what's
// coming. `label` is read out to screen readers.
export function PageLoader({
    label = "Loading",
    variant = "list",
    className = "",
}: {
    label?: string;
    variant?: keyof typeof SHAPES;
    className?: string;
}) {
    const Shape = SHAPES[variant];

    return (
        <FadeIn label={label} className={`${variant === "list" ? "" : "flex min-h-0 flex-1 flex-col"} ${className}`}>
            <Shape />
        </FadeIn>
    );
}

// A compact spinner and label on one line, for places too small for a placeholder
export function InlineLoader({ label = "Loading", className = "" }: { label?: string; className?: string }) {
    return (
        <div role="status" aria-live="polite" className={`flex items-center justify-center gap-2 py-6 text-sm text-faint ${className}`}>
            <Spinner size={14} className="text-accent" />
            {label}
        </div>
    );
}

// Placeholder rows for a table while its first page loads: same height as a real row
// (so nothing jumps when the data arrives), the shimmer rippling down the rows
export function SkeletonRows({ colSpan, rows = 6 }: { colSpan: number; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }, (_, index) => (
                <tr key={index} role="presentation">
                    <td colSpan={colSpan} className="h-8 border-b border-line-light px-3">
                        <div className="flex items-center gap-6">
                            <Skeleton className="h-3 w-40" delay={index * 0.06} />
                            <Skeleton className={`h-3 ${WIDTHS[index % WIDTHS.length]} max-w-56`} delay={index * 0.06} />
                            <Skeleton className="h-4 w-16 rounded-md" delay={index * 0.06} />
                        </div>
                    </td>
                </tr>
            ))}
        </>
    );
}

// Placeholder rows for a feed (notes, timeline, a record's tasks): a round avatar and two lines
export function SkeletonList({ rows = 3, className = "" }: { rows?: number; className?: string }) {
    return (
        <div role="status" aria-label="Loading" className={`flex flex-col gap-5 ${className}`}>
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex gap-3">
                    <Skeleton className="size-6.5 shrink-0 rounded-full" delay={index * 0.1} />
                    <div className="flex flex-1 flex-col gap-2 pt-1">
                        <Skeleton className="h-3 w-1/4" delay={index * 0.1} />
                        <Skeleton className={`h-3 ${WIDTHS[(index + 2) % WIDTHS.length]}`} delay={index * 0.1 + 0.05} />
                    </div>
                </div>
            ))}
        </div>
    );
}
