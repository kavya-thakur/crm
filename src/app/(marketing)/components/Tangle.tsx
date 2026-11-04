"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// The problem section's picture: a heavy black knot (the usual CRM: everything tangled up in
// everything else), drawn in the site's halftone bars. As you scroll through the section it
// untangles into one clean violet ring, and the label under it changes to "Flash".
//
// The tube is built in the shader: every point knows how far along the tube it is (t) and where
// around it (angle). Its centre line is a mix of two curves, a knot that winds three times round
// and eight times through, and a plain circle, so `uMorph` slides one into the other.

const ALONG = 600;
const AROUND = 24;

const vertexShader = `
    uniform float uMorph;
    uniform float uTime;
    attribute vec2 aTube;
    varying vec3 vNormal;
    varying vec3 vPosition;
    const float TAU = 6.2831853;

    vec3 knot(float t) {
        float a = t * TAU;
        float r = 2.0 + 0.9 * cos(8.0 * a);
        // a slight drift, so the knot never sits quite still
        vec3 drift = 0.05 * vec3(sin(uTime * 0.7 + t * 40.0), cos(uTime * 0.9 + t * 31.0), 0.0);
        return vec3(r * cos(3.0 * a), r * sin(3.0 * a), 0.9 * sin(8.0 * a)) * 0.42 + drift;
    }
    vec3 ring(float t) {
        float a = t * TAU;
        return vec3(cos(a), sin(a), 0.0) * 1.2;
    }
    vec3 line(float t) {
        return mix(knot(t), ring(t), uMorph);
    }

    void main() {
        float t = aTube.x;
        vec3 centre = line(t);
        // which way the line runs here, and two directions square to it
        vec3 along = normalize(line(t + 0.001) - line(t - 0.001));
        vec3 side = normalize(cross(along, vec3(0.0, 0.0, 1.0)));
        vec3 up = cross(along, side);
        vec3 outward = cos(aTube.y) * side + sin(aTube.y) * up;
        // the strands of the knot are thin, so you can see how they cross; the ring is fuller
        vec3 position = centre + outward * mix(0.045, 0.13, uMorph);

        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vPosition = view.xyz;
        vNormal = normalize(normalMatrix * outward);
        gl_Position = projectionMatrix * view;
    }
`;

// The printed look (as in Halftone3D): solid bars where it's lit, shorter dashes as it darkens
const fragmentShader = `
    uniform vec3 uInk;
    uniform vec3 uViolet;
    uniform float uMorph;
    uniform float uRow;
    uniform vec3 uLight;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        vec3 normal = normalize(vNormal);
        float diffuse = max(dot(normal, normalize(uLight - vPosition)), 0.0);
        float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 2.0);
        float tone = clamp(0.25 + diffuse * 1.15 + rim * 0.3, 0.0, 1.0);
        if (mod(gl_FragCoord.y, uRow) > uRow * 0.5) discard;
        if (tone < 0.1) discard;
        if (tone < 0.9 && mod(gl_FragCoord.x, uRow) > uRow * tone) discard;
        gl_FragColor = vec4(mix(uInk, uViolet, uMorph), 1.0);
    }
`;

// one vertex per (t, angle) pair, joined into a grid of triangles wrapped round into a tube
function tube() {
    const coords: number[] = [];
    const corners: number[] = [];
    for (let i = 0; i <= ALONG; i++) {
        for (let j = 0; j <= AROUND; j++) coords.push(i / ALONG, (j / AROUND) * Math.PI * 2);
    }
    for (let i = 0; i < ALONG; i++) {
        for (let j = 0; j < AROUND; j++) {
            const a = i * (AROUND + 1) + j;
            const b = a + AROUND + 1;
            // wound so the outside of the tube faces the camera (the side that gets drawn)
            corners.push(a, a + 1, b, b, a + 1, b + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("aTube", new THREE.Float32BufferAttribute(coords, 2));
    // three.js wants a position for each vertex; the shader works out the real one
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((coords.length / 2) * 3), 3));
    geometry.setIndex(corners);
    return geometry;
}

export function Tangle({ className = "" }: { className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current!;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dpr = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(dpr);
        renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        box.prepend(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        camera.position.z = 6.4;

        const uniforms = {
            uMorph: { value: 0 },
            uTime: { value: 0 },
            uInk: { value: new THREE.Color("#1c1c1c") },
            uViolet: { value: new THREE.Color("#4a38f5") },
            uRow: { value: 6 * dpr },
            uLight: { value: new THREE.Vector3(-2, 3, 4) },
        };
        const mesh = new THREE.Mesh(tube(), new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms }));
        // the real shape is only known in the shader, so don't let three.js hide it as "off screen"
        mesh.frustumCulled = false;
        const scene = new THREE.Scene().add(mesh);

        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            camera.aspect = width / height || 1;
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
        });
        resizer.observe(box);

        // how far through the section you've scrolled sets how untangled it should be: it stays
        // a knot for the first part, then comes apart
        let goal = 0;
        const progress = ScrollTrigger.create({
            trigger: box,
            start: "top 75%",
            // done by the time its middle is a little above the screen's middle, so you see it whole
            end: "center 40%",
            onUpdate: (self) => (goal = THREE.MathUtils.smoothstep(self.progress, 0.25, 0.9)),
        });

        // the pointer over the page, -0.5 to 0.5 each way from the picture's middle
        let pointerX = 0;
        let pointerY = 0;
        function onMove(event: PointerEvent) {
            const rect = box.getBoundingClientRect();
            pointerX = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width - 0.5, -0.8, 0.8);
            pointerY = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height - 0.5, -0.8, 0.8);
        }
        window.addEventListener("pointermove", onMove, { passive: true });

        const labels = box.querySelectorAll<HTMLElement>("[data-tangle-label]");
        let frame = 0;

        function tick() {
            frame = requestAnimationFrame(tick);
            if (!still) uniforms.uTime.value += 0.016;
            const morph = (uniforms.uMorph.value += (goal - uniforms.uMorph.value) * 0.06);

            // the knot turns slowly and leans back to show its depth; the ring settles to face you
            if (!still) mesh.rotation.z += 0.002 * (1 - morph * 0.6);
            mesh.rotation.x += (THREE.MathUtils.lerp(0.9, 0.35, morph) + pointerY * 0.4 - mesh.rotation.x) * 0.05;
            mesh.rotation.y += (pointerX * 0.5 - mesh.rotation.y) * 0.05;

            // one label at a time, swapping with a short fade halfway through
            labels[0].style.opacity = morph < 0.5 ? "1" : "0";
            labels[1].style.opacity = morph < 0.5 ? "0" : "1";
            renderer.render(scene, camera);
        }

        // only drawn while it's on screen
        const watcher = new IntersectionObserver(([entry]) => {
            cancelAnimationFrame(frame);
            if (entry.isIntersecting) tick();
        });
        watcher.observe(box);

        return () => {
            cancelAnimationFrame(frame);
            watcher.disconnect();
            resizer.disconnect();
            progress.kill();
            window.removeEventListener("pointermove", onMove);
            mesh.geometry.dispose();
            mesh.material.dispose();
            // hand the WebGL context back now; browsers only allow about 16 at once
            renderer.forceContextLoss();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    return (
        // the caller places it (it must be positioned, e.g. "absolute inset-0"), since the canvas and label sit inside it
        <div ref={boxRef} aria-hidden className={className}>
            <p className="absolute bottom-6 left-6 font-(family-name:--font-azeret-mono) text-[12px] font-medium tracking-wide uppercase">
                <span data-tangle-label className="absolute bottom-0 left-0 whitespace-nowrap text-[#1c1c1c]/55 transition-opacity duration-300">
                    The usual CRM
                </span>
                <span data-tangle-label className="absolute bottom-0 left-0 whitespace-nowrap text-[#4a38f5] opacity-0 transition-opacity duration-300">
                    Flash
                </span>
            </p>
        </div>
    );
}
