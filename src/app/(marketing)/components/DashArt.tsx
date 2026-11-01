import type { CSSProperties } from "react";

// How dark the artwork is at a point, from 0 (empty) to 1 (solid). x and y are in px,
// measured from the top-left of the artwork.
export type Sampler = (x: number, y: number) => number;

// A repeatable stand-in for randomness: the same point always gives the same value
// (0 to 1), so the server and the browser draw exactly the same picture.
export function noise(x: number, y: number) {
    let h = Math.imul(Math.round(x) | 0, 374761393) ^ Math.imul(Math.round(y) | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

interface DashArtProps {
    width: number;
    height: number;
    sample: Sampler;
    /** distance between rows of bars */
    rowGap?: number;
    barHeight?: number;
    /** width of one sampling cell; solid cells side by side join into a long bar */
    cell?: number;
    className?: string;
    style?: CSSProperties;
}

// twenty.com's illustration style: a picture drawn only with horizontal bars. Dark areas
// become long unbroken bars, lighter areas break up into shorter and shorter dashes.
// The whole picture is one SVG path, so even a large piece stays light. Colour comes
// from the text colour.
export function DashArt({ width, height, sample, rowGap = 10, barHeight = 4, cell = 6, className, style }: DashArtProps) {
    let path = "";

    for (let y = 0; y + barHeight <= height; y += rowGap) {
        // the start of a run of solid cells, drawn as one bar once the run ends
        let runStart = -1;

        const flush = (end: number) => {
            if (runStart >= 0) path += `M${runStart} ${y}h${end - runStart}v${barHeight}h${runStart - end}z`;
            runStart = -1;
        };

        for (let x = 0; x < width; x += cell) {
            const value = sample(x + cell / 2, y + barHeight / 2);

            if (value >= 0.85) {
                if (runStart < 0) runStart = x;
                continue;
            }

            flush(x);

            if (value > 0.06) {
                // lighter cells: a dash that shrinks with the value, always leaving a gap
                const length = Math.max(1.5, cell * value - 1);
                path += `M${x} ${y}h${length}v${barHeight}h${-length}z`;
            }
        }

        flush(Math.min(width, Math.ceil(width / cell) * cell));
    }

    return (
        <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} style={style}>
            <path d={path} fill="currentColor" />
        </svg>
    );
}

interface Tower {
    /** left edge and width, in px */
    x: number;
    width: number;
    /** height as a share of the artwork's height (0 to 1) */
    height: number;
}

// A skyline of towers, like a bar chart climbing up: solid towers with rows of lighter
// "windows", a few loose dashes floating just above the roofline, and nothing else
export function skyline(towers: Tower[], areaHeight: number): Sampler {
    return (x, y) => {
        const tower = towers.find((t) => x >= t.x && x < t.x + t.width);
        if (!tower) return 0;

        const roof = areaHeight * (1 - tower.height);
        const depth = y - roof;

        // a little scatter above the roof, thinning out as it rises
        if (depth < 0) {
            return depth > -40 && noise(x, y) > 0.72 + (-depth / 40) * 0.25 ? 0.45 : 0;
        }

        // window rows: every third row breaks into a run of lit gaps along the tower
        const row = Math.floor(y / 10);
        if (row % 3 === 1 && depth > 20) return (x - tower.x) % 18 < 12 ? 0.95 : 0.35;

        // the rest is mostly solid, broken here and there into shorter dashes so it
        // reads as printed rather than as a flat block
        const grain = noise(x, y);
        return grain < 0.18 ? 0.35 + grain * 2 : 0.95;
    };
}

const POLYGONS = {
    bolt: [[0.62, 0], [0.18, 0.55], [0.42, 0.55], [0.32, 1], [0.82, 0.42], [0.56, 0.42]],
    shield: [[0.5, 0], [0.92, 0.14], [0.92, 0.5], [0.5, 1], [0.08, 0.5], [0.08, 0.14]],
    diamond: [[0.25, 0.08], [0.75, 0.08], [1, 0.36], [0.5, 1], [0, 0.36]],
    arrow: [[0.5, 0], [1, 0.5], [0.68, 0.5], [0.68, 1], [0.32, 1], [0.32, 0.5], [0, 0.5]],
    hexagon: [[0.25, 0.05], [0.75, 0.05], [1, 0.5], [0.75, 0.95], [0.25, 0.95], [0, 0.5]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type ShapeName = keyof typeof POLYGONS | "target";

function inPolygon(x: number, y: number, polygon: readonly (readonly [number, number])[]) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function inShape(shape: ShapeName, u: number, v: number) {
    if (shape === "target") {
        const distance = Math.hypot(u - 0.5, v - 0.5);
        return distance < 0.5 && (distance > 0.34 || distance < 0.16);
    }
    return inPolygon(u, v, POLYGONS[shape]);
}

// An icon drawn in bars, shaded like it's lit from the left: solid on the left side,
// breaking into shorter dashes toward the right, with a lighter band every few rows
export function iconArt(shape: ShapeName, size: number): Sampler {
    return (x, y) => {
        const u = x / size;
        const v = y / size;
        if (!inShape(shape, u, v)) return 0;

        const band = Math.floor(y / 6) % 4 === 2 ? 0.35 : 0;
        const shade = 0.98 - Math.max(0, u - 0.5) * 1.2 - band;
        return noise(x, y) < 0.05 ? 0.3 : Math.max(0.15, shade);
    };
}

// A landscape of soft blobs (like continents), for the big background pieces
export function blobs(spots: { x: number; y: number; rx: number; ry: number }[]): Sampler {
    return (x, y) => {
        // a coarse wobble on the outline, so the edges look ragged rather than drawn
        // with a compass
        const wobble = (noise(Math.floor(x / 18), Math.floor(y / 10) + 7) - 0.5) * 0.7;

        let strength = 0;
        for (const spot of spots) {
            const d = ((x - spot.x) / spot.rx) ** 2 + ((y - spot.y) / spot.ry) ** 2;
            strength = Math.max(strength, 1 - d + wobble);
        }
        if (strength <= 0) return 0;

        // the middle is mostly solid, the edges break into short dashes and gaps
        const grain = noise(x, y);
        if (grain < 0.12) return 0;
        return strength > 0.45 && grain > 0.3 ? 0.95 : Math.min(0.8, strength * 1.6);
    };
}
