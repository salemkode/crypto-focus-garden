import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { buildIsland, buildSapling, buildTree, type TreeType } from '@focus-garden/garden';
import { color } from '../ui/tokens';

export type IslandTree = { type: TreeType; seed: number };

/** Each held reward NFT is one island tree; `trees` order fixes its plot. */
export function Garden({ trees, growing, progress = 0 }: { trees: IslandTree[]; growing: boolean; progress?: number }) {
  const count = trees.length;
  const treeKey = trees.map((tree) => `${tree.type}:${tree.seed}`).join(',');
  const [failed, setFailed] = useState(false);
  const render = useRef<((trees: IslandTree[], growing: boolean, progress: number) => void) | null>(null);
  const latest = useRef(trees);
  const dispose = useRef<(() => void) | null>(null);
  const growthStage = Math.min(3, Math.max(0, Math.floor(progress * 4)));
  // treeKey captures the tree list contents; the array identity changes every render.
  useEffect(() => {
    latest.current = trees;
    render.current?.(trees, growing, growthStage / 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeKey, growing, growthStage]);
  useEffect(() => () => dispose.current?.(), []);
  function createScene(gl: ExpoWebGLRenderingContext) {
    try {
      dispose.current?.();
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, gl.drawingBufferWidth / gl.drawingBufferHeight, 1, 1000);
      camera.position.set(108, 96, 142);
      camera.lookAt(0, -6, 0);
      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(color.skyTop, 1);
      // Shared voxel geometry includes ambient occlusion. Avoid the old iOS
      // shadow-map path; device verification is still required.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xcdb89a, 2));
      const sun = new THREE.DirectionalLight(0xfff3dc, 2);
      sun.position.set(-52, 110, 60);
      scene.add(sun);
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const island = buildIsland();
      const islandGeometry = island.model.toGeometry();
      scene.add(new THREE.Mesh(islandGeometry, material));
      const trees = new THREE.Group();
      scene.add(trees);
      function clearTrees() {
        trees.children.forEach((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        trees.clear();
      }
      function draw(earnedTrees: IslandTree[], active: boolean, growth: number) {
        clearTrees();
        const earned = earnedTrees.length;
        island.plots.slice(0, Math.min(earned, island.plots.length)).forEach((plot, index) => {
          const tree = new THREE.Mesh(buildTree(earnedTrees[index].type, earnedTrees[index].seed).toGeometry(), material);
          tree.position.set(plot.x, 1, plot.z);
          trees.add(tree);
        });
        if (active) {
          const plot = island.plots[Math.min(earned, island.plots.length - 1)];
          if (plot) {
            const sprout = new THREE.Mesh(buildSapling(Math.min(3, Math.max(0, Math.floor(growth * 4))), 41).toGeometry(), material);
            sprout.position.set(plot.x, 1, plot.z);
            trees.add(sprout);
          }
        }
        renderer.render(scene, camera);
        gl.endFrameEXP();
      }
      render.current = draw;
      dispose.current = () => {
        render.current = null;
        clearTrees();
        islandGeometry.dispose();
        material.dispose();
        renderer.dispose();
      };
      draw(latest.current, growing, progress);
    } catch { setFailed(true); }
  }
  return <View style={{ borderCurve: 'continuous' }} className="h-72 overflow-hidden rounded-[20px] bg-sky-top" accessibilityLabel={`${count} claimed trees${growing ? ', focus session in progress' : ''}`}>
    {failed ? <View className="flex-1 items-center justify-center p-6"><Text className="text-center text-subhead text-ink-2">The 3D garden could not open on this device. Your sessions and wallet are safe.</Text></View> : <GLView style={{ flex: 1 }} onContextCreate={createScene} />}
  </View>;
}
