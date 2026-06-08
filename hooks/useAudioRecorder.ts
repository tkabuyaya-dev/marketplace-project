/**
 * NUNULIA — useAudioRecorder
 *
 * Encapsule la capture audio (MediaRecorder) partagée par le voice-first
 * listing (SellerDashboard) et la voice search (SearchOverlay).
 *
 * Responsabilités :
 *   - Détection du support (getUserMedia + MediaRecorder) → `isSupported`
 *   - Suivi online/offline (la transcription exige le serveur) → `online`
 *   - Choix du mimeType supporté (Android webm/opus, iOS mp4/aac)
 *   - Démarrage/arrêt, auto-stop de sécurité, nettoyage du micro au démontage
 *   - Phase d'UI : 'idle' → 'recording' → 'processing' (pendant `onAudio`)
 *
 * Le consommateur fournit `onAudio(blob)` (async) : le hook bascule en
 * 'processing' le temps de cette promesse, puis revient en 'idle'.
 * Les échecs de capture (permission refusée, clip trop court) remontent via
 * `onError(reason)` — le consommateur décide du message.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type RecorderPhase = 'idle' | 'recording' | 'processing';
export type RecorderErrorReason = 'mic_permission' | 'too_short' | 'unsupported_recorder';

interface UseAudioRecorderOptions {
  /** Appelé avec l'audio capturé. Le hook reste en 'processing' tant que la promesse n'est pas résolue. */
  onAudio: (blob: Blob) => Promise<void> | void;
  /** Échecs de capture (avant tout appel réseau). */
  onError?: (reason: RecorderErrorReason) => void;
  /** Durée max d'enregistrement avant auto-stop (défaut 30s). */
  maxMs?: number;
  /** Taille mini d'un clip valide en octets (sous ce seuil = 'too_short'). */
  minBytes?: number;
}

/** Le premier mimeType supporté par MediaRecorder dans cet environnement. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* ignore */
    }
  }
  return undefined; // laisse le navigateur choisir son défaut
}

/** L'API d'enregistrement est-elle disponible ? */
export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function useAudioRecorder(options: UseAudioRecorderOptions) {
  const { maxMs = 30_000, minBytes = 1200 } = options;
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Refs pour que les callbacks voient toujours les dernières valeurs.
  const onAudioRef = useRef(options.onAudio);
  const onErrorRef = useRef(options.onError);
  useEffect(() => { onAudioRef.current = options.onAudio; }, [options.onAudio]);
  useEffect(() => { onErrorRef.current = options.onError; }, [options.onError]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const cleanupStream = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Stop des pistes au démontage (libère le micro si l'utilisateur navigue).
  useEffect(() => cleanupStream, [cleanupStream]);

  const start = useCallback(async () => {
    if (phase !== 'idle' || !online) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onErrorRef.current?.('mic_permission');
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      cleanupStream();
      onErrorRef.current?.('unsupported_recorder');
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      cleanupStream();
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];

      if (blob.size < minBytes) {
        setPhase('idle');
        onErrorRef.current?.('too_short');
        return;
      }

      setPhase('processing');
      try {
        await onAudioRef.current(blob);
      } finally {
        setPhase('idle');
      }
    };

    recorder.start();
    setPhase('recording');

    autoStopRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    }, maxMs);
  }, [phase, online, cleanupStream, maxMs, minBytes]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const toggle = useCallback(() => {
    if (phase === 'recording') stop();
    else start();
  }, [phase, start, stop]);

  return {
    phase,
    online,
    isSupported: isRecordingSupported(),
    toggle,
    start,
    stop,
  };
}
