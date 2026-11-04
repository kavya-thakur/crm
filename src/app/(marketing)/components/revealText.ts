import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

// The marketing pages' text animations, for everything inside the current useGSAP scope that's
// marked data-heading, data-eyebrow-bar or data-lead (Heading, Eyebrow and Lead add these).
export function revealText() {
    // Below the hero, each heading's words rise out of their lines when it comes into view.
    // They play on their own clock (not tied to the scroll), so every word gets the whole
    // soft motion however fast you scroll; scrolling back above a heading resets it, so it
    // plays again next time. The lines are split again whenever they change (a resize, the
    // fonts arriving), so the words always fit their lines.
    const onEnter = (trigger: Element) => ({ trigger, start: "top 85%", toggleActions: "play none none reverse" });
    gsap.utils.toArray<HTMLElement>("[data-heading]").forEach((heading) => {
        SplitText.create(heading, {
            type: "lines,words",
            mask: "lines",
            autoSplit: true,
            onSplit: (split) => {
                // a little room below each line, so the hidden edge doesn't clip a "g" or a "y"
                gsap.set(split.masks, { paddingBottom: "0.12em", marginBottom: "-0.12em" });
                // each word tips up from a slight lean as it rises and fades in, one after another
                return gsap.from(split.words, {
                    yPercent: 120,
                    rotate: 5,
                    opacity: 0,
                    transformOrigin: "0% 100%",
                    duration: 1.4,
                    ease: "expo.out",
                    stagger: 0.07,
                    scrollTrigger: onEnter(heading),
                });
            },
        });
    });
    // the eyebrow's blue bar draws in, and the text under a heading fades up just after its words
    gsap.utils.toArray<HTMLElement>("[data-eyebrow-bar]").forEach((bar) =>
        gsap.from(bar, { scaleX: 0, transformOrigin: "0% 50%", duration: 1, ease: "expo.out", scrollTrigger: onEnter(bar) }),
    );
    gsap.utils.toArray<HTMLElement>("[data-lead]").forEach((lead) =>
        gsap.from(lead, { opacity: 0, y: 28, duration: 1.4, delay: 0.25, ease: "expo.out", scrollTrigger: onEnter(lead) }),
    );
}
