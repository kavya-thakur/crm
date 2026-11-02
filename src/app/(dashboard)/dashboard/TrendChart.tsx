"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import gsap from "gsap";

export interface TrendPoint {
    /** ISO date the slice starts on */
    start: string;
    value: number;
}

interface TrendChartProps {
    /** what's measured, for screen readers: "Revenue won" */
    title: string;
    points: TrendPoint[];
    /** the period before, slice for slice, drawn as a quiet grey line to compare against */
    previous?: number[];
    variant?: "line" | "columns";
    /** short label under the axis: "Oct 3", "Nov" */
    axisLabel: (point: TrendPoint) => string;
    /** what the tooltip calls a slice: "Tue, Oct 3", "Week of Oct 3" */
    tooltipLabel: (point: TrendPoint) => string;
    formatTick: (value: number) => string;
    formatValue: (value: number) => string;
    height?: number;
}

const TOP = 10;
const AXIS_BAND = 28; // under the plot, for the date labels
const LEFT = 52; // left of the plot, for the value labels
const RIGHT_PAD = 10;
const ACCENT = "#4a38f5";
const PREVIOUS = "#c2c2c2";

// Rounds the largest value up to a tidy axis top (1, 2, 2.5 or 5 × a power of ten, × 4 rows)
function niceMax(value: number) {
    if (value <= 0) return 4;
    const step = value / 4;
    const power = 10 ** Math.floor(Math.log10(step));
    const nice = [1, 2, 2.5, 5, 10].find((n) => n * power >= step)!;
    return nice * power * 4;
}

// A column with a rounded top and a square foot on the baseline
function columnPath(x: number, y: number, width: number, baseline: number) {
    const r = Math.min(4, width / 2, baseline - y);
    if (baseline - y < 0.5) return "";
    return `M${x},${baseline}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${baseline}Z`;
}

// One measure over time: a blue line on a soft wash (optionally over last period's grey
// line), or blue columns. Hovering, or the arrow keys, read out the nearest slice.
export function TrendChart({
    title,
    points,
    previous,
    variant = "line",
    axisLabel,
    tooltipLabel,
    formatTick,
    formatValue,
    height = 176,
}: TrendChartProps) {
    const boxRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<SVGGElement>(null);
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState<number | null>(null);
    // the wash gradient needs a page-unique id; React's has characters url(#...) can't take
    const washId = `wash-${useId().replace(/[^\w-]/g, "")}`;

    // The chart is drawn at its real pixel width, so text never stretches
    useLayoutEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    // Lines draw in from the left and columns grow up whenever the data changes
    const drawn = width > 0;
    useLayoutEffect(() => {
        const group = drawRef.current;
        if (!drawn || !group) return;
        const media = gsap.matchMedia();
        media.add("(prefers-reduced-motion: no-preference)", () => {
            if (variant === "line") {
                gsap.fromTo(group.querySelectorAll("[data-line]"), { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.out" });
                gsap.fromTo(group.querySelectorAll("[data-wash]"), { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.25 });
            } else {
                gsap.fromTo(group.querySelectorAll("[data-column]"), { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: "power3.out", stagger: 0.012, transformOrigin: "50% 100%" });
            }
        });
        return () => media.revert();
    }, [drawn, points, variant]);

    const count = points.length;
    const max = niceMax(Math.max(...points.map((point) => point.value), ...(previous ?? [])));
    const plotRight = Math.max(width - RIGHT_PAD, LEFT + 1);
    const baseline = TOP + height;

    // lines run edge to edge; columns sit in the middle of equal bands
    const band = variant === "columns" ? (plotRight - LEFT) / count : count > 1 ? (plotRight - LEFT) / (count - 1) : 0;
    const x = (index: number) => (variant === "columns" ? LEFT + band * (index + 0.5) : LEFT + index * band);
    const y = (value: number) => baseline - (value / max) * height;
    const columnWidth = Math.min(24, band * 0.62);

    const linePath = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join("");
    const line = linePath(points.map((point) => point.value));
    const area = `${line}L${x(count - 1)},${baseline}L${x(0)},${baseline}Z`;
    const ticks = [0, 1, 2, 3, 4].map((row) => (max * row) / 4);
    // about six date labels, whatever the number of slices
    const labelEvery = Math.ceil(count / 6);

    function pointAt(event: PointerEvent<SVGSVGElement>) {
        const left = event.currentTarget.getBoundingClientRect().left;
        const offset = event.clientX - left - LEFT;
        const index = variant === "columns" ? Math.floor(offset / band) : Math.round(offset / (band || 1));
        setActive(Math.min(count - 1, Math.max(0, index)));
    }

    // Arrow keys walk the slices, so the values are reachable without a mouse
    function handleKey(event: KeyboardEvent) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const from = active ?? count - 1;
        setActive(Math.min(count - 1, Math.max(0, from + (event.key === "ArrowRight" ? 1 : -1))));
    }

    const point = active === null ? null : points[active];
    // the tooltip sits beside the crosshair, flipping to the left in the right half
    const flip = active !== null && x(active) > width / 2;

    return (
        <div>
            {previous && (
                <div className="mb-2 flex justify-end gap-4 text-sm text-muted">
                    <LegendKey color={ACCENT}>This period</LegendKey>
                    <LegendKey color={PREVIOUS}>Previous period</LegendKey>
                </div>
            )}

            <div ref={boxRef} className="relative" style={{ height: height + TOP + AXIS_BAND }}>
                {drawn && (
                    <svg
                        width={width}
                        height={height + TOP + AXIS_BAND}
                        tabIndex={0}
                        role="img"
                        aria-label={`${title} over time. Use the left and right arrow keys to read each value.`}
                        onPointerMove={pointAt}
                        onPointerLeave={() => setActive(null)}
                        onKeyDown={handleKey}
                        onBlur={() => setActive(null)}
                        className="block touch-pan-y rounded-md outline-none focus-visible:ring-3 focus-visible:ring-accent-soft"
                    >
                        <defs>
                            <linearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.16} />
                                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        {/* hairline grid with the values on the left */}
                        {ticks.map((tick) => (
                            <g key={tick}>
                                <line x1={LEFT} x2={plotRight} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "#d6d6d6" : "#f1f1f1"} />
                                <text x={LEFT - 10} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-faint text-[11px] tabular-nums">
                                    {formatTick(tick)}
                                </text>
                            </g>
                        ))}

                        {points.map(
                            (item, index) =>
                                index % labelEvery === 0 && (
                                    <text
                                        key={item.start}
                                        x={x(index)}
                                        y={baseline + 19}
                                        textAnchor={variant === "line" && index === 0 ? "start" : "middle"}
                                        className="fill-faint text-[11px]"
                                    >
                                        {axisLabel(item)}
                                    </text>
                                ),
                        )}

                        {active !== null && variant === "line" && <line x1={x(active)} x2={x(active)} y1={TOP} y2={baseline} stroke="#d6d6d6" />}

                        <g ref={drawRef}>
                            {variant === "line" ? (
                                <>
                                    {previous && (
                                        <path data-line d={linePath(previous)} pathLength={1} fill="none" stroke={PREVIOUS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                                    )}
                                    <path data-wash d={area} fill={`url(#${washId})`} />
                                    <path data-line d={line} pathLength={1} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                                </>
                            ) : (
                                points.map((item, index) => (
                                    <path
                                        key={item.start}
                                        data-column
                                        d={columnPath(x(index) - columnWidth / 2, y(item.value), columnWidth, baseline)}
                                        fill={ACCENT}
                                        // the hovered column stays strong, the rest step back
                                        opacity={active === null || active === index ? 1 : 0.4}
                                        className="transition-opacity duration-150"
                                    />
                                ))
                            )}
                        </g>

                        {/* the latest slice is always marked on a line */}
                        {variant === "line" && <Dot cx={x(active ?? count - 1)} cy={y(points[active ?? count - 1].value)} />}
                    </svg>
                )}

                {point && active !== null && (
                    <div
                        className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 whitespace-nowrap shadow-strong backdrop-blur-md"
                        style={{ left: x(active) + (flip ? -14 : 14), top: TOP, transform: flip ? "translateX(-100%)" : undefined }}
                    >
                        <p className="mb-0.5 text-sm text-faint">{tooltipLabel(point)}</p>
                        <TooltipRow color={ACCENT} value={formatValue(point.value)} label={previous ? "This period" : undefined} />
                        {previous && <TooltipRow color={PREVIOUS} value={formatValue(previous[active])} label="Previous period" />}
                    </div>
                )}

                {/* the same numbers as a table, for screen readers */}
                <table className="sr-only">
                    <caption>{title} per period</caption>
                    <tbody>
                        {points.map((item, index) => (
                            <tr key={item.start}>
                                <th scope="row">{tooltipLabel(item)}</th>
                                <td>{formatValue(item.value)}</td>
                                {previous && <td>Previous period: {formatValue(previous[index])}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// A data point: filled with the line colour, with a white ring so it stands off the line
function Dot({ cx, cy }: { cx: number; cy: number }) {
    return <circle cx={cx} cy={cy} r={4.5} fill={ACCENT} stroke="#ffffff" strokeWidth={2} />;
}

// A short stroke of the series colour, the way the line itself looks
function LegendKey({ color, children }: { color: string; children: string }) {
    return (
        <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
            {children}
        </span>
    );
}

function TooltipRow({ color, value, label }: { color: string; value: string; label?: string }) {
    return (
        <p className="flex items-center gap-2">
            {label && <span className="h-0.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
            <span className="font-semibold text-ink">{value}</span>
            {label && <span className="text-sm text-faint">{label}</span>}
        </p>
    );
}
