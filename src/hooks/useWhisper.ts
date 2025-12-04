
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * @description Hook for local Whisper ASR using Web Workers
 * Includes model loading state, progress tracking, and transcription
 */
export interface WhisperResult {
  text: string;
  chunks: { timestamp: [number, number]; text: string }[];
}

export function useWhisper() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ status: string; name: string; file: string; progress: number; loaded: number; total: number } | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!workerRef.current) {
      // Initialize worker
      workerRef.current = new Worker(new URL('../lib/workers/whisper.worker.ts', import.meta.url), {
        type: 'module'
      });

      workerRef.current.onmessage = (event) => {
        const { type, data } = event.data;
        switch (type) {
          case 'ready':
            setIsReady(true);
            setIsLoading(false);
            break;
          case 'download':
            setIsLoading(true);
            setProgress(data); // { status, name, file, progress, loaded, total }
            break;
          case 'result':
            setIsTranscribing(false);
            // Handle result via promise resolution (handled in transcribe method)
            break;
          case 'error':
            console.error('Whisper Worker Error:', data);
            setIsLoading(false);
            setIsTranscribing(false);
            break;
        }
      };
    }

    return () => {
      // Cleanup handled by browser usually, but we can terminate if needed
      // workerRef.current?.terminate();
    };
  }, []);

  const loadModel = useCallback(() => {
    if (workerRef.current && !isReady) {
      setIsLoading(true);
      workerRef.current.postMessage({ type: 'load' });
    }
  }, [isReady]);

  const transcribe = useCallback(async (audioBlob: Blob): Promise<WhisperResult> => {
    if (!workerRef.current || !isReady) {
      throw new Error('Whisper model not loaded');
    }

    setIsTranscribing(true);

    // Convert Blob to Float32Array at 16kHz
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const audioData = audioBuffer.getChannelData(0); // Float32Array
        
        // Cleanup context
        audioContext.close();

        return new Promise((resolve, reject) => {
            if (!workerRef.current) return reject('Worker lost');

            const handler = (event: MessageEvent) => {
                const { type, data } = event.data;
                if (type === 'result') {
                    workerRef.current?.removeEventListener('message', handler);
                    resolve(data);
                } else if (type === 'error') {
                    workerRef.current?.removeEventListener('message', handler);
                    reject(data);
                }
            };

            // We need to attach a temporary listener for this specific result
            // Note: This is a simple implementation. For concurrent requests, we'd need IDs.
            workerRef.current.addEventListener('message', handler);
            
            workerRef.current.postMessage({
                type: 'transcribe',
                data: { audio: audioData }
            });
        });
    } catch (e) {
        setIsTranscribing(false);
        throw e;
    }
  }, [isReady]);

  return {
    isReady,
    isLoading,
    progress,
    isTranscribing,
    loadModel,
    transcribe
  };
}
