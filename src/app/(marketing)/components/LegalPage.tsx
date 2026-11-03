import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { Eyebrow, Heading } from "./Eyebrow";

// Privacy and Terms: the title on grey (it meets the grey nav), then a narrow column of
// plain text. The [&_h2] classes style the headings, paragraphs and lists the pages write.
const COLUMN = "mx-auto w-full max-w-190 px-4 min-[921px]:px-10";

export async function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
    const user = await getCurrentUser();

    return (
        <div className="bg-white text-[#1c1c1c]">
            <Nav loggedIn={!!user} primaryHref={user ? "/dashboard" : "/register"} primaryLabel={user ? "Go to your workspace" : "Get started"} />

            <main className="font-(family-name:--font-host-grotesk)">
                <header className="bg-[#f4f4f4] pt-20 pb-16">
                    <div className={COLUMN}>
                        <Eyebrow>Legal</Eyebrow>
                        <Heading as="h1" size="md" className="mt-6">
                            {title}
                        </Heading>
                        <p className="mt-4 text-[15px] text-[#1c1c1c]/50">Last updated {updated}</p>
                    </div>
                </header>

                <article
                    className={`${COLUMN} pt-6 pb-30 text-[16px] leading-[1.7] text-[#1c1c1c]/70 [&_a]:text-[#4a38f5] [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-12 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.03em] [&_h2]:text-[#1c1c1c] [&_li]:mt-2 [&_p]:mt-4 [&_strong]:font-medium [&_strong]:text-[#1c1c1c] [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5`}
                >
                    {children}
                </article>
            </main>

            <Footer />
        </div>
    );
}
