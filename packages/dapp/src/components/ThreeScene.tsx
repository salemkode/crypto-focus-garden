"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface ThreeSceneProps {
	number?: number;
	className?: string;
}

export default function ThreeScene({ number = 6, className }: ThreeSceneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<{
		scene: THREE.Scene;
		camera: THREE.OrthographicCamera;
		renderer: THREE.WebGLRenderer;
		plantTrees: (number: number) => void;
	} | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const container = containerRef.current;

		// Scene Setup
		const scene = new THREE.Scene();
		// scene.background = new THREE.Color(0xe0f7fa); // Removed for transparency

		// Orthographic Camera for Isometric View
		const aspect = container.clientWidth / container.clientHeight;
		const d = 18; // Increased view size for larger grid
		const camera = new THREE.OrthographicCamera(
			-d * aspect,
			d * aspect,
			d,
			-d,
			1,
			1000,
		);

		// Isometric position
		camera.position.set(20, 20, 20);
		camera.lookAt(scene.position);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		container.appendChild(renderer.domElement);

		// Lighting
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambientLight);

		const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
		dirLight.position.set(10, 20, 10);
		dirLight.castShadow = true;
		dirLight.shadow.mapSize.width = 2048;
		dirLight.shadow.mapSize.height = 2048;
		dirLight.shadow.camera.near = 0.1;
		dirLight.shadow.camera.far = 50;
		dirLight.shadow.camera.left = -25; // Expanded shadow camera
		dirLight.shadow.camera.right = 25;
		dirLight.shadow.camera.top = 25;
		dirLight.shadow.camera.bottom = -25;
		scene.add(dirLight);

		// Platform Group
		const platformGroup = new THREE.Group();
		scene.add(platformGroup);

		// Checkerboard Ground
		const gridSize = 8; // Increased to 8x8 grid
		const tileSize = 2.5;
		const tileHeight = 0.5;

		const geometry = new THREE.BoxGeometry(tileSize, tileHeight, tileSize);
		const materialGreen = new THREE.MeshStandardMaterial({ color: 0x8bc34a }); // Light green
		const materialYellow = new THREE.MeshStandardMaterial({ color: 0xdce775 }); // Yellowish green

		// Soil base
		const soilHeight = 2;
		const soilGeometry = new THREE.BoxGeometry(
			gridSize * tileSize,
			soilHeight,
			gridSize * tileSize,
		);
		const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x8d6e63 }); // Brown
		const soil = new THREE.Mesh(soilGeometry, soilMaterial);
		soil.position.y = -soilHeight / 2 - tileHeight / 2;
		soil.receiveShadow = true;
		platformGroup.add(soil);

		// Tiles
		const tiles: THREE.Mesh[] = [];
		const offset = (gridSize * tileSize) / 2 - tileSize / 2;

		for (let x = 0; x < gridSize; x++) {
			for (let z = 0; z < gridSize; z++) {
				const isGreen = (x + z) % 2 === 0;
				const tile = new THREE.Mesh(
					geometry,
					isGreen ? materialGreen : materialYellow,
				);

				tile.position.set(x * tileSize - offset, 0, z * tileSize - offset);
				tile.receiveShadow = true;
				tile.castShadow = true;
				platformGroup.add(tile);
				tiles.push(tile);
			}
		}

		// Trees Group
		const treesGroup = new THREE.Group();
		platformGroup.add(treesGroup);

		// ----- دالة إنشاء شجرة بسيطة -----
		type TreeType = "normal" | "gold" | "diamond";

		function createTree(type: TreeType) {
			const group = new THREE.Group();

			// Materials based on type
			let foliageColor = 0x4caf50; // Normal Green
			let trunkColor = 0x795548; // Normal Brown
			let scale = 1;

			if (type === "gold") {
				foliageColor = 0xffd700; // Gold
				trunkColor = 0x8d6e63;
				scale = 1.2;
			} else if (type === "diamond") {
				foliageColor = 0x00bfff; // Diamond Blue
				trunkColor = 0x5d4037;
				scale = 1.5;
			}

			const trunk = new THREE.Mesh(
				new THREE.CylinderGeometry(0.2 * scale, 0.25 * scale, 1.5 * scale, 8),
				new THREE.MeshStandardMaterial({ color: trunkColor }),
			);
			trunk.position.y = 0.75 * scale;
			trunk.castShadow = true;
			trunk.receiveShadow = true;
			group.add(trunk);

			const foliageGeo = new THREE.IcosahedronGeometry(1.2 * scale, 1);
			const foliageMat = new THREE.MeshStandardMaterial({
				color: foliageColor,
				flatShading: true,
				emissive:
					type === "diamond" ? 0x0044aa : type === "gold" ? 0xaa8800 : 0x000000,
				emissiveIntensity: type === "normal" ? 0 : 0.2,
			});
			const foliage = new THREE.Mesh(foliageGeo, foliageMat);
			foliage.position.y = 2.2 * scale;
			foliage.castShadow = true;
			foliage.receiveShadow = true;
			group.add(foliage);

			// Store target scale in userData
			group.userData = { targetScale: scale, currentScale: 0 };
			group.scale.set(0, 0, 0);

			return group;
		}

		function plantTrees(count: number) {
			// Clear existing trees
			while (treesGroup.children.length) {
				treesGroup.remove(treesGroup.children[0]);
			}

			// Calculate tree types
			// 1 Diamond = 6 Gold = 24 Normal
			// 1 Gold = 4 Normal

			const diamondCount = Math.floor(count / 24);
			const remainder = count % 24;

			const goldCount = Math.floor(remainder / 4);
			const normalCount = remainder % 4;

			const treesToPlant: TreeType[] = [
				...Array(diamondCount).fill("diamond"),
				...Array(goldCount).fill("gold"),
				...Array(normalCount).fill("normal"),
			];

			// Shuffle tiles to pick random spots
			const availableTiles = [...tiles].sort(() => 0.5 - Math.random());

			// Plant trees
			const numToPlant = Math.min(treesToPlant.length, availableTiles.length);

			for (let i = 0; i < numToPlant; i++) {
				const tile = availableTiles[i];
				const type = treesToPlant[i];
				const tree = createTree(type);

				// Position tree on top of the tile
				tree.position.copy(tile.position);
				tree.position.y += tileHeight / 2;

				treesGroup.add(tree);
			}
		}

		plantTrees(number);

		// Animation Loop
		const animate = () => {
			requestAnimationFrame(animate);

			// Animate tree growth
			treesGroup.children.forEach((tree) => {
				const target = tree.userData.targetScale || 1;
				const current = tree.scale.x; // Assuming uniform scale

				if (current < target) {
					const newScale = THREE.MathUtils.lerp(current, target, 0.1);
					tree.scale.set(newScale, newScale, newScale);
				}
			});

			renderer.render(scene, camera);
		};
		animate();

		// Handle Resize
		const handleResize = () => {
			if (!container) return;
			const aspect = container.clientWidth / container.clientHeight;
			camera.left = -d * aspect;
			camera.right = d * aspect;
			camera.top = d;
			camera.bottom = -d;
			camera.updateProjectionMatrix();
			renderer.setSize(container.clientWidth, container.clientHeight);
		};

		window.addEventListener("resize", handleResize);

		// Store refs
		sceneRef.current = {
			scene,
			camera,
			renderer,
			plantTrees,
		};

		return () => {
			window.removeEventListener("resize", handleResize);
			container.removeChild(renderer.domElement);
			renderer.dispose();
		};
	}, [number]);

	return (
		<div
			ref={containerRef}
			className={className}
			style={{ width: "100%", height: "100%", minHeight: "400px" }}
		/>
	);
}
