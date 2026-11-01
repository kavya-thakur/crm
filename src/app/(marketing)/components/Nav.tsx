"use client";

import { useRef } from "react";
import Link from "next/link";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { IconBolt } from "@tabler/icons-react";

export function Nav({ loggedIn, primaryHref, primaryLabel }: { loggedIn: boolean; primaryHref: string; primaryLabel: string }) {
    const navRef = useRef<HTMLElement>(null);

    // Direct DOM class toggle via ScrollTrigger — the nav gains a hairline and
    // solid background once the hero scrolls past it, no React re-render involved.
    useGSAP(() => {
        ScrollTrigger.create({
            start: "80px top",
            onToggle: ({ isActive }) => navRef.current?.classList.toggle("is-scrolled", isActive),
        });
    }, []);

    return (
        <nav
            ref={navRef}
            className="fixed inset-x-0 top-0 z-30 border-b border-transparent transition-colors duration-200 [&.is-scrolled]:border-line [&.is-scrolled]:bg-white/90 [&.is-scrolled]:backdrop-blur-md"
        >
            <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
                <Link href="/" className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-[#1c1c1c] text-white">
                        <IconBolt size={16} />
                    </span>
                </Link>

                <div className="hidden items-center gap-0 font-(family-name:--font-azeret-mono) text-xs font-medium tracking-wide text-[#1c1c1c] uppercase md:flex">
                    <a href="#product" className="px-4 hover:text-[#4F46E5]">Product</a>
                    <span className="text-line">|</span>
                    <a href="#how-it-works" className="px-4 hover:text-[#4F46E5]">How it works</a>
                    <span className="text-line">|</span>
                    <a href="#pricing" className="px-4 hover:text-[#4F46E5]">Pricing</a>
                </div>

                <div className="ml-auto flex items-center gap-3 font-(family-name:--font-azeret-mono) text-xs font-medium tracking-wide uppercase">
                    {!loggedIn && (
                        <Link
                            href="/login"
                            className="flex h-9 items-center rounded-lg border border-[#1c1c1c] px-4 text-[#1c1c1c] hover:bg-paper"
                        >
                            Log in
                        </Link>
                    )}
                    <Link
                        href={primaryHref}
                        className="flex h-9 items-center rounded-lg bg-[#1c1c1c] px-4 text-white hover:bg-black"
                    >
                        {primaryLabel}
                    </Link>
                </div>
            </div>
        </nav>
    );
}
