// Twenty's recurring section marker: a short blue dash, then a plain-case
// label — never a tracked-out ALL-CAPS eyebrow.
export function Eyebrow({ children }: { children: React.ReactNode }) {
    return (
        <p className="flex items-center gap-2 font-(family-name:--font-host-grotesk) text-[15px] text-muted">
            <span className="h-0.75 w-4 rounded-full bg-[#4F46E5]" />
            {children}
        </p>
    );
}

// Serif display heading. Callers wrap specific phrases in a <span
// className="font-light"> for the weight-contrast emphasis the reference
// site uses instead of color or italics.
export function Heading({
    as: Tag = "h2",
    children,
    className = "",
}: {
    as?: "h1" | "h2";
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <Tag className={`font-(family-name:--font-aleo) font-normal tracking-tight text-[#1c1c1c] ${className}`}>
            {children}
        </Tag>
    );
}
