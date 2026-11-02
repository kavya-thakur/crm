"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Part = (geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number, rotateX?: number, rotateY?: number, rotateZ?: number) => THREE.Mesh;

// A turned shape (like on a lathe) from a side profile: [distance from the middle, height]
const lathe = (profile: [number, number][]) => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 64);

// A flat outline pushed out into a thin slab with softly bevelled edges
function slab(outline: [number, number][], depth: number) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4 }).translate(0, 0, -depth / 2);
}

// Each object is a few simple solids put together. Round ones lean a little, so the
// slow turn shows. Sizes don't matter, every object is scaled to fit the same box.
const MODELS = {
    shield: {
        lean: 0,
        build: (part: Part) => [part(slab([[0, 0.5], [0.42, 0.36], [0.42, 0], [0, -0.5], [-0.42, 0], [-0.42, 0.36]], 0.22))],
    },
    // leads dropping into a funnel
    funnel: {
        lean: 0.3,
        build: (part: Part) => {
            const lead = new THREE.SphereGeometry(0.09, 32, 16);
            return [part(lathe([[0.07, -0.55], [0.07, -0.15], [0.5, 0.3], [0.54, 0.36]])), part(lead, -0.18, 0.55), part(lead, 0.14, 0.75), part(lead, -0.02, 0.98)];
        },
    },
    // a short stack with one coin leaning against it
    coins: {
        lean: 0.2,
        build: (part: Part) => {
            const coin = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 64);
            return [part(coin, 0, -0.3), part(coin, 0.05, -0.17), part(coin, -0.03, -0.04), part(coin, 0.03, 0.09), part(coin, 0.5, -0.02, 0.1, 0, 0, 1.25)];
        },
    },
    rocket: {
        lean: 0.45,
        build: (part: Part) => {
            const fin = slab([[0.15, -0.2], [0.36, -0.42], [0.36, -0.58], [0.15, -0.44]], 0.03);
            return [
                part(lathe([[0, 0.72], [0.1, 0.56], [0.17, 0.3], [0.19, 0], [0.18, -0.3], [0.12, -0.46], [0, -0.46]])),
                part(new THREE.TorusGeometry(0.07, 0.022, 16, 48), 0, 0.22, 0.18),
                part(new THREE.ConeGeometry(0.1, 0.26, 32), 0, -0.6, 0, Math.PI),
                ...[0, 1, 2].map((index) => part(fin, 0, 0, 0, 0, (index * Math.PI * 2) / 3)),
            ];
        },
    },
    magnet: {
        lean: 0,
        build: (part: Part) => {
            const leg = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 32);
            const tip = new THREE.CylinderGeometry(0.135, 0.135, 0.14, 32);
            return [part(new THREE.TorusGeometry(0.3, 0.12, 32, 64, Math.PI)), part(leg, -0.3, -0.2), part(leg, 0.3, -0.2), part(tip, -0.3, -0.47), part(tip, 0.3, -0.47)];
        },
    },
    // a folded paper plane: two wings and a keel
    plane: {
        lean: 0.25,
        build: (part: Part) => {
            const [nose, left, right, back, keel] = [[0, 0, 0.65], [-0.5, 0.08, -0.4], [0.5, 0.08, -0.4], [0, 0, -0.4], [0, -0.22, -0.4]];
            const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([nose, left, back, nose, back, right, nose, back, keel].flat(), 3));
            geometry.computeVertexNormals();
            return [part(geometry)];
        },
    },
    trophy: {
        lean: 0.3,
        build: (part: Part) => {
            const handle = new THREE.TorusGeometry(0.13, 0.035, 16, 32, Math.PI);
            return [
                part(lathe([[0, -0.55], [0.3, -0.55], [0.3, -0.47], [0.12, -0.44], [0.06, -0.3], [0.06, -0.12], [0.12, -0.05], [0.34, 0.1], [0.4, 0.5], [0.36, 0.5], [0.3, 0.14], [0, 0.02]])),
                part(handle, 0.37, 0.27, 0, 0, 0, -Math.PI / 2),
                part(handle, -0.37, 0.27, 0, 0, 0, Math.PI / 2),
            ];
        },
    },
    hourglass: {
        lean: 0.35,
        build: (part: Part) => {
            const plate = new THREE.CylinderGeometry(0.4, 0.4, 0.07, 64);
            const post = new THREE.CylinderGeometry(0.025, 0.025, 0.86, 12);
            return [
                part(lathe([[0.3, -0.42], [0.28, -0.22], [0.06, 0], [0.28, 0.22], [0.3, 0.42]])),
                part(new THREE.ConeGeometry(0.22, 0.16, 48), 0, -0.34),
                part(plate, 0, 0.46),
                part(plate, 0, -0.46),
                ...[0, 1, 2].map((index) => part(post, Math.cos((index * Math.PI * 2) / 3) * 0.35, 0, Math.sin((index * Math.PI * 2) / 3) * 0.35)),
            ];
        },
    },
};

export type ShapeName = keyof typeof MODELS;

// The object, centred and scaled so its longest side is the same for every shape
function makeModel(shape: ShapeName, material: THREE.Material) {
    const part: Part = (geometry, x = 0, y = 0, z = 0, rotateX = 0, rotateY = 0, rotateZ = 0) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rotateX, rotateY, rotateZ);
        return mesh;
    };

    const model = new THREE.Group().add(...MODELS[shape].build(part));
    const box = new THREE.Box3().setFromObject(model);
    const scale = 1.15 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
    model.scale.setScalar(scale);
    model.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-scale));

    const leaning = new THREE.Group().add(model);
    leaning.rotation.z = MODELS[shape].lean;
    return leaning;
}

const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        vec4 position4 = modelViewMatrix * vec4(position, 1.0);
        vPosition = position4.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * position4;
    }
`;

// The same printed look as DashArt, worked out per pixel: lit parts become solid
// rows of bars, darker parts break into shorter and shorter dashes, and the
// darkest parts disappear. Everything that isn't ink is see-through.
const fragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uLight;
    uniform float uRow;
    uniform float uCell;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        // the inside of an open shape (a funnel, a cup) faces the other way
        vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float diffuse = max(dot(normal, normalize(uLight - vPosition)), 0.0);
        float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 2.0);
        float tone = clamp(0.12 + diffuse + rim * 0.35, 0.0, 1.0);

        if (mod(gl_FragCoord.y, uRow) > uRow * 0.5) discard;
        if (tone < 0.1) discard;
        if (tone < 0.9 && mod(gl_FragCoord.x, uCell) > uCell * tone) discard;
        gl_FragColor = vec4(uColor, 1.0);
    }
`;

const IDLE_SPIN = 0.006;

// A 3D object drawn in bars. It turns slowly on its own, bobs a little, leans and
// catches the light toward the pointer, and can be spun by dragging it sideways.
// It only draws while it's on screen.
export function Halftone3D({ shape, color = "#4a38f5", row = 6, className = "" }: { shape: ShapeName; color?: string; row?: number; className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current!;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dpr = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setPixelRatio(dpr);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        box.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        camera.position.z = 3.2;

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uLight: { value: new THREE.Vector3(-1.5, 1.5, 3) },
                uRow: { value: row * dpr },
                uCell: { value: row * dpr },
            },
        });
        const object = new THREE.Group().add(makeModel(shape, material));
        object.rotation.y = 0.5;
        const scene = new THREE.Scene();
        scene.add(object);

        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            camera.aspect = width / height || 1;
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
        });
        resizer.observe(box);

        // pointer position over the box, -0.5 to 0.5 each way
        let pointerX = 0;
        let pointerY = 0;
        let spin = still ? 0 : IDLE_SPIN;
        let dragging = false;
        let lastX = 0;

        function onDown(event: PointerEvent) {
            dragging = true;
            lastX = event.clientX;
            box.setPointerCapture(event.pointerId);
        }
        function onMove(event: PointerEvent) {
            const rect = box.getBoundingClientRect();
            pointerX = (event.clientX - rect.left) / rect.width - 0.5;
            pointerY = (event.clientY - rect.top) / rect.height - 0.5;
            if (dragging) {
                spin = (event.clientX - lastX) * 0.01;
                lastX = event.clientX;
            }
        }
        function onUp() {
            dragging = false;
        }
        function onLeave() {
            if (!dragging) pointerX = pointerY = 0;
        }
        box.addEventListener("pointerdown", onDown);
        box.addEventListener("pointermove", onMove);
        box.addEventListener("pointerup", onUp);
        box.addEventListener("pointercancel", onUp);
        box.addEventListener("pointerleave", onLeave);

        let frame = 0;
        let time = 0;

        function tick() {
            frame = requestAnimationFrame(tick);
            time += 0.016;

            // after a throw, the spin eases back down to the slow idle turn
            if (!dragging) spin += ((still ? 0 : IDLE_SPIN) - spin) * 0.03;
            object.rotation.y += spin;

            const bob = still ? 0 : Math.sin(time * 0.8) * 0.12;
            object.rotation.x += (pointerY * 0.7 + bob - object.rotation.x) * 0.06;
            object.position.y = still ? 0 : Math.sin(time) * 0.04;
            material.uniforms.uLight.value.lerp(new THREE.Vector3(-1.5 + pointerX * 4, 1.5 - pointerY * 4, 3), 0.08);

            renderer.render(scene, camera);
        }

        const watcher = new IntersectionObserver(([entry]) => {
            cancelAnimationFrame(frame);
            if (entry.isIntersecting) tick();
        });
        watcher.observe(box);

        return () => {
            cancelAnimationFrame(frame);
            watcher.disconnect();
            resizer.disconnect();
            box.removeEventListener("pointerdown", onDown);
            box.removeEventListener("pointermove", onMove);
            box.removeEventListener("pointerup", onUp);
            box.removeEventListener("pointercancel", onUp);
            box.removeEventListener("pointerleave", onLeave);
            object.traverse((child) => (child as THREE.Mesh).geometry?.dispose());
            material.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [shape, color, row]);

    return <div ref={boxRef} aria-hidden className={`cursor-grab touch-pan-y active:cursor-grabbing ${className}`} />;
}
