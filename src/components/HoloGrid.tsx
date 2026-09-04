import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, PresentationControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { FileItem } from '../App';
import { playHoverSound } from '../utils/audio';

interface PS5BoxProps {
  file: FileItem;
  meta: any;
  position: [number, number, number];
  isSelected: boolean;
  onToggleSelect: (path: string) => void;
  onClick: (game: FileItem) => void;
  textureCache: Map<string, THREE.Texture>;
}

function PS5Box({ file, meta, position, isSelected, onToggleSelect, onClick, textureCache }: PS5BoxProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Retrieve or create texture
  const texture = useMemo(() => {
    // Generate a file:// URL or use default
    const imgSrc = meta?.cover_url || (file.is_dir ? '/assets/folder_default.png' : '/assets/file_default.png');
    // Using simple placeholder color if texture loading fails/is complex in raw WebGL right away
    if (textureCache.has(imgSrc)) return textureCache.get(imgSrc);
    
    const loader = new THREE.TextureLoader();
    try {
      const tex = loader.load(imgSrc);
      tex.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(imgSrc, tex);
      return tex;
    } catch (e) {
      return null;
    }
  }, [meta?.cover_url, file.is_dir, textureCache]);

  // Floating animation
  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    // Hover offset
    const targetY = hovered ? position[1] + 0.3 : position[1];
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY + Math.sin(t * 2 + position[0]) * 0.05, 0.1);
    
    // Slight rotation on hover
    const targetRotX = hovered ? -0.1 : 0;
    const targetRotY = hovered ? 0.2 : 0;
    meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetRotX, 0.1);
    meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotY, 0.1);
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          playHoverSound();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(file);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          onToggleSelect(file.path);
        }}
        castShadow
        receiveShadow
      >
        {/* PS5 Box Dimensions (aspect roughly 1.4 : 1.9 : 0.15) */}
        <boxGeometry args={[1.4, 1.9, 0.25]} />
        
        {/* Materials for the 6 faces. Front face gets the texture */}
        <meshStandardMaterial attach="material-0" color={isSelected ? "#00f0ff" : "#1a1a2e"} roughness={0.4} /> {/* Right */}
        <meshStandardMaterial attach="material-1" color={isSelected ? "#00f0ff" : "#1a1a2e"} roughness={0.4} /> {/* Left */}
        <meshStandardMaterial attach="material-2" color={isSelected ? "#00f0ff" : "#1a1a2e"} roughness={0.4} /> {/* Top */}
        <meshStandardMaterial attach="material-3" color={isSelected ? "#00f0ff" : "#1a1a2e"} roughness={0.4} /> {/* Bottom */}
        <meshStandardMaterial attach="material-4" map={texture || undefined} color={texture ? "#ffffff" : "#333"} roughness={0.2} metalness={0.1} /> {/* Front */}
        <meshStandardMaterial attach="material-5" color="#0f0f1a" roughness={0.5} /> {/* Back */}
      </mesh>

      {/* Title Text Below */}
      <Text
        position={[0, -1.2, 0]}
        fontSize={0.12}
        color={hovered ? "#00f0ff" : "#ffffff"}
        maxWidth={1.4}
        textAlign="center"
        anchorX="center"
        anchorY="top"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {meta?.title_id ? `${meta?.title} [${meta?.title_id}]` : file.name}
      </Text>
      
      {isSelected && (
        <mesh position={[0.6, 0.85, 0.13]}>
          <circleGeometry args={[0.15, 32]} />
          <meshBasicMaterial color="#00f0ff" />
        </mesh>
      )}
    </group>
  );
}

interface HoloGridProps {
  files: FileItem[];
  metadata: Record<string, any>;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string) => void;
  onClick: (game: FileItem) => void;
}

export function HoloGrid({ files, metadata, selectedPaths, onToggleSelect, onClick }: HoloGridProps) {
  // Shared texture cache to prevent massive memory leaks when mapping 100s of identical defaults
  const textureCache = useMemo(() => new Map<string, THREE.Texture>(), []);

  // Grid layout calculations
  const columns = 5;
  const spacingX = 1.8;
  const spacingZ = -2.5;

  return (
    <div className="w-full h-[70vh] rounded-2xl overflow-hidden border border-cyan-500/20 bg-black/40 backdrop-blur-xl relative shadow-2xl shadow-cyan-900/20">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2, 8], fov: 45 }}>
        <color attach="background" args={['#050510']} />
        
        {/* Cinematic Lighting */}
        <ambientLight intensity={0.4} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00f0ff" />
        <directionalLight position={[0, 5, -5]} intensity={0.5} color="#a020f0" />

        <PresentationControls 
          global 
          zoom={0.8} 
          rotation={[0, 0, 0]} 
          polar={[-Math.PI / 4, Math.PI / 4]} 
          azimuth={[-Math.PI / 4, Math.PI / 4]}
        >
          <group position={[-((columns - 1) * spacingX) / 2, 0, 0]}>
            {files.map((file, i) => {
              const row = Math.floor(i / columns);
              const col = i % columns;
              return (
                <PS5Box
                  key={file.path}
                  file={file}
                  meta={metadata[file.path]}
                  position={[col * spacingX, -row * 2.5, row * spacingZ]}
                  isSelected={selectedPaths.has(file.path)}
                  onToggleSelect={onToggleSelect}
                  onClick={onClick}
                  textureCache={textureCache}
                />
              );
            })}
          </group>
        </PresentationControls>

        {/* Floor Reflections */}
        <ContactShadows position={[0, -2, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
        <Environment preset="city" />
      </Canvas>
      
      <div className="absolute bottom-4 left-0 w-full text-center pointer-events-none">
        <p className="text-cyan-400/50 font-mono text-xs tracking-widest uppercase">
          XR Voxel Grid Active • Right-Click to Select
        </p>
      </div>
    </div>
  );
}
