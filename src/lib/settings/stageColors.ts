// The colours a stage or a source can have, named and ordered like twenty.com's colour
// menu. Each is the deep "text" shade of its colour family (Radix step 11): badges use it
// for the label on a soft wash of the same colour, so every one stays easy to read.
// One place so every picker offers the same set and the defaults pick from it.
export const STAGE_COLORS = {
    red: "#ce2c31",
    ruby: "#ca244d",
    crimson: "#cb1d63",
    tomato: "#d13415",
    orange: "#cc4e00",
    amber: "#ab6400",
    yellow: "#9e6c00",
    lime: "#5c7c2f",
    grass: "#2a7e3b",
    green: "#218358",
    jade: "#208368",
    mint: "#027864",
    turquoise: "#0d7d74",
    cyan: "#107d98",
    sky: "#00749e",
    blue: "#0d74ce",
    iris: "#5753c6",
    violet: "#6550b9",
    purple: "#8145b5",
    plum: "#953ea3",
    pink: "#c2298a",
    bronze: "#7d5e54",
    gold: "#71624b",
    brown: "#815e46",
    gray: "#646464",
} as const;

export const STAGE_COLOR_PALETTE = Object.entries(STAGE_COLORS).map(([name, hex]) => ({ name, hex }));
