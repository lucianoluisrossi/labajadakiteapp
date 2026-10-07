// Kite 3D dorado para el encabezado del modal VIP. Se carga la primera vez que se abre el modal.
// Comparte el módulo de Three.js con wind-scene.js (misma URL → una sola descarga).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const RADIUS = 1.6;        // radio del arco del kite
const ARC = 2.4;           // apertura del arco (rad)
const CHORD = 0.9;         // profundidad del ala

function buildKite() {
    const kite = new THREE.Group();

    // Canopy: segmento de cilindro abierto, girado para que el arco quede de frente (forma de C invertida)
    const canopyGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, CHORD, 28, 1, true, -ARC / 2, ARC);
    canopyGeo.rotateX(-Math.PI / 2);
    const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshPhongMaterial({
        color: 0xfbbf24, emissive: 0x8a5a00, specular: 0xffffff, shininess: 90, side: THREE.DoubleSide, flatShading: true,
    }));
    kite.add(canopy);

    // Borde de ataque inflable
    const edge = new THREE.Mesh(
        new THREE.TorusGeometry(RADIUS, 0.07, 8, 32, ARC),
        new THREE.MeshPhongMaterial({ color: 0x0ea5e9, specular: 0xffffff, shininess: 60 })
    );
    edge.rotation.z = Math.PI / 2 - ARC / 2;
    edge.position.z = CHORD / 2;
    kite.add(edge);

    // Líneas desde las puntas y el centro hasta la barra
    const tip = RADIUS * Math.sin(ARC / 2);
    const tipY = RADIUS * Math.cos(ARC / 2);
    const barY = -1.5;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-tip, tipY, 0), new THREE.Vector3(-0.45, barY, 0),
        new THREE.Vector3(tip, tipY, 0), new THREE.Vector3(0.45, barY, 0),
        new THREE.Vector3(-0.5, RADIUS * 0.98, 0), new THREE.Vector3(-0.1, barY, 0),
        new THREE.Vector3(0.5, RADIUS * 0.98, 0), new THREE.Vector3(0.1, barY, 0),
    ]);
    kite.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));

    // Barra
    const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8),
        new THREE.MeshPhongMaterial({ color: 0x1f2937 })
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.y = barY;
    kite.add(bar);

    kite.position.y = 0;
    // Inclinado hacia adelante: se ve la cara interna (dorada) del ala, como mirando un kite en el aire
    kite.rotation.x = -0.5;
    return kite;
}

export function createVipKite(container) {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) {
        return null;
    }
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 0, 5.6);
    camera.lookAt(0, 0.3, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x0369a1, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 4, 5);
    scene.add(key);

    const kite = buildKite();
    scene.add(kite);

    function resize() {
        const { clientWidth: w, clientHeight: h } = container;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
    }

    // Vuelo suave: balanceo y cabeceo. Solo anima con el modal abierto (IntersectionObserver)
    let rafId = null;
    function frame(now) {
        const t = now / 1000;
        kite.rotation.y = Math.sin(t * 0.8) * 0.55;
        kite.rotation.z = Math.sin(t * 1.1) * 0.12;
        kite.position.y = Math.sin(t * 1.6) * 0.08;
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(frame);
    }
    new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !reducedMotion && rafId === null) rafId = requestAnimationFrame(frame);
        if (!entry.isIntersecting && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }).observe(container);
    new ResizeObserver(resize).observe(container);

    kite.rotation.y = -0.35; // pose estática (reduced motion o antes del primer frame)
    resize();
    return { dispose: () => { if (rafId !== null) cancelAnimationFrame(rafId); renderer.dispose(); } };
}
