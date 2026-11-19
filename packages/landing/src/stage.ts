import * as THREE from "three";

/**
 * Small 3D stages for the page. All of them share ONE WebGL renderer (browsers allow only a
 * handful of WebGL contexts, fewer on phones): each stage renders into it and copies the frame
 * onto its own 2D canvas. Stages use the app's lights and voxel material, turn by drag, keys or
 * buttons, idle-turn slowly (not under reduced motion), and only render while on screen.
 */
let shared: THREE.WebGLRenderer | null = null;
function renderer() {
	if (!shared) {
		shared = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
		shared.setPixelRatio(1); // stages pass device pixels themselves
		shared.toneMapping = THREE.ACESFilmicToneMapping;
		shared.toneMappingExposure = 1.05;
		shared.setClearColor(0x000000, 0);
	}
	return shared;
}

export class Stage {
	readonly scene = new THREE.Scene();
	readonly root = new THREE.Group();
	readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
	private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
	private readonly context: CanvasRenderingContext2D;
	private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
	private readonly pitch: number;
	private visible = false;
	private frame = 0;
	private last = 0;
	private spin = 0;
	private velocity = 0;
	private dragging: { x: number; at: number } | null = null;
	private distance = 60;
	private target = new THREE.Vector3();
	private tickers = new Set<(now: number, dt: number) => boolean | void>();

	constructor(private readonly canvas: HTMLCanvasElement, options: { pitch?: number } = {}) {
		this.context = canvas.getContext("2d")!;
		this.pitch = options.pitch ?? 0.32;
		const sun = new THREE.DirectionalLight(0xffe2b0, 3.2);
		sun.position.set(40, 80, 50);
		this.scene.add(sun, new THREE.HemisphereLight(0xfff4e0, 0x6b5a4a, 1.5), this.root);

		new ResizeObserver(() => this.resize()).observe(canvas);
		new IntersectionObserver(([entry]) => {
			this.visible = entry.isIntersecting;
			if (this.visible) this.wake();
		}, { rootMargin: "120px" }).observe(canvas);

		canvas.addEventListener("pointerdown", (event) => {
			if (event.pointerType === "touch") return; // vertical page scroll wins on phones; buttons turn instead
			this.dragging = { x: event.clientX, at: performance.now() };
			canvas.setPointerCapture(event.pointerId);
		});
		canvas.addEventListener("pointermove", (event) => {
			if (!this.dragging) return;
			const now = performance.now();
			const dx = event.clientX - this.dragging.x;
			this.spin += dx * 0.012;
			this.velocity = ((dx * 0.012) / Math.max(8, now - this.dragging.at)) * 16;
			this.dragging = { x: event.clientX, at: now };
			this.wake();
		});
		const end = () => { this.dragging = null; };
		canvas.addEventListener("pointerup", end);
		canvas.addEventListener("pointercancel", end);
	}

	/** Turn by a fixed step (keyboard and button alternative to dragging). */
	turn(direction: -1 | 1) {
		this.velocity = 0;
		const from = this.spin;
		const to = from + direction * (Math.PI / 6);
		const start = performance.now();
		this.animate((now) => {
			const t = this.reduced ? 1 : Math.min(1, (now - start) / 320);
			this.spin = from + (to - from) * (1 - (1 - t) ** 3);
			return t >= 1;
		});
	}

	/** Replace everything on the stage. */
	set(...objects: THREE.Object3D[]) {
		for (const child of [...this.root.children]) this.dispose(child);
		this.root.add(...objects);
		this.wake();
	}

	dispose(object: THREE.Object3D) {
		this.root.remove(object);
		object.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
	}

	mesh(geometry: THREE.BufferGeometry) {
		return new THREE.Mesh(geometry, this.material);
	}

	/** Point the camera so a box of this size fills the canvas, centred on its middle. */
	frameBox(box: THREE.Box3, padding = 1.15) {
		const size = box.getSize(new THREE.Vector3());
		box.getCenter(this.target);
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
		const fitHeight = size.y / 2 / tan;
		const fitWidth = Math.max(size.x, size.z) / 2 / (tan * Math.max(0.4, this.camera.aspect));
		this.distance = Math.max(fitHeight, fitWidth) * padding + size.z / 2;
		this.wake();
	}

	/** Run something every frame until it returns true. */
	animate(ticker: (now: number, dt: number) => boolean | void) {
		this.tickers.add(ticker);
		this.wake();
	}

	private resize() {
		const ratio = Math.min(2, devicePixelRatio || 1);
		this.canvas.width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
		this.canvas.height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
		this.camera.aspect = this.canvas.width / this.canvas.height;
		this.camera.updateProjectionMatrix();
		this.wake();
	}

	private wake() {
		if (!this.frame && this.visible) this.frame = requestAnimationFrame((now) => this.tick(now));
	}

	private tick(now: number) {
		this.frame = 0;
		const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
		this.last = now;
		if (!this.dragging) {
			this.spin += this.velocity;
			this.velocity *= 0.92;
			if (!this.reduced) this.spin += dt * 0.25;
		}
		for (const ticker of this.tickers) if (ticker(now, dt) === true) this.tickers.delete(ticker);
		this.root.rotation.y = this.spin;
		this.camera.position.set(this.target.x, this.target.y + Math.sin(this.pitch) * this.distance, this.target.z + Math.cos(this.pitch) * this.distance);
		this.camera.lookAt(this.target);

		const gl = renderer();
		const { width, height } = this.canvas;
		if (gl.domElement.width !== width || gl.domElement.height !== height) gl.setSize(width, height, false);
		gl.render(this.scene, this.camera);
		this.context.clearRect(0, 0, width, height);
		this.context.drawImage(gl.domElement, 0, 0);

		const moving = !this.reduced || Math.abs(this.velocity) > 0.0005 || this.dragging || this.tickers.size > 0;
		if (this.visible && moving) this.wake();
		else this.last = 0;
	}
}
