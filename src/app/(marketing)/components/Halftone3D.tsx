"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Part = (geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number, rotateX?: number, rotateY?: number, rotateZ?: number) => THREE.Mesh;

// A turned shape (like on a lathe) from a side profile: [distance from the middle, height]
const lathe = (profile: [number, number][]) => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 64);

// A little person: a round head on rounded shoulders, `size` times the usual
function person(part: Part, x: number, y: number, z: number, size: number) {
    const shoulders: [number, number][] = [[0, -0.32], [0.22, -0.32], [0.25, -0.08], [0.2, 0.08], [0, 0.13]];
    return [part(new THREE.SphereGeometry(0.12 * size, 32, 16), x, y + 0.3 * size, z), part(lathe(shoulders.map(([px, py]) => [px * size, py * size])), x, y, z)];
}

// Prints a part lighter (shorter dashes, `level` 0 to 1), so what's in front of it stands out
function dim(mesh: THREE.Mesh, level: number) {
    mesh.userData.dim = level;
    return mesh;
}

// A box with softly rounded edges, which catch the light
const box = (width: number, height: number, depth: number) => new RoundedBoxGeometry(width, height, depth, 4, Math.min(width, height, depth) * 0.45);

// Each object is a few simple solids put together. Round ones lean a little, so the
// slow turn shows; flat ones (a form, a board) only sway, so they never turn edge-on. Sizes don't matter, every object is scaled to fit the same box.
const MODELS = {
    // a magnet pulling leads (three little people) in towards it
    magnet: {
        lean: 0,
        flat: true,
        build: (part: Part) => {
            const leg = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 32);
            const tip = new THREE.CylinderGeometry(0.135, 0.135, 0.14, 32);
            return [
                part(new THREE.TorusGeometry(0.3, 0.12, 32, 64, Math.PI), 0, 0.35),
                part(leg, -0.3, 0.15),
                part(leg, 0.3, 0.15),
                part(tip, -0.3, -0.12),
                part(tip, 0.3, -0.12),
                // nearer ones closer to the magnet, and bigger
                ...person(part, -0.42, -0.62, 0.1, 0.6),
                ...person(part, 0.18, -0.9, 0.05, 0.5),
                ...person(part, 0.62, -1.14, 0, 0.42),
            ];
        },
    },
    // an arrow that has hit the middle of a target: the deal, closed
    target: {
        lean: 0,
        flat: true,
        build: (part: Part) => {
            // from where the arrow came in (up and to the right, towards you) to the middle
            const along = new THREE.Vector3(0.62, 0.5, 0.75).normalize();
            const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along));
            const at = (distance: number) => along.clone().multiplyScalar(distance);
            const shaft = at(0.42);
            const fletch = at(0.8);
            return [
                dim(part(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 96), 0, 0, -0.06, Math.PI / 2), 0.35),
                ...[0.5, 0.34, 0.18].map((radius) => part(new THREE.TorusGeometry(radius, 0.045, 24, 96))),
                part(new THREE.SphereGeometry(0.07, 32, 16)),
                part(new THREE.CylinderGeometry(0.022, 0.022, 0.84, 16), shaft.x, shaft.y, shaft.z, turn.x, turn.y, turn.z),
                part(box(0.02, 0.2, 0.14), fletch.x, fletch.y, fletch.z, turn.x, turn.y, turn.z),
                part(box(0.14, 0.2, 0.02), fletch.x, fletch.y, fletch.z, turn.x, turn.y, turn.z),
            ];
        },
    },
    // three people, the one in the middle bigger and wearing a shield badge: roles
    team: {
        lean: 0,
        flat: true,
        build: (part: Part) => {
            const badge = new THREE.ExtrudeGeometry(new THREE.Shape(([[0, 0.5], [0.42, 0.36], [0.42, 0], [0, -0.5], [-0.42, 0], [-0.42, 0.36]] as [number, number][]).map(([px, py]) => new THREE.Vector2(px * 0.5, py * 0.5))), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3 });
            const people = [...person(part, -0.8, 0, -0.2, 0.85), ...person(part, 0.8, 0, -0.2, 0.85), ...person(part, 0, 0, 0, 1.15)];
            return [...people.map((mesh) => dim(mesh, 0.55)), part(badge, 0, -0.14, 0.34)];
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
    model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.userData.dim === undefined) return;
        const lighter = (material as THREE.ShaderMaterial).clone();
        lighter.uniforms = { ...(material as THREE.ShaderMaterial).uniforms, uDim: { value: mesh.userData.dim } };
        mesh.material = lighter;
    });
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
    uniform float uDim;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        // the inside of an open shape (a funnel, a cup) faces the other way
        vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float diffuse = max(dot(normal, normalize(uLight - vPosition)), 0.0);
        float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 2.0);
        float tone = clamp(0.12 + diffuse + rim * 0.35, 0.0, 1.0) * uDim;

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
                uDim: { value: 1 },
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
        let turned = 0; // how far a drag has turned a flat object from its sway
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

            if ("flat" in MODELS[shape]) {
                // a gentle sway, facing you; a drag turns it further, and it eases back
                if (dragging) turned += spin;
                else turned *= 0.95;
                spin = 0;
                object.rotation.y = 0.15 + (still ? 0 : Math.sin(time * 2) * 0.35) + turned;
            } else {
                // after a throw, the spin eases back down to the slow idle turn
                if (!dragging) spin += ((still ? 0 : IDLE_SPIN) - spin) * 0.03;
                object.rotation.y += spin;
            }

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
            // the main material and the lighter copies of it
            object.traverse((child) => ((child as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
            material.dispose();
            // hand the WebGL context back now; browsers only allow about 16 at once
            renderer.forceContextLoss();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [shape, color, row]);

    return <div ref={boxRef} aria-hidden className={`cursor-grab touch-pan-y active:cursor-grabbing ${className}`} />;
}
