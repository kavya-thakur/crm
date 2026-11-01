import Link from "next/link";
import { IconBolt, IconBrandDiscord, IconBrandGithub, IconBrandLinkedin, IconBrandX, IconPlus } from "@tabler/icons-react";

const COLUMNS = [
    { title: "Sitemap", links: ["Product", "Pricing", "Notes"] },
    { title: "Help", links: ["Documentation", "Release notes"] },
    { title: "Legal", links: ["Privacy policy", "Terms of service"] },
];

export function Footer() {
    return (
        <footer className="bg-white py-14">
            <div className="mx-auto max-w-5xl px-6">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#1c1c1c] text-white">
                    <IconBolt size={16} />
                </span>

                <div className="relative mt-10 grid gap-10 border-t border-dashed border-line pt-10 sm:grid-cols-4">
                    <PlusMark className="-top-[9px] -left-[9px]" />
                    {COLUMNS.map((column) => (
                        <div key={column.title} className="relative border-l border-dashed border-line pl-6 first:border-l-0 first:pl-0 sm:first:pl-6 sm:first:border-l">
                            <PlusMark className="-top-[19px] -left-[9px] hidden sm:flex" />
                            <p className="text-[14px] font-medium text-[#1c1c1c]">{column.title}</p>
                            <ul className="mt-3 flex flex-col gap-2">
                                {column.links.map((link) => (
                                    <li key={link}>
                                        <a href="#" className="text-[14px] text-muted hover:text-[#1c1c1c]">{link}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    <div className="relative border-l border-dashed border-line pl-6">
                        <PlusMark className="-top-[19px] -left-[9px] hidden sm:flex" />
                        <p className="text-[14px] font-medium text-[#1c1c1c]">Connect</p>
                        <div className="mt-3 flex items-center gap-3 text-muted">
                            <IconBrandGithub size={16} />
                            <IconBrandDiscord size={16} />
                            <IconBrandLinkedin size={16} />
                            <IconBrandX size={16} />
                        </div>
                    </div>
                </div>

                <div className="mt-10 flex items-center justify-between border-t border-line pt-6 text-[13px] text-light">
                    <span>© {new Date().getFullYear()} — Flash</span>
                    <Link href="/login" className="hover:text-muted">Log in</Link>
                </div>
            </div>
        </footer>
    );
}

// The small "+" marks at grid intersections are a recurring Twenty detail.
function PlusMark({ className = "" }: { className?: string }) {
    return (
        <span className={`absolute flex size-[18px] items-center justify-center text-light ${className}`}>
            <IconPlus size={12} />
        </span>
    );
}
