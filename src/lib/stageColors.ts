// A curated, premium-feeling palette for stage colors (Lead Stages, Pipeline
// Stages) — one place so every color picker offers the same set, and the
// default stages below pick straight from it instead of duplicating hex values.
export const STAGE_COLORS = {
    red: "#E05252",
    orange: "#EA580C",
    amber: "#CA8A04",
    lime: "#65A30D",
    emerald: "#059669",
    teal: "#0D9488",
    sky: "#0284C7",
    indigo: "#4F46E5",
    purple: "#9333EA",
    pink: "#DB2777",
    rose: "#BE123C",
    slate: "#475569",
} as const;

export const STAGE_COLOR_PALETTE = Object.entries(STAGE_COLORS).map(([name, hex]) => ({ name, hex }));
