"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Smooth scrolling for the marketing pages: a mouse wheel normally jumps the page ~100px a
// notch, which makes every scroll-linked animation jump too. Lenis eases the page toward
// where the wheel points instead. It runs on GSAP's clock and tells ScrollTrigger about every
// move, so the scroll animations follow the glide frame by frame. Native scrolling is kept
// (sticky elements still work); people who turn off animations get normal scrolling.
export function SmoothScroll() {
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const lenis = new Lenis({ lerp: 0.09, anchors: { offset: -64 } });
        lenis.on("scroll", ScrollTrigger.update);
        const tick = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);

        return () => {
            gsap.ticker.remove(tick);
            lenis.destroy();
        };
    }, []);

    return null;
}
