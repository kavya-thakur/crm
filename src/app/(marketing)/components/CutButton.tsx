import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

const HEIGHTS = { regular: 40, small: 32 } as const;

// How the bottom-right corner is cut: the right cap is 15px wide, and the diagonal
// takes this much of its height off the straight edge
const CAP_CUT = 19.477;

// The button is drawn from three parts so it can stretch to any label length: a rounded
// left cap, a flexible middle, and a right cap whose bottom corner is cut at an angle.
function Shape({ height, mode }: { height: number; mode: "fill" | "stroke" }) {
    const edge = height - CAP_CUT;

    const left =
        mode === "fill"
            ? `M4 0 A4 4 0 0 0 0 4 V${height - 4} A4 4 0 0 0 4 ${height} Z`
            : `M4 0.5 A3.5 3.5 0 0 0 0.5 4 V${height - 4} A3.5 3.5 0 0 0 4 ${height - 0.5}`;

    const right =
        mode === "fill"
            ? `M0 0 h11 a4 4 0 0 1 4 4 v${edge} a6 6 0 0 1 -1.544 4.019 l-8.548 9.477 A6 6 0 0 1 0.453 ${height} H0 Z`
            : `M0 0.5 h11 a3.5 3.5 0 0 1 3.5 3.5 v${edge} a5.5 5.5 0 0 1 -1.416 3.684 l-8.547 9.477 a5.5 5.5 0 0 1 -4.084 1.816 H0`;

    const pathStyle: CSSProperties =
        mode === "fill"
            ? { fill: "var(--button-fill)", transition: "fill 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }
            : { fill: "none", stroke: "var(--button-stroke)", strokeWidth: 1, strokeLinecap: "round", strokeLinejoin: "round" };

    const middleStyle: CSSProperties =
        mode === "fill"
            ? { backgroundColor: "var(--button-fill)" }
            : { borderBlock: "1px solid var(--button-stroke)" };

    return (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex">
            <svg width={4} height={height} viewBox={`0 0 4 ${height}`} className="block shrink-0">
                <path d={left} style={pathStyle} />
            </svg>
            <span className="-mx-px min-w-0 grow" style={middleStyle} />
            <svg width={15} height={height} viewBox={`0 0 15 ${height}`} className="block shrink-0">
                <path d={right} style={pathStyle} />
            </svg>
        </span>
    );
}

// The colours of each look. "dark" is for buttons placed on the near-black sections.
function colours(variant: "filled" | "outlined", scheme: "light" | "dark") {
    const ink = scheme === "dark" ? "#ffffff" : "#1c1c1c";

    if (variant === "filled") {
        return scheme === "dark"
            ? { fill: "#ffffff", hoverFill: "#e8e8e8", stroke: "transparent", label: "#1c1c1c", labelHover: "#1c1c1c", hoverOpacity: 1 }
            : { fill: "#1c1c1c", hoverFill: "#333333", stroke: "transparent", label: "#ffffff", labelHover: "#ffffff", hoverOpacity: 1 };
    }

    return { fill: "transparent", hoverFill: ink, stroke: ink, label: ink, labelHover: ink, hoverOpacity: 0.05 };
}

interface CutButtonProps {
    href: string;
    children: ReactNode;
    variant?: "filled" | "outlined";
    size?: keyof typeof HEIGHTS;
    scheme?: "light" | "dark";
    className?: string;
}

// The marketing site's button: uppercase mono label in a shape with one cut corner.
// On hover a layer slides in from the left and fills it.
export function CutButton({ href, children, variant = "filled", size = "regular", scheme = "light", className = "" }: CutButtonProps) {
    const height = HEIGHTS[size];
    const tone = colours(variant, scheme);

    const vars = {
        "--button-fill": tone.fill,
        "--button-stroke": tone.stroke,
        "--button-hover-fill": tone.hoverFill,
        "--button-label": tone.label,
        "--button-label-hover": tone.labelHover,
        height,
    } as CSSProperties;

    return (
        <Link
            href={href}
            style={vars}
            className={`group relative inline-flex items-center justify-center font-(family-name:--font-azeret-mono) text-[12px] font-medium whitespace-nowrap uppercase outline-offset-1 focus-visible:outline focus-visible:outline-[#4a38f5] ${size === "small" ? "px-4" : "px-5"} ${className}`}
        >
            <Shape height={height} mode={variant === "filled" ? "fill" : "stroke"} />

            {/* the hover wash: a copy of the shape in the hover colour, parked off to the left */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-xs"
                style={{ opacity: tone.hoverOpacity, "--button-fill": "var(--button-hover-fill)", "--button-stroke": "transparent" } as CSSProperties}
            >
                <span className="relative block h-full w-full -translate-x-[calc(100%+16px)] transition-transform duration-260 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0 group-focus-visible:translate-x-0 motion-reduce:transition-none">
                    <Shape height={height} mode="fill" />
                </span>
            </span>

            <span className="relative inline-flex items-center gap-2 text-(--button-label) transition-colors duration-200 group-hover:text-(--button-label-hover)">
                {children}
            </span>
        </Link>
    );
}
