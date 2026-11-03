import Link from "next/link";
import { LogoMark } from "@/components/Logo";

import { CONTAINER } from "./Eyebrow";

const COLUMNS = [
    {
        title: "Product",
        links: [
            { label: "Overview", href: "/product" },
            { label: "Leads", href: "/product#leads" },
            { label: "Deals", href: "/product#deals" },
            { label: "Follow-ups", href: "/product#follow-ups" },
            { label: "Everything else", href: "/product#more" },
        ],
    },
    {
        title: "Explore",
        links: [
            { label: "How it works", href: "/#how-it-works" },
            { label: "Book a demo", href: "/demo" },
            { label: "Pricing", href: "/pricing" },
            { label: "FAQ", href: "/#faq" },
        ],
    },
    {
        title: "Account",
        links: [
            { label: "Log in", href: "/login" },
            { label: "Create a workspace", href: "/register" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Privacy policy", href: "/privacy" },
            { label: "Terms of service", href: "/terms" },
        ],
    },
];

// Attio-style: the mark on the left, link groups flowing in columns on the right,
// and a quiet bottom bar
export function Footer() {
    return (
        <footer data-scheme="dark" className="bg-[#1c1c1c] font-(family-name:--font-host-grotesk)">
            <div className={`${CONTAINER} grid gap-12 pt-20 pb-12 min-[921px]:grid-cols-[1fr_2fr]`}>
                <div>
                    <Link href="/" aria-label="Flash home" className="inline-flex items-center gap-2.5 text-white">
                        <LogoMark size={36} dark />
                        <span className="text-[21px] font-semibold tracking-[-0.045em]">Flash</span>
                    </Link>
                    <p className="mt-4 max-w-70 text-[14px] leading-[1.55] text-white/45">The CRM that keeps up with how fast your team sells.</p>
                </div>

                <div className="columns-2 gap-8 min-[640px]:columns-4">
                    {COLUMNS.map((column) => (
                        <div key={column.title} className="break-inside-avoid pb-8">
                            <h2 className="py-1 text-[14px] text-white/40">{column.title}</h2>
                            <ul className="mt-1 flex flex-col">
                                {column.links.map((link) => (
                                    <li key={link.label}>
                                        <Link href={link.href} className="inline-block py-1 text-[14px] text-white/70 transition-colors duration-150 hover:text-white">
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-white/10">
                <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-4 py-8 text-[12px] text-white/40`}>
                    <p>© {new Date().getFullYear()} Flash. All rights reserved.</p>
                    <p>Made for teams who&apos;d rather be selling.</p>
                </div>
            </div>
        </footer>
    );
}
