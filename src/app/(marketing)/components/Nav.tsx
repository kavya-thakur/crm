"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconBolt } from "@tabler/icons-react";

import { Button } from "./Button";

const LINKS = [
    { href: "#product", label: "Product" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#pricing", label: "Pricing" },
];

// Thin vertical rule between two links
function Divider() {
    return <span aria-hidden className="h-2.5 w-px shrink-0 bg-current opacity-40" />;
}

export function Nav({ loggedIn, primaryHref, primaryLabel }: { loggedIn: boolean; primaryHref: string; primaryLabel: string }) {
    // Two looks besides the resting one: white with a hairline once the page has scrolled
    // (the resting grey matches the hero), and dark over the dark sections at the end of
    // the page, like twenty.com's bar. React skips the re-render when nothing changed.
    const [scrolled, setScrolled] = useState(false);
    const [dark, setDark] = useState(false);

    useEffect(() => {
        const firstDark = document.querySelector("[data-scheme=dark]");

        function update() {
            setScrolled(window.scrollY > 80);
            setDark(firstDark !== null && firstDark.getBoundingClientRect().top <= 64);
        }

        update();
        window.addEventListener("scroll", update, { passive: true });
        return () => window.removeEventListener("scroll", update);
    }, []);

    return (
        <header
            className={`sticky top-0 z-200 w-full transition-[background-color,box-shadow,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                dark
                    ? "bg-[#1c1c1c] text-white"
                    : scrolled
                      ? "bg-white text-[#1c1c1c] shadow-[0_1px_0_rgb(28_28_28/0.1)]"
                      : "bg-[#f4f4f4] text-[#1c1c1c]"
            }`}
        >
            <div className="mx-auto flex min-h-16 w-full max-w-378 items-center justify-between gap-5 px-4 min-[921px]:px-10">
                <Link href="/" aria-label="Flash home" className="flex shrink-0 items-center">
                    <span className={`flex size-10 items-center justify-center rounded-sm transition-colors duration-300 ${dark ? "bg-white text-[#1c1c1c]" : "bg-[#1c1c1c] text-white"}`}>
                        <IconBolt size={20} />
                    </span>
                </Link>

                <nav aria-label="Main" className="hidden items-center gap-x-8 min-[921px]:flex">
                    {LINKS.map((link, index) => (
                        <div key={link.href} className="flex items-center gap-x-8">
                            {index > 0 && <Divider />}
                            <a
                                href={link.href}
                                className="font-(family-name:--font-azeret-mono) text-[12px] font-medium uppercase transition-colors duration-200 hover:text-[#4a38f5]"
                            >
                                {link.label}
                            </a>
                        </div>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    {!loggedIn && (
                        <span className="hidden min-[921px]:inline-flex">
                            <Button href="/login" variant="outlined" size="small" scheme={dark ? "dark" : "light"}>
                                Log in
                            </Button>
                        </span>
                    )}
                    <Button href={primaryHref} size="small" scheme={dark ? "dark" : "light"}>
                        {primaryLabel}
                    </Button>
                </div>
            </div>
        </header>
    );
}
