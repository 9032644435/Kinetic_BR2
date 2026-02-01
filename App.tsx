
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { motion, AnimatePresence } from 'framer-motion';
import { HandData, Bubble, Point } from './types';
import { SARCASTIC_QUOTES, BUBBLE_LIFETIME, SPAWN_COOLDOWN } from './constants';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [0, 9], [9, 10], [10, 11], [11, 12], // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17] // palm base connection
];

const App: React.FC = () => {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [activeHandsCount, setActiveHandsCount] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const lastSpawnTimeRef = useRef<number[]>([0, 0]); // Independent cooldowns for 2 hands
  const quoteIndexRef = useRef<number>(0);

  useEffect(() => {
    const initLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
      );
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2 // DUAL HAND SUPPORT
      });
      landmarkerRef.current = handLandmarker;
      setIsLoaded(true);
    };
    initLandmarker();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 },
          audio: false 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setCameraActive(true);
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };
    setupCamera();
  }, [isLoaded]);

  const predict = useCallback(() => {
    if (!videoRef.current || !landmarkerRef.current || videoRef.current.readyState < 2) {
      requestAnimationFrame(predict);
      return;
    }

    const now = performance.now();
    const results = landmarkerRef.current.detectForVideo(videoRef.current, now);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let handsActiveThisFrame = 0;

      if (results.landmarks && results.landmarks.length > 0) {
        results.landmarks.forEach((landmarks, handIndex) => {
          const scaledLandmarks: Point[] = landmarks.map(lm => ({
            x: (1 - lm.x) * canvas.width,
            y: lm.y * canvas.height
          }));

          // Optimized Gesture Logic
          const thumbTip = landmarks[4];
          const thumbIP = landmarks[3];
          const thumbBase = landmarks[2];
          
          const isThumbExtendedUp = thumbTip.y < thumbIP.y && thumbIP.y < thumbBase.y;
          const isIndexFolded = landmarks[8].y > landmarks[6].y;
          const isMiddleFolded = landmarks[12].y > landmarks[10].y;
          const isRingFolded = landmarks[16].y > landmarks[14].y;
          const isPinkyFolded = landmarks[20].y > landmarks[18].y;

          const thumbsUpActive = isThumbExtendedUp && isIndexFolded && isMiddleFolded && isRingFolded && isPinkyFolded;
          
          if (thumbsUpActive) handsActiveThisFrame++;

          // Draw Skeleton for each hand
          ctx.shadowBlur = thumbsUpActive ? 40 : 10;
          ctx.shadowColor = thumbsUpActive ? '#ffffff' : '#06b6d4';
          ctx.strokeStyle = thumbsUpActive ? '#ffffff' : '#22d3ee';
          ctx.lineWidth = thumbsUpActive ? 8 : 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
            const start = scaledLandmarks[startIdx];
            const end = scaledLandmarks[endIdx];
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
          });
          ctx.stroke();

          // Draw Nodes
          ctx.shadowBlur = 0;
          scaledLandmarks.forEach((lm, i) => {
            const isThumbTip = i === 4;
            ctx.fillStyle = isThumbTip ? (thumbsUpActive ? '#ffffff' : '#22d3ee') : '#22d3ee';
            ctx.beginPath();
            ctx.arc(lm.x, lm.y, thumbsUpActive && isThumbTip ? 12 : 4, 0, Math.PI * 2);
            ctx.fill();
          });

          // Trigger Quote INSTANTLY if active
          if (thumbsUpActive && now - lastSpawnTimeRef.current[handIndex] > SPAWN_COOLDOWN) {
            const spawnPoint = scaledLandmarks[4];
            const newBubble: Bubble = {
              id: Math.random().toString(36).substr(2, 9),
              text: SARCASTIC_QUOTES[quoteIndexRef.current],
              x: spawnPoint.x,
              y: spawnPoint.y,
              driftX: (Math.random() - 0.5) * 200,
              rotation: (Math.random() - 0.5) * 10
            };
            
            setBubbles(prev => [...prev, newBubble]);
            lastSpawnTimeRef.current[handIndex] = now;
            quoteIndexRef.current = (quoteIndexRef.current + 1) % SARCASTIC_QUOTES.length;

            setTimeout(() => {
              setBubbles(prev => prev.filter(b => b.id !== newBubble.id));
            }, BUBBLE_LIFETIME); 
          }
        });
      }
      setActiveHandsCount(handsActiveThisFrame);
    }

    requestAnimationFrame(predict);
  }, []);

  useEffect(() => {
    if (cameraActive) {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
      predict();
    }
  }, [cameraActive, predict]);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover grayscale contrast-125 scale-x-[-1] transition-opacity duration-1000 opacity-40`}
        playsInline
      />

      {/* Pulsing overlay based on active hands */}
      <motion.div 
        className="absolute inset-0 pointer-events-none z-0"
        animate={{ 
          backgroundColor: activeHandsCount > 0 
            ? `rgba(0, 0, 0, ${0.3 + (activeHandsCount * 0.2)})` 
            : 'rgba(0, 0, 0, 0.2)',
        }}
        transition={{ duration: 0.3 }}
      />

      <canvas ref={canvasRef} className="absolute inset-0 z-30 pointer-events-none" />

      {/* Brutalist HUD */}
      <div className="absolute top-0 left-0 p-12 z-10 pointer-events-none">
        <h1 className="text-white text-8xl font-black tracking-tighter uppercase leading-none border-l-[16px] border-cyan-500 pl-10">
          Inertia <br /> Scanner
        </h1>
        <div className="mt-10 flex flex-col gap-4">
          <div className="flex items-center gap-8">
            <motion.div 
              animate={activeHandsCount > 0 ? { scale: [1, 1.4, 1], rotate: [0, 5, -5, 0] } : {}}
              transition={{ repeat: Infinity, duration: 1 }}
              className={`w-6 h-6 rounded-sm ${activeHandsCount > 0 ? 'bg-white shadow-[0_0_40px_white]' : 'bg-cyan-500'} transition-all duration-200`} 
            />
            <p className="text-cyan-500 font-mono text-xl tracking-[0.4em] uppercase font-bold">
              {activeHandsCount > 0 ? `DETECTED_${activeHandsCount}_STREAMS` : 'WAITING_FOR_SIGNAL'}
            </p>
          </div>
          <div className="flex gap-1">
            {[...Array(12)].map((_, i) => (
              <motion.div 
                key={i}
                animate={{ opacity: activeHandsCount > 0 ? [0.2, 1, 0.2] : 0.2 }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                className="w-4 h-1 bg-cyan-500" 
              />
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {bubbles.map((bubble) => (
          <motion.div
            key={bubble.id}
            initial={{ scale: 0, opacity: 0, x: bubble.x - 250, y: bubble.y }}
            animate={{ 
              scale: 1, 
              opacity: 1, 
              y: -window.innerHeight - 500,
              x: bubble.x - 250 + bubble.driftX,
              rotate: bubble.rotation,
              transition: {
                y: { duration: 18, ease: "linear" },
                x: { duration: 18, ease: "linear" },
                scale: { type: "spring", stiffness: 100, damping: 20 },
                opacity: { duration: 2 }
              }
            }}
            exit={{ opacity: 0, transition: { duration: 3 } }}
            className="absolute pointer-events-none z-20"
            style={{ width: '500px' }} 
          >
            <div className="bg-black/95 backdrop-blur-xl text-white border-4 border-cyan-500 p-10 shadow-[30px_30px_0px_0px_rgba(6,182,212,1)]">
              <p className="text-3xl font-black leading-tight uppercase tracking-tighter italic border-b-2 border-cyan-900 pb-4 mb-4">
                "{bubble.text}"
              </p>
              <div className="flex justify-between items-center font-mono text-[10px] text-cyan-500 uppercase tracking-widest">
                <span>Ref: Inertia_Point_Zero</span>
                <span>UUID: {bubble.id}</span>
              </div>
            </div>
            <div className="w-[1px] h-48 bg-cyan-500/10 mx-auto mt-4" />
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="absolute bottom-12 left-12 z-10 font-mono text-cyan-500 text-[10px] tracking-[0.3em] uppercase opacity-40 leading-relaxed pointer-events-none">
        <p>CORE: MULTI_HAND_ANALYSIS_ENABLED</p>
        <p>SENSOR: {activeHandsCount > 0 ? 'SIGNAL_LOCKED' : 'SCANNING_ENVIRONMENT'}</p>
        <p>TARGET: PEAK_GF_LAZINESS</p>
        <p>VERDICT: CRITICAL_INERTIA</p>
      </div>

      <div className="absolute bottom-12 right-12 z-10 font-mono text-white text-right pointer-events-none">
        <p className="text-xs uppercase tracking-widest opacity-60 mb-2">Dual Channel Confidence</p>
        <div className="w-80 h-3 bg-white/10 border border-white/20 p-[2px]">
          <motion.div 
            className={`h-full ${activeHandsCount > 0 ? 'bg-white shadow-[0_0_15px_white]' : 'bg-cyan-500'}`}
            animate={{ width: activeHandsCount > 0 ? (activeHandsCount === 2 ? '100%' : '50%') : '5%' }}
            transition={{ type: 'spring', stiffness: 80 }}
          />
        </div>
      </div>

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black">
          <div className="text-center">
            <div className="grid grid-cols-2 gap-4 mb-10">
              {[0, 1].map(i => (
                <motion.div 
                  key={i}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.5 }}
                  className="w-12 h-12 border-2 border-cyan-500"
                />
              ))}
            </div>
            <p className="text-white font-mono uppercase tracking-[0.8em] text-sm font-bold">Syncing Dual Sarcasm Units</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
