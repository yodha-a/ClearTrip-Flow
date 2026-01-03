import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ImageNodeData } from "./ImageNode";
import "./PanoramaViewer.css";
import "./ContextMenu.css";

interface PanoramaViewerProps {
  imageUrl: string;
  currentNode: ImageNodeData;
  rootNode: ImageNodeData;
  onClose: () => void;
  onSaveHotspot: (
    position: THREE.Vector3,
    label: string,
    targetNodeId?: string
  ) => void;
  isTourMode?: boolean;
  onNavigate?: (targetNodeId: string) => void;
}

export function PanoramaViewer({
  imageUrl,
  currentNode,
  rootNode,
  onClose,
  onSaveHotspot,
  isTourMode = false,
  onNavigate,
}: PanoramaViewerProps) {
  console.log("PanoramaViewer rendering with image:", imageUrl ? "Yes" : "No");
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const hotspotsRef = useRef<THREE.Mesh[]>([]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    position: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing children to prevent duplicates (React Strict Mode)
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0.1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true; // Enable zoom
    controls.enablePan = false;
    controls.rotateSpeed = -0.5;
    controls.enableDamping = true; // Add smooth damping
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Sphere
    const sphereGeom = new THREE.SphereGeometry(500, 60, 40);
    // Invert the geometry on the x-axis so that all of the faces point inward
    sphereGeom.scale(-1, 1, 1);

    const textureLoader = new THREE.TextureLoader();

    const texture = textureLoader.load(
      imageUrl,
      () => console.log("Texture loaded"),
      undefined,
      (err) => console.error("Texture load error:", err)
    );
    texture.colorSpace = THREE.SRGBColorSpace;

    const sphereMat = new THREE.MeshBasicMaterial({
      map: texture,
    });

    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    scene.add(sphere);

    // Render Hotspots
    hotspotsRef.current = [];
    if (currentNode.hotspots) {
      currentNode.hotspots.forEach((hotspot) => {
        // Create a ring/torus for links, small sphere for info
        if (hotspot.type === "link") {
          // Outer ring
          const ringGeometry = new THREE.TorusGeometry(12, 2, 16, 32);
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0.9,
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          ring.position.copy(hotspot.position);
          ring.lookAt(0, 0, 0);
          ring.userData = { hotspot };
          scene.add(ring);
          hotspotsRef.current.push(ring);

          // Inner pulsing dot
          const dotGeometry = new THREE.SphereGeometry(5, 16, 16);
          const dotMaterial = new THREE.MeshBasicMaterial({
            color: 0x4ade80,
            transparent: true,
            opacity: 0.8,
          });
          const dot = new THREE.Mesh(dotGeometry, dotMaterial);
          dot.position.copy(hotspot.position);
          dot.userData = { hotspot };
          scene.add(dot);
          hotspotsRef.current.push(dot);
        } else {
          // Info hotspot - blue diamond shape
          const geometry = new THREE.OctahedronGeometry(8);
          const material = new THREE.MeshBasicMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.85,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.copy(hotspot.position);
          mesh.userData = { hotspot };
          scene.add(mesh);
          hotspotsRef.current.push(mesh);
        }
      });
    }

    // Animation Loop
    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(requestRef.current);

      // Check if the renderer's domElement is still a child of the container
      if (
        containerRef.current &&
        renderer.domElement.parentNode === containerRef.current
      ) {
        containerRef.current.removeChild(renderer.domElement);
      }

      sphereGeom.dispose();
      sphereMat.dispose();
      texture.dispose();

      renderer.dispose();
    };
  }, [imageUrl, currentNode]); // Re-run if currentNode changes (to update hotspots)

  const handleLeftClick = (event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const intersects = raycaster.intersectObjects(hotspotsRef.current);

    if (intersects.length > 0) {
      const hotspot = intersects[0].object.userData.hotspot;

      if (hotspot.type === "link" && hotspot.targetNodeId && onNavigate) {
        onNavigate(hotspot.targetNodeId);
      } else {
        console.log("Info hotspot:", hotspot.label);
      }
    }
  };

  const handleRightClick = (event: React.MouseEvent) => {
    event.preventDefault();
    if (isTourMode) return;

    if (!containerRef.current || !cameraRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    // Raycast against the sphere (which is the first child of the scene)
    if (sceneRef.current) {
      const intersects = raycaster.intersectObjects(sceneRef.current.children);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          position: point,
        });
      }
    }
  };

  const handleAddHotspot = () => {
    if (!contextMenu) return;
    onSaveHotspot(contextMenu.position, "New Hotspot");
    setContextMenu(null);
  };

  const handleLinkImage = (targetNode: ImageNodeData) => {
    if (!contextMenu) return;
    onSaveHotspot(contextMenu.position, targetNode.label, targetNode.id);
    setContextMenu(null);
  };

  // Find parent of current node in the tree
  const findParent = (
    node: ImageNodeData,
    targetId: string,
    parent: ImageNodeData | null = null
  ): ImageNodeData | null => {
    if (node.id === targetId) return parent;
    for (const child of node.children) {
      const found = findParent(child, targetId, node);
      if (found) return found;
    }
    return null;
  };

  const parentNode = findParent(rootNode, currentNode.id);

  // Get all linkable nodes (parent + children)
  const linkableNodes: ImageNodeData[] = [];
  if (parentNode) {
    linkableNodes.push(parentNode);
  }
  linkableNodes.push(...currentNode.children);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="panorama-viewer-overlay">
      <button className="close-button" onClick={onClose}>
        ×
      </button>
      <div
        ref={containerRef}
        className="panorama-container"
        onContextMenu={handleRightClick}
        onClick={handleLeftClick}
      />

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-item" onClick={handleAddHotspot}>
            Add hotspot
          </div>
          {linkableNodes.length > 0 && (
            <>
              <div className="menu-divider"></div>
              <div className="menu-header">Link to image</div>
              {linkableNodes.map((node) => (
                <div
                  className="menu-item"
                  key={node.id}
                  onClick={() => handleLinkImage(node)}
                >
                  Link {node.label}{" "}
                  {node.id === parentNode?.id ? "(parent)" : ""}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
