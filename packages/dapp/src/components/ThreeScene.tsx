"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
	buildBalloon,
	buildCloud,
	buildIsland,
	buildIslet,
	buildMarker,
	buildSapling,
	buildTree,
	type IsletKind,
	type TreeType,
} from "@focus-garden/garden";

interface ThreeSceneProps {
	/** Trees earned so far. */
	number?: number;
	/** Progress of the running session, 0..1. `null` when nothing is growing. */
	growth?: number | null;
	className?: string;
}

interface GardenApi {
	setTrees: (count: number) => void;
	setGrowth: (growth: number | null) => void;
}

// One visible tree per earned reward; never exchange or consume rewards implicitly.
function tierTrees(count: number) {
	return Array.from({ length: Math.min(count, 60) }, () => "normal" as const);
}

function saplingStage(growth: number) {
	if (growth >= 1) return 3;
	if (growth >= 0.6) return 2;
	if (growth >= 0.2) return 1;
	return 0;
}

const easeOutBack = (t: number) => {
	const c = 1.70158;
	return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

const ISLETS: {
	pos: [number, number, number];
	r: number;
	kind: IsletKind;
}[] = [
	// Kept below the turf line so none of them drifts in front of the garden.
	{ pos: [-72, -10, 18], r: 4, kind: "oak" },
	{ pos: [-84, -18, -30], r: 3, kind: "flowers" },
	{ pos: [-62, -28, 46], r: 5, kind: "pine" },
	{ pos: [78, -8, -22], r: 4, kind: "oak" },
	{ pos: [72, -30, 38], r: 5, kind: "hut" },
	{ pos: [12, -20, -74], r: 4, kind: "pine" },
	{ pos: [-24, -34, 70], r: 3, kind: "flowers" },
];

const FALL_PARTICLES = 110;

export default function ThreeScene({
	number = 0,
	growth = null,
	className,
}: ThreeSceneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const apiRef = useRef<GardenApi | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const geometries: THREE.BufferGeometry[] = [];

		const scene = new THREE.Scene();
		const fog = new THREE.Fog(0xc6e2f4, 200, 700);
		scene.fog = fog;

		const camera = new THREE.PerspectiveCamera(32, 1, 1, 4000);
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.domElement.style.display = "block";
		renderer.domElement.style.touchAction = "none";
		container.appendChild(renderer.domElement);

		// Sun stays put in the world so shadows don't crawl as the view orbits.
		scene.add(new THREE.HemisphereLight(0xffffff, 0xcdb89a, 1.9));
		const sun = new THREE.DirectionalLight(0xfff3dc, 2.5);
		sun.position.set(-52, 110, 60);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.near = 20;
		sun.shadow.camera.far = 280;
		sun.shadow.camera.left = -64;
		sun.shadow.camera.right = 64;
		sun.shadow.camera.top = 64;
		sun.shadow.camera.bottom = -64;
		sun.shadow.bias = -0.0004;
		sun.shadow.normalBias = 0.06;
		scene.add(sun);

		const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
		const cloudMaterial = new THREE.MeshLambertMaterial({
			vertexColors: true,
			emissive: 0x8fa9bb,
			emissiveIntensity: 0.35,
			fog: false,
		});

		const meshOf = (
			model: { toGeometry: (jitter?: number) => THREE.BufferGeometry },
			material: THREE.Material = voxelMaterial,
			jitter = 0.05,
		) => {
			const geometry = model.toGeometry(jitter);
			geometries.push(geometry);
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			return mesh;
		};

		// ---- The island
		const world = new THREE.Group();
		scene.add(world);
		const island = buildIsland();
		world.add(meshOf(island.model));
		const treesGroup = new THREE.Group();
		world.add(treesGroup);

		// ---- Waterfalls: cubes of spray tumbling off the rim
		const fallCount = island.waterfalls.length * FALL_PARTICLES;
		const sprayGeometry = new THREE.BoxGeometry(1, 1, 1);
		geometries.push(sprayGeometry);
		const sprayMaterial = new THREE.MeshLambertMaterial({
			color: 0xffffff,
			emissive: 0x9cc4dc,
			emissiveIntensity: 0.5,
		});
		const spray = new THREE.InstancedMesh(
			sprayGeometry,
			sprayMaterial,
			fallCount,
		);
		spray.frustumCulled = false;
		world.add(spray);
		const dummy = new THREE.Object3D();
		const updateSpray = (time: number) => {
			let i = 0;
			for (const fall of island.waterfalls) {
				const px = -fall.dz;
				const pz = fall.dx;
				for (let p = 0; p < FALL_PARTICLES; p++, i++) {
					const phase = (p * 0.618034) % 1;
					const t = (time * 0.16 + phase) % 1;
					const side = ((p * 0.754877) % 1) - 0.5;
					const drift = ((p * 0.569840) % 1) - 0.5;
					const out = 0.9 + t * 2.5 + drift * t * 5;
					const across = side * (2.2 + t * 5);
					dummy.position.set(
						fall.x + fall.dx * out + px * across,
						-0.6 - t ** 1.6 * 58,
						fall.z + fall.dz * out + pz * across,
					);
					const mist = THREE.MathUtils.smoothstep(t, 0.55, 0.95);
					const fade = 1 - THREE.MathUtils.smoothstep(t, 0.88, 1);
					dummy.scale.setScalar((0.9 + mist * 1.6) * fade + 0.001);
					dummy.updateMatrix();
					spray.setMatrixAt(i, dummy.matrix);
				}
			}
			spray.instanceMatrix.needsUpdate = true;
		};

		// ---- Drifting scenery
		const islets = ISLETS.map(({ pos, r, kind }, i) => {
			const mesh = meshOf(buildIslet(i + 3, r, kind));
			mesh.position.set(...pos);
			scene.add(mesh);
			return { mesh, baseY: pos[1], phase: i * 1.7 };
		});

		// Clouds sit on a ring wider than the camera can ever orbit, so they are
		// only ever backdrop and never slide between the viewer and the garden.
		const cloudRing = new THREE.Group();
		scene.add(cloudRing);
		const CLOUD_HEIGHTS = [62, -30, 20, 84, -64, 40, -8, 70, -46, 30, -20, 54];
		for (let i = 0; i < CLOUD_HEIGHTS.length; i++) {
			const mesh = meshOf(buildCloud(i + 20), cloudMaterial, 0.01);
			mesh.castShadow = false;
			mesh.receiveShadow = false;
			const angle = (i / CLOUD_HEIGHTS.length) * Math.PI * 2 + 0.4;
			const reach = 300 + (i % 3) * 40;
			mesh.position.set(
				Math.cos(angle) * reach,
				CLOUD_HEIGHTS[i],
				Math.sin(angle) * reach,
			);
			mesh.rotation.y = -angle + Math.PI / 2;
			mesh.scale.setScalar(2.6 + (i % 3) * 0.7);
			cloudRing.add(mesh);
		}

		const balloons = [
			{ a: 0xf2684f, b: 0xfff1d6, cap: 0xf6c431, angle: 2.5, reach: 98, y: 54 },
			{ a: 0x2f9e8f, b: 0xffd95a, cap: 0xfff1d6, angle: 5.6, reach: 108, y: 64 },
		].map((cfg, i) => {
			const mesh = meshOf(buildBalloon(cfg.a, cfg.b, cfg.cap));
			mesh.receiveShadow = false;
			mesh.scale.setScalar(0.9);
			scene.add(mesh);
			return { mesh, ...cfg, phase: i * 2.3 };
		});

		// Gem that hovers over the tree currently growing.
		const marker = meshOf(buildMarker());
		marker.castShadow = false;
		marker.receiveShadow = false;
		marker.visible = false;
		world.add(marker);
		const MARKER_HEIGHT = [5, 7, 10];

		// ---- Camera and controls
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enablePan = false;
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.rotateSpeed = 0.6;
		controls.minPolarAngle = THREE.MathUtils.degToRad(38);
		controls.maxPolarAngle = THREE.MathUtils.degToRad(98);
		controls.autoRotate = !calm;
		controls.autoRotateSpeed = 0.35;

		const viewDir = new THREE.Vector3()
			.setFromSphericalCoords(
				1,
				THREE.MathUtils.degToRad(70),
				THREE.MathUtils.degToRad(-24),
			)
			.normalize();
		let fitted = false;

		const fit = () => {
			const width = container.clientWidth;
			const height = container.clientHeight;
			if (!width || !height) return;
			const aspect = width / height;
			const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
			// Fit the island's width on narrow screens and its height on wide ones.
			const byWidth = 94 / (2 * tan * aspect) / 0.94;
			const byHeight = 62 / (2 * tan) / 0.6;
			const distance = Math.max(byWidth, byHeight);

			// Aim below the island so it sits above the controls at the bottom.
			controls.target.set(0, -4 - distance * 0.04, 0);
			if (fitted) viewDir.subVectors(camera.position, controls.target).normalize();
			camera.position.copy(controls.target).addScaledVector(viewDir, distance);
			controls.minDistance = distance * 0.5;
			controls.maxDistance = distance * 1.5;
			fog.near = distance * 1.25;
			fog.far = distance * 5;
			// 180 is the distance the cloud ring was laid out for.
			cloudRing.scale.setScalar(distance / 180);

			camera.aspect = aspect;
			camera.updateProjectionMatrix();
			renderer.setSize(width, height);
			controls.update();
			fitted = true;
		};
		fit();
		const resizeObserver = new ResizeObserver(fit);
		resizeObserver.observe(container);

		// ---- Trees
		const clock = new THREE.Clock();
		const planted = new Map<number, { type: TreeType; mesh: THREE.Mesh }>();
		let sapling: { mesh: THREE.Mesh; stage: number; plot: number } | null = null;
		let treeCount = 0;
		let currentGrowth: number | null = null;

		const discard = (mesh: THREE.Mesh) => {
			treesGroup.remove(mesh);
			mesh.geometry.dispose();
		};

		const plant = (
			model: { toGeometry: () => THREE.BufferGeometry },
			plot: number,
			delay: number,
		) => {
			const geometry = model.toGeometry();
			// Sit the base on the turf so the tree grows up out of the ground.
			geometry.translate(0, 0.5, 0);
			const mesh = new THREE.Mesh(geometry, voxelMaterial);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			const { x, z } = island.plots[plot];
			mesh.position.set(x, 0.5, z);
			mesh.rotation.y = (plot % 4) * (Math.PI / 2);
			mesh.scale.setScalar(0.001);
			mesh.userData = { born: clock.getElapsedTime() + delay, phase: plot * 1.3 };
			treesGroup.add(mesh);
			return mesh;
		};

		const syncSapling = () => {
			const plot = treeCount;
			const stage = currentGrowth === null ? -1 : saplingStage(currentGrowth);
			const wanted = stage >= 0 && plot < island.plots.length;
			if (sapling && (!wanted || sapling.stage !== stage || sapling.plot !== plot)) {
				discard(sapling.mesh);
				sapling = null;
			}
			if (wanted && !sapling) {
				sapling = { mesh: plant(buildSapling(stage, plot), plot, 0), stage, plot };
			}
		};

		const setTrees = (count: number) => {
			const wanted = tierTrees(count).slice(0, island.plots.length);
			for (const [plot, tree] of planted) {
				if (wanted[plot] !== tree.type) {
					discard(tree.mesh);
					planted.delete(plot);
				}
			}
			let fresh = 0;
			wanted.forEach((type, plot) => {
				if (planted.has(plot)) return;
				const mesh = plant(buildTree(type, plot), plot, fresh++ * 0.07);
				planted.set(plot, { type, mesh });
			});
			treeCount = wanted.length;
			syncSapling();
		};

		const setGrowth = (value: number | null) => {
			currentGrowth = value;
			syncSapling();
		};

		apiRef.current = { setTrees, setGrowth };

		// ---- Frame loop
		let frame = 0;
		const animate = () => {
			frame = requestAnimationFrame(animate);
			const time = clock.getElapsedTime();
			const motion = calm ? 0 : 1;

			for (const mesh of treesGroup.children) {
				const age = (time - mesh.userData.born) / 0.7;
				if (age <= 0) continue;
				const s = age >= 1 ? 1 : Math.max(0.001, easeOutBack(age));
				mesh.scale.setScalar(s);
				mesh.rotation.z = Math.sin(time * 0.9 + mesh.userData.phase) * 0.012 * motion;
			}

			// Point out the growing tree until it is ready to claim.
			marker.visible = sapling !== null && sapling.stage < 3;
			if (sapling && marker.visible) {
				marker.position.set(
					sapling.mesh.position.x,
					MARKER_HEIGHT[sapling.stage] + Math.sin(time * 2.2) * 0.5 * motion,
					sapling.mesh.position.z,
				);
				marker.rotation.y = time * 1.2 * motion;
			}

			world.position.y = Math.sin(time * 0.45) * 0.7 * motion;
			for (const islet of islets) {
				islet.mesh.position.y =
					islet.baseY + Math.sin(time * 0.6 + islet.phase) * 1.4 * motion;
				islet.mesh.rotation.y = time * 0.03 * motion + islet.phase;
			}
			cloudRing.rotation.y = time * 0.006 * motion;
			for (const balloon of balloons) {
				const angle = balloon.angle + time * 0.012 * motion;
				balloon.mesh.position.set(
					Math.cos(angle) * balloon.reach,
					balloon.y + Math.sin(time * 0.5 + balloon.phase) * 1.8 * motion,
					Math.sin(angle) * balloon.reach,
				);
			}
			updateSpray(calm ? 0.35 : time);

			controls.update();
			renderer.render(scene, camera);
		};
		animate();

		return () => {
			cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			controls.dispose();
			apiRef.current = null;
			for (const mesh of [...treesGroup.children]) discard(mesh as THREE.Mesh);
			for (const geometry of geometries) geometry.dispose();
			voxelMaterial.dispose();
			cloudMaterial.dispose();
			sprayMaterial.dispose();
			spray.dispose();
			renderer.dispose();
			container.removeChild(renderer.domElement);
		};
	}, []);

	useEffect(() => {
		apiRef.current?.setTrees(number);
	}, [number]);

	useEffect(() => {
		apiRef.current?.setGrowth(growth);
	}, [growth]);

	return (
		<div
			ref={containerRef}
			className={className}
			style={{ width: "100%", height: "100%" }}
			role="img"
			aria-label={`Your floating garden with ${number} ${number === 1 ? "tree" : "trees"}`}
		/>
	);
}
