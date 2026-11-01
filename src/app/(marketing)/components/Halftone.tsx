// Twenty's signature decoration is a dithered halftone illustration (a grid of
// dots, density fading toward one edge, clipped to a simple icon silhouette).
// This recreates that technique — deterministic (no Math.random, so server
// and client render identically), not a traced copy of their actual artwork.

function pointInPolygon(x: number, y: number, poly: readonly [number, number][]) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

const BOLT: [number, number][] = [
    [0.62, 0], [0.18, 0.55], [0.42, 0.55], [0.32, 1], [0.82, 0.42], [0.56, 0.42],
];
const SHIELD: [number, number][] = [
    [0.5, 0], [0.95, 0.15], [0.95, 0.52], [0.5, 1], [0.05, 0.52], [0.05, 0.15],
];

type Shape = "bolt" | "shield" | "diamond" | "target";

const CONTAINS: Record<Shape, (x: number, y: number) => boolean> = {
    bolt: (x, y) => pointInPolygon(x, y, BOLT),
    shield: (x, y) => pointInPolygon(x, y, SHIELD),
    diamond: (x, y) => Math.abs(x - 0.5) + Math.abs(y - 0.5) < 0.5,
    target: (x, y) => {
        const d = Math.hypot(x - 0.5, y - 0.5);
        return d < 0.5 && (d > 0.36 || d < 0.14);
    },
};

// fade: 1 = dense at top fading out toward the bottom (the hero/footer look),
// "even" = uniform density (the per-pillar icons)
export function Halftone({
    shape,
    size = 120,
    fade = "even",
    className,
}: {
    shape: Shape;
    size?: number;
    fade?: "top" | "even";
    className?: string;
}) {
    const cols = 26;
    const rows = 26;
    const contains = CONTAINS[shape];
    const dots: { x: number; y: number; r: number }[] = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = (col + 0.5) / cols;
            const y = (row + 0.5) / rows;
            if (!contains(x, y)) continue;

            const falloff = fade === "top" ? 1 - y * 0.7 : 1;
            // deterministic pseudo-jitter so dot size isn't perfectly uniform
            const jitter = ((row * 7 + col * 13) % 5) / 10;
            const r = (0.5 + jitter * 0.35) * falloff * (size / cols) * 0.5;
            if (r <= 0) continue;

            dots.push({ x: x * size, y: y * size, r });
        }
    }

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true">
            {dots.map((dot, i) => (
                <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill="currentColor" />
            ))}
        </svg>
    );
}
