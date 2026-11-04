"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

// The product page's centrepiece: the Flash logo's three slanted bars as thick glass, turning
// slowly and leaning towards the pointer. `progress` (0 to 1, from the hero's scroll) spins it
// round and brings it closer, as the page flies in through it.
//
// The glass is faked in the shader rather than rendered for real: each point looks up what it
// would see in an imaginary bright studio (white walls, a violet band, a pink lamp, a dark
// floor), once reflected off its surface and once bent through it. Bending red, green and blue by
// slightly different amounts splits the light into rainbow edges, like a prism.

// The bars, as drawn in the 64 × 64 logo (src/components/Logo)
const BARS = [
    { points: [20, 15, 50, 15, 47, 24, 17, 24], tint: "#8f84ff" },
    { points: [17, 28, 40, 28, 37, 37, 14, 37], tint: "#b3abff" },
    { points: [14, 41, 26, 41, 23, 50, 11, 50], tint: "#ffffff" },
];

const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
    }
`;

const fragmentShader = `
    uniform vec3 uTint;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vWorld;

    // what the glass sees in each direction
    vec3 studio(vec3 d) {
        float turn = uTime * 0.15;
        d.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * d.xz;
        vec3 color = mix(vec3(0.93), vec3(1.0), d.y * 0.5 + 0.5);
        color = mix(color, vec3(0.56, 0.52, 1.0), smoothstep(0.28, 0.0, abs(d.y - 0.05)));
        color = mix(color, vec3(0.93, 0.53, 0.99), smoothstep(0.45, 0.0, distance(d, normalize(vec3(-0.7, 0.35, 0.4)))));
        // tall softboxes and one long strip light: the bright bands that sweep across glass as it turns
        color += smoothstep(0.06, 0.0, abs(d.x - 0.5)) * step(-0.05, d.y) * 0.7;
        color += smoothstep(0.04, 0.0, abs(d.x + 0.3)) * step(-0.05, d.y) * 0.5;
        color += smoothstep(0.03, 0.0, abs(d.x - 0.05)) * smoothstep(-0.1, 0.4, d.y) * 0.35;
        color += smoothstep(0.05, 0.0, abs(d.y - 0.6)) * 0.4;
        color = mix(color, vec3(0.42, 0.4, 0.55), smoothstep(-0.12, -0.5, d.y)); // a dusky floor, for contrast
        return color;
    }

    void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vWorld - cameraPosition);
        float facing = max(dot(-v, n), 0.0);
        float fresnel = pow(1.0 - facing, 3.0);

        // bent through the glass, red least and blue most; the position term makes each flat face
        // act a little like a lens, so what's seen through it changes across the face
        vec3 lens = vWorld * 0.45;
        vec3 through = vec3(
            studio(normalize(refract(v, n, 1.0 / 1.42) + lens)).r,
            studio(normalize(refract(v, n, 1.0 / 1.5) + lens)).g,
            studio(normalize(refract(v, n, 1.0 / 1.58) + lens)).b
        ) * mix(vec3(1.0), uTint, 0.4);
        vec3 bounced = studio(reflect(v, n));
        // a soapy rainbow sheen where the surface turns away
        vec3 film = 0.5 + 0.5 * cos(6.2831 * (fresnel * 1.3 + vec3(0.0, 0.33, 0.67)));

        vec3 color = mix(through, bounced, 0.12 + 0.78 * fresnel) + film * fresnel * 0.3;
        gl_FragColor = vec4(color, 1.0);
    }
`;

export function GlassLogo({ progress, className = "" }: { progress: RefObject<number>; className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current!;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        box.append(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
        camera.position.z = 6;

        // each bar extruded into a thick slab with rounded edges, which catch the light
        const logo = new THREE.Group();
        const time = { value: 0 };
        const materials = BARS.map(({ points, tint }) => {
            const shape = new THREE.Shape();
            for (let i = 0; i < points.length; i += 2) shape[i === 0 ? "moveTo" : "lineTo"](points[i], -points[i + 1]);
            const geometry = new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.3, bevelSegments: 8, curveSegments: 1 });
            const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uTint: { value: new THREE.Color(tint) }, uTime: time } });
            logo.add(new THREE.Mesh(geometry, material));
            return material;
        });
        // centred on its middle (the bars span 11–50 across and 15–50 down, 37 tall with the bevel)
        logo.children.forEach((bar) => bar.position.set(-30.5, 32.5, -3));
        const holder = new THREE.Group().add(logo);
        const scene = new THREE.Scene().add(holder);

        // the logo is drawn 60% as tall as the box's shorter side, however wide the box is, so
        // a wide box leaves room round it to grow into as it flies closer
        let fit = 1;
        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            camera.aspect = width / height || 1;
            camera.updateProjectionMatrix();
            const seen = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); // units from top to bottom
            fit = ((0.6 * Math.min(width, height)) / (height || 1)) * (seen / 37);
            holder.scale.setScalar(fit);
            renderer.render(scene, camera);
        });
        resizer.observe(box);

        let pointerX = 0;
        let pointerY = 0;
        function onMove(event: PointerEvent) {
            pointerX = event.clientX / window.innerWidth - 0.5;
            pointerY = event.clientY / window.innerHeight - 0.5;
        }
        window.addEventListener("pointermove", onMove, { passive: true });

        let frame = 0;
        function tick() {
            frame = requestAnimationFrame(tick);
            if (!still) time.value += 0.016;
            const t = time.value;
            const p = progress.current;
            // a slow sway, a lean towards the pointer, and a full turn and a rush closer as you scroll
            const turnY = Math.sin(t * 0.4) * 0.45 + pointerX * 0.5 + p * Math.PI * 1.25;
            const turnX = 0.18 + pointerY * 0.3 - p * 0.3;
            holder.rotation.y += (turnY - holder.rotation.y) * 0.08;
            holder.rotation.x += (turnX - holder.rotation.x) * 0.08;
            holder.position.y = Math.sin(t * 0.8) * 0.06;
            holder.scale.setScalar(fit * (1 + p * 2.2));
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
            window.removeEventListener("pointermove", onMove);
            logo.children.forEach((bar) => (bar as THREE.Mesh).geometry.dispose());
            materials.forEach((material) => material.dispose());
            // hand the WebGL context back now; browsers only allow about 16 at once
            renderer.forceContextLoss();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [progress]);

    return <div ref={boxRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
