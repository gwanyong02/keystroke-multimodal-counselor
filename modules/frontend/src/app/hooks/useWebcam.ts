import { useEffect, useState, useRef } from 'react';

interface UseWebcamResult {
  stream: MediaStream | null;
  error: string | null;
  isLoading: boolean;
}

export function useWebcam(): UseWebcamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function initWebcam() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (mounted.current) {
          setStream(mediaStream);
          setError(null);
          setIsLoading(false);
          console.log('[Webcam] Stream initialized successfully');
        } else {
          // Component unmounted, stop tracks
          mediaStream.getTracks().forEach((track) => track.stop());
        }
      } catch (err) {
        if (mounted.current) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to access webcam';
          setError(errorMessage);
          setIsLoading(false);
          console.error('[Webcam] Failed to initialize:', err);
        }
      }
    }

    initWebcam();

    return () => {
      mounted.current = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        console.log('[Webcam] Stream stopped');
      }
    };
  }, []);

  return { stream, error, isLoading };
}
