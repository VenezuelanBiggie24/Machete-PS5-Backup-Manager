import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { FileItem } from '../App';

function SimpleBox() {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHover] = useState(false);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta;
      meshRef.current.rotation.y += delta;
    }
  });

  return (
    <mesh
      ref={meshRef}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
      scale={hovered ? 1.5 : 1}
    >
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color={hovered ? 'hotpink' : 'cyan'} />
    </mesh>
  );
}

interface HoloGridProps {
  files: FileItem[];
  metadata: Record<string, any>;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string) => void;
  onClick: (game: FileItem) => void;
}

export function HoloGrid(_props: HoloGridProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Basic WebGL detection with immediate context release
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) {
        setError('WebGL NO está soportado en este sistema o vista.');
      } else {
        const loseCtx = gl.getExtension('WEBGL_lose_context');
        loseCtx?.loseContext();
      }
    } catch (e: any) {
      setError(e.toString());
    }
  }, []);

  if (error) {
    return (
      <div className="w-full h-[70vh] flex items-center justify-center bg-red-900/50 rounded-2xl border border-red-500">
        <div className="text-red-200 text-center font-mono">
          <p className="text-xl font-bold mb-2">Error de WebGL (El 3D no puede iniciar)</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[70vh] rounded-2xl overflow-hidden border border-cyan-500/20 bg-black/40 backdrop-blur-xl relative shadow-2xl shadow-cyan-900/20">
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
        <pointLight position={[-10, -10, -10]} />
        <SimpleBox />
        <OrbitControls />
        <Text position={[0, -2, 0]} fontSize={0.5} color="white">
          If you see this cube, WebGL WORKS!
        </Text>
      </Canvas>
      <div className="absolute top-4 left-4 text-white font-mono text-xs bg-black/50 p-2 rounded">
        Modo de Diagnóstico 3D (Solo un cubo)
      </div>
    </div>
  );
}
