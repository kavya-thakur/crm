import Link from "next/link";
import { IconBolt } from "@tabler/icons-react";

import { CutButton } from "./CutButton";
import { PlusMark } from "./Eyebrow";
import { DashArt, blobs } from "./DashArt";

const COLUMNS = [
    {
        title: "Sitemap",
        links: [
            { label: "Home", href: "/" },
            { label: "Product", href: "#product" },
            { label: "How it works", href: "#how-it-works" },
            { label: "Pricing", href: "#pricing" },
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
            { label: "Privacy policy", href: "#" },
            { label: "Terms of service", href: "#" },
        ],
    },
];

const ART_WIDTH = 940;
const ART_HEIGHT = 300;

// A low, wide landscape in charcoal on the dark band above the footer card
const LAND = blobs([
    { x: 190, y: 120, rx: 190, ry: 110 },
    { x: 470, y: 150, rx: 210, ry: 130 },
    { x: 760, y: 110, rx: 190, ry: 100 },
    { x: 330, y: 240, rx: 160, ry: 60 },
    { x: 640, y: 250, rx: 170, ry: 60 },
]);

// The card's top edge dips in the middle, letting the artwork above show through
const NOTCH = "polygon(0 0, 25.7% 0, 30.1% 19px, 69.9% 19px, 74.3% 0, 100% 0, 100% 100%, 0 100%)";

const LINK = "font-(family-name:--font-host-grotesk) text-[16px] text-[#1c1c1c] transition-colors duration-200 hover:text-[#4a38f5]";

export function Footer({ primaryHref, primaryLabel }: { primaryHref: string; primaryLabel: string }) {
    return (
        <footer data-scheme="dark" className="bg-[#1c1c1c] pb-10">
            <div aria-hidden className="flex justify-center overflow-hidden pt-20">
                <DashArt width={ART_WIDTH} height={ART_HEIGHT} sample={LAND} className="max-w-full shrink-0 text-[#333333]" />
            </div>

            <div className="mx-4 -mt-5 bg-white min-[921px]:mx-10" style={{ clipPath: NOTCH }}>
                <div className="px-6 pt-20 pb-16 min-[921px]:px-20">
                    <Link href="/" aria-label="Flash home" className="flex size-10 items-center justify-center rounded-sm bg-[#1c1c1c] text-white">
                        <IconBolt size={20} />
                    </Link>

                    <div className="mt-16 grid gap-10 min-[921px]:grid-cols-4 min-[921px]:gap-0">
                        {COLUMNS.map((column) => (
                            // a thin rule down the right of each column, with a blue cross at both ends
                            <div key={column.title} className="relative min-[921px]:border-r min-[921px]:border-[#1c1c1c]/10 min-[921px]:pr-8 min-[921px]:not-first:pl-8">
                                <PlusMark className="-top-1.5 -right-1.5 hidden min-[921px]:block" />
                                <PlusMark className="-right-1.5 -bottom-1.5 hidden min-[921px]:block" />
                                <p className="font-(family-name:--font-host-grotesk) text-[16px] font-medium text-[#1c1c1c]">{column.title}</p>
                                <ul className="mt-2 flex flex-col gap-2 pb-6">
                                    {column.links.map((link) => (
                                        <li key={link.label}>
                                            <Link href={link.href} className={LINK}>
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}

                        <div className="min-[921px]:pl-8">
                            <p className="font-(family-name:--font-host-grotesk) text-[16px] font-medium text-[#1c1c1c]">Get going</p>
                            <div className="mt-6 flex flex-col items-start gap-2">
                                <CutButton href={primaryHref}>{primaryLabel}</CutButton>
                                <CutButton href="/login" variant="outlined">
                                    Log in
                                </CutButton>
                            </div>
                        </div>
                    </div>

                    <p className="mt-12 font-(family-name:--font-azeret-mono) text-[12px] text-[#1c1c1c] uppercase">© {new Date().getFullYear()} – Flash</p>
                </div>
            </div>
        </footer>
    );
}
