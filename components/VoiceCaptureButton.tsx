/**
 * NUNULIA — Voice Capture Button (voice-first listing)
 *
 * Le vendeur appuie pour enregistrer une note vocale décrivant son produit.
 * Au relâchement, l'audio part à la CF `transcribeListing` qui renvoie les
 * champs pré-remplis (titre, prix, catégorie…).
 *
 * La mécanique d'enregistrement est dans useAudioRecorder (partagée avec la
 * voice search). Ce composant ne gère que l'appel transcription + l'UI.
 *
 * Dégradation : ne s'affiche pas si l'API micro est absente ; désactivé
 * hors-ligne (transcription = serveur). Le clavier reste toujours dispo.
 */

import React, { useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useAudioRecorder, type RecorderErrorReason } from '../hooks/useAudioRecorder';
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

export const VoiceCaptureButton: React.FC<Props> = ({
  onResult,
  onError,
  countryId,
  disabled,
  label = 'Décrire à la voix',
}) => {
  const handleAudio = useCallback(async (blob: Blob) => {
    const res = await transcribeVoiceListing(blob, countryId);
    if (res.ok === false) {
      onError?.(res.error);
      return;
    }
    onResult(res.data);
  }, [countryId, onResult, onError]);

  const handleRecorderError = useCallback((reason: RecorderErrorReason) => {
    if (reason === 'unsupported_recorder') {
      onError?.({ kind: 'service_unavailable' });
      return;
    }
    // 'mic_permission' | 'too_short' → message dédié côté parent.
    onError?.({ kind: 'invalid_input', message: reason });
  }, [onError]);

  const { phase, online, isSupported, toggle } = useAudioRecorder({
    onAudio: handleAudio,
    onError: handleRecorderError,
  });

  if (!isSupported) return null;

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
          isRecording ? 'text-white bg-red-500' : 'text-goldDeep'
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
