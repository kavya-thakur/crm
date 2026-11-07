"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconMenu2, IconX } from "@tabler/icons-react";

import { LogoMark } from "@/components/Logo";
import { Button } from "./Button";

const LINKS = [
    { href: "/product", label: "Product" },
    { href: "/pricing", label: "Pricing" },
    { href: "/demo", label: "Book a demo" },
];

// Thin vertical rule between two links
function Divider() {
    return <span aria-hidden className="h-2.5 w-px shrink-0 bg-current opacity-40" />;
}

// `resting` is the bar's colour before any scrolling: it matches the hero under it (grey on most
// pages, white on the product page)
export function Nav({ loggedIn, primaryHref, primaryLabel, resting = "grey" }: { loggedIn: boolean; primaryHref: string; primaryLabel: string; resting?: "grey" | "white" }) {
    // Two looks besides the resting one: white with a hairline once the page has scrolled
    // (the resting grey matches the hero), and dark over any dark section (the product
    // page's hero, the FAQ and footer), like twenty.com's bar. React skips the re-render when nothing changed.
    const [scrolled, setScrolled] = useState(false);
    const [dark, setDark] = useState(false);
    // the phone menu, below 921px where the links don't fit in the bar
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const darkSections = [...document.querySelectorAll("[data-scheme=dark]")];

        function update() {
            setScrolled(window.scrollY > 80);
            // dark while one of the dark sections is under the bar (its 64px line)
            setDark(darkSections.some((section) => {
                const { top, bottom } = section.getBoundingClientRect();
                return top <= 64 && bottom > 64;
            }));
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
                      : `${resting === "white" ? "bg-white" : "bg-[#f4f4f4]"} text-[#1c1c1c]`
            }`}
        >
            <div className="mx-auto flex min-h-16 w-full max-w-378 items-center justify-between gap-5 px-4 min-[921px]:px-10">
                <Link href="/" aria-label="Flash home" className="flex shrink-0 items-center gap-2.5">
                    <LogoMark size={34} dark={dark} />
                    <span className="font-(family-name:--font-host-grotesk) text-[21px] font-semibold tracking-[-0.045em]">Flash</span>
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
                    <button
                        type="button"
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                        onClick={() => setOpen(!open)}
                        className="grid size-9 place-items-center min-[921px]:hidden"
                    >
                        {open ? <IconX size={22} /> : <IconMenu2 size={22} />}
                    </button>
                </div>
            </div>

            {/* the phone menu drops down from under the bar */}
            <nav
                aria-label="Menu"
                inert={!open}
                className={`absolute inset-x-0 top-full flex flex-col gap-1 px-4 pt-2 pb-5 shadow-[0_12px_24px_-12px_rgb(28_28_28/0.25)] transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] min-[921px]:hidden ${
                    dark ? "bg-[#1c1c1c]" : "bg-white"
                } ${open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
            >
                {[...LINKS, ...(loggedIn ? [] : [{ href: "/login", label: "Log in" }])].map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="border-b border-current/10 py-3.5 font-(family-name:--font-azeret-mono) text-[13px] font-medium uppercase transition-colors duration-200 hover:text-[#4a38f5]"
                    >
                        {link.label}
                    </a>
                ))}
            </nav>
        </header>
    );
}
