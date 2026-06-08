/**
 * NUNULIA — Voice Capture Button (voice-first listing)
 *
 * Le vendeur appuie pour enregistrer une note vocale décrivant son produit.
 * Au relâchement, l'audio part à la CF `transcribeListing` qui renvoie les
 * champs pré-remplis (titre, prix, catégorie…).
 *
 * Principes (alignés offline-first / dégradation propre) :
 *   - Si pas de MediaRecorder / getUserMedia → le bouton ne s'affiche pas
 *     (le clavier reste l'unique voie, rien n'est cassé).
 *   - Hors-ligne (navigator.onLine === false) → bouton désactivé + hint :
 *     la transcription exige le serveur. Le vendeur tape normalement.
 *   - Choix automatique du mimeType supporté (Android = webm/opus,
 *     iOS = mp4/aac). La CF gère les deux via autoDecodingConfig.
 *   - Auto-stop à 30s pour borner coût + taille.
 *
 * Le composant ne dépend d'aucun système de toast : il remonte le résultat
 * via onResult et les erreurs via onError, le parent décide de l'affichage.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import {
  transcribeVoiceListing,
  type VoiceListingResult,
  type VoiceListingError,
} from '../services/firebase/voice-listing';

interface Props {
  onResult: (data: VoiceListingResult) => void;
  onError?: (error: VoiceListingError) => void;
  countryId?: string;
  /** Désactive le bouton (ex: limite produits atteinte). */
  disabled?: boolean;
  label?: string;
}

const MAX_RECORDING_MS = 30_000;

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
function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

type Phase = 'idle' | 'recording' | 'processing';

export const VoiceCaptureButton: React.FC<Props> = ({
  onResult,
  onError,
  countryId,
  disabled,
  label = 'Décrire à la voix',
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Suivi online/offline pour griser le bouton hors-ligne.
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

  const startRecording = useCallback(async () => {
    if (phase !== 'idle' || disabled || !online) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.({ kind: 'invalid_input', message: 'mic_permission' });
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
      onError?.({ kind: 'service_unavailable' });
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

      // Garde-fou : enregistrement vide (clic trop court) → on annule sans appel réseau.
      if (blob.size < 1200) {
        setPhase('idle');
        onError?.({ kind: 'invalid_input', message: 'too_short' });
        return;
      }

      setPhase('processing');
      const res = await transcribeVoiceListing(blob, countryId);
      setPhase('idle');
      if (res.ok === false) {
        onError?.(res.error);
        return;
      }
      onResult(res.data);
    };

    recorder.start();
    setPhase('recording');

    // Auto-stop de sécurité.
    autoStopRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    }, MAX_RECORDING_MS);
  }, [phase, disabled, online, countryId, onResult, onError, cleanupStream]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const toggle = useCallback(() => {
    if (phase === 'recording') stopRecording();
    else startRecording();
  }, [phase, startRecording, stopRecording]);

  if (!isRecordingSupported()) return null;

  const isBusy = phase === 'processing';
  const isRecording = phase === 'recording';
  const isDisabled = disabled || !online || isBusy;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={isDisabled}
        aria-pressed={isRecording}
        className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full transition-transform active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${
          isRecording
            ? 'text-white bg-red-500'
            : 'text-goldDeep'
        }`}
        style={isRecording ? undefined : { background: 'rgba(245,200,66,0.15)' }}
      >
        {isBusy ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            Transcription…
          </>
        ) : isRecording ? (
          <>
            <Square size={11} className="fill-current" />
            <span className="inline-flex items-center gap-1">
              Arrêter
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            </span>
          </>
        ) : (
          <>
            <Mic size={12} /> {label}
          </>
        )}
      </button>
      {!online && (
        <span className="text-[10.5px] text-muted">Disponible en ligne</span>
      )}
    </div>
  );
};
