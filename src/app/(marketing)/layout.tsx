import { Aleo } from "next/font/google";

import { SmoothScroll } from "./components/SmoothScroll";

// twenty.com's marketing site runs on Aleo (serif display) + Host Grotesk (body)
// + Azeret Mono (nav/buttons) — the app itself already loads the latter two.
const aleo = Aleo({
    variable: "--font-aleo",
    weight: ["300", "400", "700"],
    subsets: ["latin"],
});

export default function MarketingLayout({ children }: LayoutProps<"/">) {
    return (
        <div className={aleo.variable}>
            <SmoothScroll />
            {children}
        </div>
    );
}
