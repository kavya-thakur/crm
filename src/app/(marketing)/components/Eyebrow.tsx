import type { ReactNode } from "react";

// The page's content width: 1512px at most, 40px gutters on desktop and 16px on phones
export const CONTAINER = "mx-auto w-full max-w-378 px-4 min-[921px]:px-10";

// Twenty's section marker: a short blue bar, then a plain sentence-case label
export function Eyebrow({ children, dark = false, className = "" }: { children: ReactNode; dark?: boolean; className?: string }) {
    return (
        <p
            className={`flex items-center gap-2 font-(family-name:--font-host-grotesk) text-[18px] leading-6 font-medium tracking-[-0.04em] ${dark ? "text-white/60" : "text-[#1c1c1c]/60"} ${className}`}
        >
            <span data-eyebrow-bar aria-hidden className="h-1.5 w-3.5 shrink-0 bg-[#4a38f5]" />
            {children}
        </p>
    );
}

// The three heading sizes twenty.com uses, growing smoothly with the window width
const SIZES = {
    md: "text-[clamp(2.5rem,2.1328rem+1.5066vw,3rem)] leading-[clamp(2.875rem,2.416rem+1.8832vw,3.5rem)]",
    lg: "text-[clamp(2.5rem,1.5819rem+3.7665vw,3.75rem)] leading-[clamp(2.875rem,1.9569rem+3.7665vw,4.125rem)]",
    xl: "text-[clamp(3.75rem,2.8319rem+3.7665vw,5rem)] leading-[clamp(4.125rem,3.2069rem+3.7665vw,5.375rem)]",
};

// A light serif heading. Wrap the words that should stand out in <Accent>. (data-heading lets
// the landing page find it to animate its words in as you scroll.)
export function Heading({
    as: Tag = "h2",
    size = "lg",
    dark = false,
    className = "",
    children,
}: {
    as?: "h1" | "h2" | "h3";
    size?: keyof typeof SIZES;
    dark?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Tag data-heading className={`font-(family-name:--font-aleo) font-light tracking-[-0.02em] text-balance ${dark ? "text-white" : "text-[#1c1c1c]"} ${SIZES[size]} ${className}`}>
            {children}
        </Tag>
    );
}

// The part of a heading that switches from the serif to the sans face, which is how
// twenty.com adds emphasis instead of bold or colour
export function Accent({ children }: { children: ReactNode }) {
    return <span className="font-(family-name:--font-host-grotesk) tracking-[-0.04em]">{children}</span>;
}

// Body copy under a heading
export function Lead({ children, dark = false, className = "" }: { children: ReactNode; dark?: boolean; className?: string }) {
    return (
        <p data-lead className={`font-(family-name:--font-host-grotesk) text-[16px] leading-[1.55] ${dark ? "text-white/60" : "text-[#1c1c1c]/60"} ${className}`}>
            {children}
        </p>
    );
}

// The small blue "+" that marks where two guide lines cross
export function PlusMark({ className = "" }: { className?: string }) {
    return (
        <svg aria-hidden width="11" height="11" viewBox="0 0 11 11" className={`absolute text-[#4a38f5] ${className}`}>
            <path d="M5.5 0v11M0 5.5h11" stroke="currentColor" strokeWidth="1" />
        </svg>
    );
}
