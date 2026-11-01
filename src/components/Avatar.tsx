// Same name always gets the same colour, like Twenty's avatars
const AVATAR_COLORS = [
    "bg-[#edf2fe] text-[#3a5bc7]",
    "bg-[#e6f6eb] text-[#00824d]",
    "bg-[#f7edfd] text-[#8145b5]",
    "bg-[#ffefd6] text-[#d14e00]",
    "bg-[#fee9f6] text-[#c2298a]",
    "bg-[#e0f8f3] text-[#00826d]",
    "bg-[#e1f6fd] text-[#00749e]",
];

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
    const color = AVATAR_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${color}
                ${size === "lg" ? "size-10 text-lg" : size === "md" ? "size-7 text-sm" : "size-4 text-[10px]"}`}
        >
            {name[0]?.toUpperCase()}
        </span>
    );
}
