// Flash's mark: three forward-leaning bars on a rounded tile, which read as an F, as
// speed lines and as a rising chart. The same drawing is the favicon (src/app/icon.svg).
// "dark" is for dark backgrounds: a white tile with violet bars.
export function LogoMark({ size = 32, dark = false, className = "" }: { size?: number; dark?: boolean; className?: string }) {
    return (
        <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" className={`shrink-0 ${className}`}>
            <rect width="64" height="64" rx="16" fill={dark ? "#ffffff" : "#1c1c1c"} />
            <path d="M20 15 H50 L47 24 H17 Z" fill={dark ? "#4a38f5" : "#8f84ff"} />
            <path d="M17 28 H40 L37 37 H14 Z" fill={dark ? "#4a38f5" : "#b3abff"} />
            <path d="M14 41 H26 L23 50 H11 Z" fill={dark ? "#4a38f5" : "#ffffff"} />
        </svg>
    );
}
