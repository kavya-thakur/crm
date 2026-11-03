"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import gsap from "gsap";
import { IconArrowRight } from "@tabler/icons-react";

interface ButtonProps {
    href: string;
    children: ReactNode;
    variant?: "filled" | "outlined";
    size?: "regular" | "small";
    /** "dark" is for buttons placed on the near-black sections */
    scheme?: "light" | "dark";
    className?: string;
}

// The marketing site's button: a pill. The filled one carries a violet arrow chip that
// nudges forward on hover. Both lean a little toward the pointer and spring back.
export function Button({ href, children, variant = "filled", size = "regular", scheme = "light", className = "" }: ButtonProps) {
    const ref = useRef<HTMLAnchorElement>(null);

    function onMove(event: PointerEvent) {
        const rect = ref.current!.getBoundingClientRect();
        gsap.to(ref.current, {
            x: (event.clientX - rect.left - rect.width / 2) * 0.2,
            y: (event.clientY - rect.top - rect.height / 2) * 0.3,
            duration: 0.3,
            ease: "power2.out",
        });
    }

    function onLeave() {
        gsap.to(ref.current, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
    }

    const look =
        variant === "filled"
            ? scheme === "dark"
                ? "bg-white text-[#1c1c1c] hover:bg-[#ececec]"
                : "bg-[#1c1c1c] text-white hover:bg-[#333333]"
            : scheme === "dark"
              ? "border border-white/25 text-white hover:bg-white/10"
              : "border border-[#1c1c1c]/15 bg-white text-[#1c1c1c] hover:bg-[#f4f4f4]";

    const height = size === "small" ? "h-9 text-[13px]" : "h-11 text-[15px]";
    const padding = variant === "filled" ? (size === "small" ? "pr-1 pl-4" : "pr-1.5 pl-5") : size === "small" ? "px-4" : "px-5";

    // API routes get a plain <a>: Link fetches its target ahead of time, which on /api/auth/demo
    // would sign the visitor in before they click
    const Tag = href.startsWith("/api/") ? "a" : Link;

    return (
        <Tag
            ref={ref}
            href={href}
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            className={`group inline-flex items-center gap-3 rounded-full font-(family-name:--font-host-grotesk) font-medium tracking-[-0.01em] whitespace-nowrap transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#4a38f5] ${height} ${padding} ${look} ${className}`}
        >
            {children}
            {variant === "filled" && (
                <span
                    aria-hidden
                    className={`flex items-center justify-center overflow-hidden rounded-full bg-[#4a38f5] text-white ${size === "small" ? "size-7" : "size-8"}`}
                >
                    <IconArrowRight size={size === "small" ? 14 : 16} className="transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-rotate-45" />
                </span>
            )}
        </Tag>
    );
}
