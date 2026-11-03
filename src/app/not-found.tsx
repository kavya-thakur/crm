import Link from "next/link";
import { Aleo } from "next/font/google";

import { LogoMark } from "@/components/Logo";
import { Accent, Eyebrow, Heading, Lead } from "./(marketing)/components/Eyebrow";
import { Button } from "./(marketing)/components/Button";

const aleo = Aleo({ variable: "--font-aleo", weight: ["300"], subsets: ["latin"] });

// Any address that doesn't exist, in the landing page's look: a huge faint "404" behind
// a serif heading and the site's pill buttons
export default function NotFound() {
    return (
        <div className={`${aleo.variable} flex min-h-screen flex-col bg-[#f4f4f4] px-6 py-6 font-(family-name:--font-host-grotesk) text-[#1c1c1c] min-[921px]:px-10`}>
            <Link href="/" aria-label="Flash home" className="inline-flex items-center gap-2.5 self-start">
                <LogoMark size={30} />
                <span className="text-[19px] font-semibold tracking-[-0.045em]">Flash</span>
            </Link>

            <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden py-16 text-center">
                <span
                    aria-hidden
                    className="pointer-events-none absolute font-(family-name:--font-aleo) text-[clamp(12rem,8rem+22vw,30rem)] leading-none font-light tracking-[-0.06em] text-[#1c1c1c]/[0.04] select-none"
                >
                    404
                </span>

                <div className="relative flex flex-col items-center animate-[fade-in_0.4s_ease-out]">
                    <Eyebrow>Page not found</Eyebrow>
                    <Heading as="h1" className="mt-6 max-w-160">
                        This page took a <Accent>wrong turn</Accent>
                    </Heading>
                    <Lead className="mt-5 max-w-110 text-balance">The link may be broken, or the page may have moved. Everything else is right where you left it.</Lead>

                    <div className="mt-10 flex flex-wrap justify-center gap-3">
                        <Button href="/">Back to home</Button>
                        <Button href="/dashboard" variant="outlined">
                            Go to your workspace
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    );
}
