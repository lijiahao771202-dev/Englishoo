
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SoundBallProps {
  isActive: boolean;
  mode: 'mic' | 'simulate' | 'idle';
  className?: string;
  analyser?: AnalyserNode | null;
}

export const SoundBall = ({ isActive, mode, className, analyser }: SoundBallProps) => {
  const [volume, setVolume] = useState(0);
  const animationRef = useRef<number | null>(null);
  
  // Internal audio context for 'simulate' mode only
  const internalContextRef = useRef<AudioContext | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (internalContextRef.current) internalContextRef.current.close();
    };
  }, []);

  // Initialize Audio Visualization
  useEffect(() => {
    if (!isActive || mode === 'idle') {
        setVolume(0);
        return;
    }

    let currentVolume = 0;

    // Case 1: External Analyser (Mic Mode)
    if (mode === 'mic' && analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const update = () => {
            analyser.getByteFrequencyData(dataArray);
            
            // Focus on vocal range (approx 300Hz - 3400Hz)
            // fftSize 32 -> bin size = 44100/32 = 1378Hz. Too coarse.
            // Assuming fftSize was set to 256 or similar elsewhere for better resolution. 
            // But ShadowingSession sets it to 32. 
            // With 32, we have 16 bins. Each bin is huge.
            // Just average all for now as it's visual only.
            
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const targetVolume = Math.min((avg / 128) * 2.0, 1.5); // Slightly less sensitive max
            
            // Smooth transition (Low pass filter)
            currentVolume += (targetVolume - currentVolume) * 0.2;
            
            setVolume(currentVolume); 
            animationRef.current = requestAnimationFrame(update);
        };
        update();
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }

    // Case 2: Simulate Mode (Teacher/Playback) - if no external analyser provided
    if (mode === 'simulate') {
         const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
         const ctx = new AudioCtx();
         internalContextRef.current = ctx;
         
         const internalAnalyser = ctx.createAnalyser();
         internalAnalyser.fftSize = 32;
         
         const osc = ctx.createOscillator();
         osc.frequency.setValueAtTime(150, ctx.currentTime); // Lower pitch for base
         const gain = ctx.createGain();
         gain.gain.value = 0; 
         osc.connect(gain);
         gain.connect(internalAnalyser);
         osc.start();
         
         // Simulate speech patterns
         const simulate = () => {
             if (internalContextRef.current?.state === 'closed') return;
             const now = ctx.currentTime;
             gain.gain.cancelScheduledValues(now);
             
             // More natural speech envelope
             if (Math.random() > 0.4) {
                  const dur = 0.2 + Math.random() * 0.4;
                  gain.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, now + 0.1);
                  gain.gain.linearRampToValueAtTime(0, now + dur);
             }
             setTimeout(simulate, 400);
         };
         simulate();

         const dataArray = new Uint8Array(internalAnalyser.frequencyBinCount);
         const update = () => {
             internalAnalyser.getByteFrequencyData(dataArray);
             const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
             
             const targetVolume = avg / 128;
             currentVolume += (targetVolume - currentVolume) * 0.15;
             
             setVolume(currentVolume); 
             animationRef.current = requestAnimationFrame(update);
         };
         update();
         
         return () => {
             if (animationRef.current) cancelAnimationFrame(animationRef.current);
             osc.stop();
             ctx.close();
         };
    }

  }, [isActive, mode, analyser]);

  // Dynamic styles
  const scale = 1 + volume * 0.5;
  
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
        {/* Liquid Core - Layer 1 (Deep) */}
        <motion.div
            animate={{
                scale: isActive ? [scale * 0.95, scale * 1.05, scale * 0.95] : 1,
                borderRadius: isActive 
                    ? ["45% 55% 60% 40% / 55% 45% 50% 50%", "50% 50% 55% 45% / 45% 55% 40% 60%", "45% 55% 60% 40% / 55% 45% 50% 50%"] 
                    : "50%",
                rotate: isActive ? [0, 120, 240, 360] : 0,
            }}
            transition={{
                duration: isActive ? 4 : 1,
                repeat: Infinity,
                ease: "linear",
                scale: { duration: 0.1, ease: "linear" } // Instant reaction
            }}
            style={{
                background: mode === 'mic' 
                    ? 'radial-gradient(circle at 30% 30%, rgba(34,211,238,0.9), rgba(59,130,246,0.8))'
                    : 'radial-gradient(circle at 30% 30%, rgba(192,132,252,0.9), rgba(236,72,153,0.8))',
                boxShadow: `0 0 ${30 + volume * 40}px ${mode === 'mic' ? 'rgba(6,182,212,0.5)' : 'rgba(168,85,247,0.5)'}`
            }}
            className="w-full h-full absolute inset-0 blur-[2px]"
        />
        
        {/* Liquid Core - Layer 2 (Surface Flow) */}
        <motion.div
            animate={{
                scale: isActive ? [scale, scale * 0.9, scale] : 1,
                borderRadius: isActive 
                    ? ["50% 50% 45% 55% / 50% 50% 60% 40%", "55% 45% 50% 50% / 40% 60% 50% 50%", "50% 50% 45% 55% / 50% 50% 60% 40%"] 
                    : "50%",
                rotate: isActive ? [360, 180, 0] : 0,
            }}
            transition={{
                duration: isActive ? 6 : 1,
                repeat: Infinity,
                ease: "linear",
                scale: { duration: 0.15, ease: "easeOut" }
            }}
            className={cn(
                "w-full h-full absolute inset-0 opacity-70 mix-blend-overlay",
                mode === 'mic' ? "bg-cyan-400" : "bg-purple-400"
            )}
        />

        {/* Glass Highlight / Reflection */}
        <div className="absolute inset-0 rounded-full overflow-hidden">
            <div className="absolute top-[15%] left-[15%] w-[30%] h-[15%] bg-white/40 blur-[4px] rounded-[100%] rotate-[-45deg]" />
            <div className="absolute bottom-[15%] right-[15%] w-[20%] h-[10%] bg-white/20 blur-[2px] rounded-[100%] rotate-[-45deg]" />
        </div>
        
        {/* Outer Ripple (Shockwave) */}
        {volume > 0.4 && (
             <motion.div
                initial={{ scale: 1, opacity: 0.6, borderWidth: 2 }}
                animate={{ scale: 2.5, opacity: 0, borderWidth: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={cn(
                    "absolute inset-0 rounded-full border-2",
                    mode === 'mic' ? "border-cyan-200" : "border-purple-200"
                )}
             />
        )}
    </div>
  );
};
