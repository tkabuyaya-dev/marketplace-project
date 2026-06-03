/**
 * NUNULIA — Admin: Photo Studio
 *
 * Onglet de gestion de la file Nunulia Studio. C'est ici que le fondateur (ou
 * un éditeur photo délégué) traite manuellement les sessions :
 *
 *   1. Voit la file temps réel des sessions par status (Tous / En attente /
 *      En traitement / Prêtes / Publiées / Expirées)
 *   2. Sélectionne une session → ouvre le panneau de détail à droite
 *   3. Clique "Marquer en traitement" → tracker vendeur passe à 🔄 en realtime
 *   4. Uploade les photos traitées via Cloudinary (drag-drop, max 5)
 *   5. Clique "Envoyer le lien" → Vision Haiku tourne, notif envoyée au vendeur,
 *      message WhatsApp auto-copié dans le presse-papier
 *
 * Sécurité : toutes les écritures passent par les CFs admin SDK (cf. Phase 2).
 * Aucune mutation directe Firestore depuis ce composant.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Camera, Clock, Upload, Send, Image as ImageIcon, X as XIcon, Check,
  Phone, AlertCircle, RefreshCw, ChevronRight, ExternalLink, Copy,
  Loader2,
} from 'lucide-react';
import { PhotoSession, PhotoSessionStatus } from '../../types';
import { buildWaUrl } from '../../config/whatsapp.config';
import {
  subscribeToStudioQueueForAdmin,
  subscribeToPhotoSession,
  adminSetSessionProcessing,
  adminAttachSessionPhotos,
} from '../../services/firebase/photo-sessions';
import { uploadImages, UploadError, getOptimizedUrl } from '../../services/cloudinary';
import { useToast } from '../../components/Toast';
import { AdminSharedProps } from './types';
import { getCountryFlag, INITIAL_COUNTRIES } from '../../constants';

// ─── Constantes UI ────────────────────────────────────────────────────────

const MAX_PHOTOS = 5;
const CLOUDINARY_FOLDER = 'aurabuja-app-2026/studio';

const STATUS_COLORS: Record<PhotoSessionStatus, string> = {
  waiting_photos: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  processing:     'bg-blue-500/20 text-blue-300 border-blue-500/30',
  ready:          'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  published:      'bg-purple-500/20 text-purple-300 border-purple-500/30',
  expired:        'bg-gray-700/40 text-gray-500 border-gray-600/30',
};

const STATUS_LABELS: Record<PhotoSessionStatus, string> = {
  waiting_photos: '⏳ En attente',
  processing:     '🔄 En traitement',
  ready:          '✨ Prêtes',
  published:      '✅ Publié',
  expired:        '⌛ Expiré',
};

type StatusFilter = PhotoSessionStatus | 'active' | 'all';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'active',         label: 'À traiter' },
  { id: 'waiting_photos', label: '⏳ En attente' },
  { id: 'processing',     label: '🔄 En traitement' },
  { id: 'ready',          label: '✨ Prêtes' },
  { id: 'published',      label: '✅ Publiées' },
  { id: 'expired',        label: '⌛ Expirées' },
  { id: 'all',            label: 'Toutes' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function formatCountdown(expiresAt: number): { text: string; tone: 'red' | 'orange' | 'green' | 'gray' } {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return { text: 'Expiré', tone: 'red' };
  const hours = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);
  let text: string;
  if (hours >= 1) text = `Expire dans ${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  else text = `Expire dans ${mins}min`;
  if (hours < 2)  return { text, tone: 'red' };
  if (hours < 8)  return { text, tone: 'orange' };
  if (hours < 24) return { text, tone: 'green' };
  return { text, tone: 'gray' };
}

function countryName(countryId: string): string {
  const c = INITIAL_COUNTRIES.find(x => x.id === countryId);
  return c ? `${getCountryFlag(c)} ${c.name}` : countryId.toUpperCase();
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return phone || '—';
  return phone.slice(0, 6) + '***' + phone.slice(-3);
}

// ─── Sub-component: StudioMetrics ─────────────────────────────────────────

const StudioMetrics: React.FC<{ sessions: PhotoSession[] }> = ({ sessions }) => {
  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return {
      waiting:        sessions.filter(s => s.status === 'waiting_photos').length,
      processing:     sessions.filter(s => s.status === 'processing').length,
      ready:          sessions.filter(s => s.status === 'ready').length,
      publishedToday: sessions.filter(s => s.status === 'published'
        && (s.publishedAt ?? 0) >= todayMs).length,
    };
  }, [sessions]);

  const cards = [
    { label: 'En attente', value: stats.waiting,        color: 'text-yellow-300' },
    { label: 'À traiter',   value: stats.processing,     color: 'text-blue-300'   },
    { label: 'À envoyer',   value: stats.ready,          color: 'text-emerald-300' },
    { label: 'Publié auj.', value: stats.publishedToday, color: 'text-purple-300' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 font-bold uppercase mb-1">{c.label}</p>
          <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
};

// ─── Sub-component: SessionRow ────────────────────────────────────────────

const SessionRow: React.FC<{
  session: PhotoSession;
  selected: boolean;
  onClick: () => void;
}> = ({ session, selected, onClick }) => {
  const countdown = formatCountdown(session.expiresAt);
  const countdownColor =
    countdown.tone === 'red'    ? 'text-red-400'
    : countdown.tone === 'orange' ? 'text-orange-400'
    : countdown.tone === 'green' ? 'text-emerald-400'
    : 'text-gray-500';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 border rounded-lg transition-all ${
        selected
          ? 'bg-gray-700/60 border-gold-500/50 shadow-lg shadow-gold-900/20'
          : 'bg-gray-800/40 border-gray-700/40 hover:bg-gray-700/40 hover:border-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold text-gold-400">#{session.id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${STATUS_COLORS[session.status]}`}>
              {STATUS_LABELS[session.status]}
            </span>
          </div>
          <p className="text-sm font-semibold text-white truncate">{session.vendorName || 'Vendeur'}</p>
          <p className="text-xs text-gray-500 truncate">{countryName(session.countryId)} · {session.plan}</p>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-gray-500">{formatRelativeTime(session.createdAt)}</span>
            {session.status !== 'published' && session.status !== 'expired' && (
              <span className={`text-[10px] font-bold ${countdownColor}`}>{countdown.text}</span>
            )}
          </div>
        </div>
        <ChevronRight size={16} className={selected ? 'text-gold-400' : 'text-gray-600'} />
      </div>
    </button>
  );
};

// ─── Sub-component: PhotoUploadArea ───────────────────────────────────────

interface UploadState {
  files: File[];
  previews: string[];
  uploading: boolean;
  progress: { uploaded: number; total: number };
  error: string | null;
}

const PhotoUploadArea: React.FC<{
  state: UploadState;
  onAddFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
}> = ({ state, onAddFiles, onRemove }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    onAddFiles(Array.from(files));
  }, [onAddFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-gold-500 bg-gold-500/5'
            : 'border-gray-600 hover:border-gray-500 bg-gray-800/30'
        } ${state.uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Upload size={32} className="mx-auto mb-2 text-gray-500" />
        <p className="text-sm font-bold text-gray-300">Déposer les photos traitées ici</p>
        <p className="text-xs text-gray-500 mt-1">
          ou cliquer pour choisir — max {MAX_PHOTOS} photos, JPG/PNG/WebP, 10MB max chacune
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {state.uploading && (
        <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-lg p-2">
          <Loader2 size={14} className="animate-spin" />
          Upload Cloudinary {state.progress.uploaded}/{state.progress.total}…
        </div>
      )}
      {state.error && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {state.error}
        </div>
      )}

      {state.previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {state.previews.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-700">
              <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                aria-label="Retirer"
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Sub-component: SessionDetailPanel ────────────────────────────────────

const SessionDetailPanel: React.FC<{
  sessionId: string;
  onClose: () => void;
}> = ({ sessionId, onClose }) => {
  const { toast } = useToast();
  const [session, setSession] = useState<PhotoSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // State machine actions
  const [marking, setMarking] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [attaching, setAttaching] = useState(false);

  // Upload state
  const [upload, setUpload] = useState<UploadState>({
    files: [],
    previews: [],
    uploading: false,
    progress: { uploaded: 0, total: 0 },
    error: null,
  });

  // Realtime listener sur la session sélectionnée
  useEffect(() => {
    if (!sessionId) return;
    setHydrated(false);
    const unsub = subscribeToPhotoSession(sessionId, (s) => {
      setSession(s);
      setHydrated(true);
    });
    return unsub;
  }, [sessionId]);

  // Reset upload state quand on change de session
  useEffect(() => {
    setUpload({ files: [], previews: [], uploading: false, progress: { uploaded: 0, total: 0 }, error: null });
    setInternalNote('');
  }, [sessionId]);

  const handleAddFiles = useCallback((newFiles: File[]) => {
    const filtered = newFiles.filter(f => f.type.startsWith('image/'));
    if (filtered.length === 0) {
      setUpload(s => ({ ...s, error: 'Aucune image valide sélectionnée.' }));
      return;
    }
    const total = upload.files.length + filtered.length;
    if (total > MAX_PHOTOS) {
      setUpload(s => ({ ...s, error: `Maximum ${MAX_PHOTOS} photos par session.` }));
      return;
    }
    // Generate object URLs for previews
    const newPreviews = filtered.map(f => URL.createObjectURL(f));
    setUpload(s => ({
      ...s,
      files: [...s.files, ...filtered],
      previews: [...s.previews, ...newPreviews],
      error: null,
    }));
  }, [upload.files.length]);

  const handleRemoveFile = useCallback((index: number) => {
    setUpload(s => {
      // Revoke object URL pour libérer la mémoire
      const removedPreview = s.previews[index];
      if (removedPreview?.startsWith('blob:')) URL.revokeObjectURL(removedPreview);
      return {
        ...s,
        files: s.files.filter((_, i) => i !== index),
        previews: s.previews.filter((_, i) => i !== index),
      };
    });
  }, []);

  // Cleanup object URLs au démontage
  useEffect(() => {
    return () => {
      upload.previews.forEach(p => p.startsWith('blob:') && URL.revokeObjectURL(p));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleMarkProcessing = async () => {
    if (!session || marking) return;
    setMarking(true);
    try {
      const res = await adminSetSessionProcessing(session.id);
      if (res.status === 'already_advanced') {
        toast('Session déjà au stade ultérieur', 'info');
      } else {
        toast('Session marquée en traitement', 'success');
      }
    } catch (err: any) {
      toast(err?.message || 'Échec marquage', 'error');
    } finally {
      setMarking(false);
    }
  };

  const handleAttach = async () => {
    if (!session || attaching) return;
    if (upload.files.length === 0) {
      toast('Sélectionnez au moins 1 photo', 'error');
      return;
    }
    setAttaching(true);
    setUpload(s => ({ ...s, uploading: true, error: null, progress: { uploaded: 0, total: upload.files.length } }));

    try {
      // 1. Upload Cloudinary séquentiel (déjà géré par uploadImages avec retry)
      const urls = await uploadImages(
        upload.files,
        { folder: CLOUDINARY_FOLDER },
        (uploaded, total) => setUpload(s => ({ ...s, progress: { uploaded, total } })),
      );

      setUpload(s => ({ ...s, uploading: false }));

      // 2. Appel CF photoSessionAttach
      const res = await adminAttachSessionPhotos({
        sessionId: session.id,
        processedUrls: urls,
        rawPhotoCount: upload.files.length,
        internalNote: internalNote.trim() || undefined,
      });

      // 3. Auto-copy WhatsApp message
      try {
        await navigator.clipboard.writeText(res.whatsappMessageTemplate);
        toast(
          res.visionApplied
            ? 'Lien envoyé. Vision IA appliquée. Message WhatsApp copié.'
            : 'Lien envoyé. Message WhatsApp copié dans le presse-papier.',
          'success'
        );
      } catch {
        toast('Lien envoyé. Copiez le message WhatsApp manuellement.', 'success');
      }

      // 4. Reset upload state (les photos sont maintenant dans session.processedUrls)
      upload.previews.forEach(p => p.startsWith('blob:') && URL.revokeObjectURL(p));
      setUpload({ files: [], previews: [], uploading: false, progress: { uploaded: 0, total: 0 }, error: null });
      setInternalNote('');
    } catch (err: any) {
      setUpload(s => ({ ...s, uploading: false }));
      if (err instanceof UploadError) {
        const msg = err.kind === 'network' || err.kind === 'timeout'
          ? 'Échec réseau Cloudinary. Réessayez.'
          : err.kind === 'validation'
          ? err.message
          : 'Erreur upload.';
        setUpload(s => ({ ...s, error: msg }));
        toast(msg, 'error');
      } else {
        const msg = err?.message || 'Échec de l\'envoi du lien';
        toast(msg, 'error');
      }
    } finally {
      setAttaching(false);
    }
  };

  const handleCopyMagicLink = async () => {
    if (!session) return;
    const link = `https://nunulia.com/studio/${session.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié', 'success');
    } catch {
      toast('Copie impossible', 'error');
    }
  };

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gold-400" size={24} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center text-gray-500 py-16">
        <AlertCircle size={32} className="mx-auto mb-2" />
        <p className="text-sm">Session introuvable ou non accessible.</p>
        <button onClick={onClose} className="mt-3 text-xs text-gold-400 hover:underline">Retour</button>
      </div>
    );
  }

  const countdown = formatCountdown(session.expiresAt);
  const canStartProcessing = session.status === 'waiting_photos';
  const canAttach = session.status === 'waiting_photos' || session.status === 'processing' || session.status === 'ready';
  const isTerminal = session.status === 'published' || session.status === 'expired';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-gray-500">SESSION</p>
          <p className="font-mono text-xl font-black text-gold-400">#{session.id}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Fermer">
          <XIcon size={18} />
        </button>
      </div>

      {/* Status + countdown */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded border font-bold ${STATUS_COLORS[session.status]}`}>
          {STATUS_LABELS[session.status]}
        </span>
        {!isTerminal && (
          <span className={`text-xs font-semibold ${
            countdown.tone === 'red' ? 'text-red-400'
            : countdown.tone === 'orange' ? 'text-orange-400'
            : countdown.tone === 'green' ? 'text-emerald-400'
            : 'text-gray-500'
          }`}>
            <Clock size={12} className="inline mr-1" />{countdown.text}
          </span>
        )}
        <span className="text-xs text-gray-500">Créée {formatRelativeTime(session.createdAt)}</span>
      </div>

      {/* Vendor info */}
      <div className="bg-gray-800/40 border border-gray-700/40 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-white">{session.vendorName}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-400 font-bold uppercase">
            {session.plan}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>{countryName(session.countryId)}</span>
          {session.vendorPhone && (
            <a
              href={buildWaUrl(undefined, { phone: session.vendorPhone })}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-emerald-400"
              title={session.vendorPhone}
            >
              <Phone size={12} /> {maskPhone(session.vendorPhone)}
            </a>
          )}
        </div>
      </div>

      {/* Existing processed photos (si status === ready ou published) */}
      {session.processedUrls.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">
            Photos traitées ({session.processedUrls.length})
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {session.processedUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-lg overflow-hidden bg-gray-700 hover:opacity-80 transition-opacity"
              >
                <img src={getOptimizedUrl(url, 300)} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Vision suggestions preview */}
      {session.visionSuggestions && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
          <p className="text-xs font-bold text-purple-300 uppercase mb-2">✨ Pré-rempli par Claude Vision</p>
          <div className="space-y-1 text-xs text-gray-300">
            {session.visionSuggestions.title && (
              <p><span className="text-gray-500">Titre :</span> <span className="text-white">{session.visionSuggestions.title}</span></p>
            )}
            {session.visionSuggestions.category && (
              <p><span className="text-gray-500">Catégorie :</span> <span className="text-white">{session.visionSuggestions.category}</span></p>
            )}
            {session.visionSuggestions.condition && (
              <p><span className="text-gray-500">État :</span> <span className="text-white">{session.visionSuggestions.condition}</span></p>
            )}
            {session.visionSuggestions.characteristics && session.visionSuggestions.characteristics.length > 0 && (
              <p>
                <span className="text-gray-500">Caractéristiques :</span>{' '}
                <span className="text-white">{session.visionSuggestions.characteristics.join(', ')}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Published — show product link */}
      {session.status === 'published' && session.publishedProductId && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <p className="text-xs font-bold text-emerald-300 mb-1">✅ Produit publié</p>
          <p className="text-[10px] text-gray-500 mb-2">
            Publié {formatRelativeTime(session.publishedAt || 0)} · en attente d'approbation
          </p>
          <a
            href={`/admin?tab=products&search=${encodeURIComponent(session.vendorName)}`}
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
          >
            Voir dans onglet Produits <ExternalLink size={10} />
          </a>
        </div>
      )}

      {/* Expired */}
      {session.status === 'expired' && (
        <div className="bg-gray-700/30 border border-gray-600/30 rounded-lg p-3 text-center">
          <Clock size={20} className="mx-auto mb-1 text-gray-500" />
          <p className="text-xs text-gray-400">Cette session a expiré sans être publiée.</p>
          <p className="text-[10px] text-gray-500 mt-1">Le vendeur peut en démarrer une nouvelle.</p>
        </div>
      )}

      {/* Actions */}
      {!isTerminal && (
        <div className="space-y-3 pt-2 border-t border-gray-700/40">
          {/* Action 1: Mark processing */}
          {canStartProcessing && (
            <button
              type="button"
              onClick={handleMarkProcessing}
              disabled={marking}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-sm font-bold hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              {marking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Marquer en traitement
            </button>
          )}

          {/* Action 2: Upload + attach */}
          {canAttach && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase">
                {session.processedUrls.length > 0 ? 'Re-uploader des photos' : 'Uploader les photos traitées'}
              </p>
              <PhotoUploadArea state={upload} onAddFiles={handleAddFiles} onRemove={handleRemoveFile} />

              <div>
                <label htmlFor="internal-note" className="block text-xs font-bold text-gray-400 uppercase mb-1.5">
                  Note interne (optionnel)
                </label>
                <textarea
                  id="internal-note"
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value.slice(0, 500))}
                  placeholder="Remarques internes (jamais visibles par le vendeur)"
                  rows={2}
                  className="w-full bg-gray-800/50 border border-gray-700/40 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-gold-500/50 focus:outline-none"
                  maxLength={500}
                />
                {internalNote.length > 0 && (
                  <p className="text-[10px] text-gray-500 text-right mt-0.5">{internalNote.length}/500</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleAttach}
                disabled={attaching || upload.files.length === 0}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-gold-500 text-black text-sm font-black hover:bg-gold-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-gold-900/20"
              >
                {attaching ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {attaching ? 'Envoi en cours…' : 'Envoyer le lien au vendeur'}
              </button>
              <p className="text-[10px] text-gray-500 text-center">
                Le message WhatsApp sera automatiquement copié dans le presse-papier.
              </p>
            </div>
          )}

          {/* Action 3: Re-copy magic link if ready */}
          {session.status === 'ready' && (
            <button
              type="button"
              onClick={handleCopyMagicLink}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-700/40 border border-gray-600/40 text-gray-300 text-xs font-bold hover:bg-gray-700/60 transition-colors"
            >
              <Copy size={12} /> Re-copier le lien magique
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────

export const PhotoStudio: React.FC<AdminSharedProps> = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sessions, setSessions] = useState<PhotoSession[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Realtime queue
  useEffect(() => {
    setHydrated(false);
    const unsub = subscribeToStudioQueueForAdmin(statusFilter, (data) => {
      setSessions(data);
      setHydrated(true);
    }, 100);
    return unsub;
  }, [statusFilter]);

  // Si la session sélectionnée disparaît du filtre, on garde sa sélection
  // (l'utilisateur peut vouloir terminer son action). Pas de désélection auto.

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header + metrics */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Camera size={20} className="text-gold-400" /> Photo Studio
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            File des sessions Nunulia Studio · transitions via Cloud Functions (admin SDK)
          </p>
        </div>
        <span className="text-xs text-gray-500 hidden sm:inline">
          {hydrated ? `${sessions.length} session(s)` : 'Chargement…'}
        </span>
      </div>

      <StudioMetrics sessions={sessions} />

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {STATUS_FILTERS.map(f => {
          const active = statusFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-gold-500 text-black shadow-lg shadow-gold-900/20'
                  : 'bg-gray-800/50 border border-gray-700/40 text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Layout: Queue + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Queue */}
        <div className={`lg:col-span-1 space-y-2 ${selectedId ? 'hidden lg:block' : ''}`}>
          {!hydrated && (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <Loader2 className="animate-spin" size={20} />
            </div>
          )}
          {hydrated && sessions.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">
              <Camera size={28} className="mx-auto mb-2 opacity-50" />
              Aucune session pour ce filtre.
            </div>
          )}
          {sessions.map(s => (
            <SessionRow
              key={s.id}
              session={s}
              selected={selectedId === s.id}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className={`lg:col-span-2 ${selectedId ? '' : 'hidden lg:block'}`}>
          {selectedId ? (
            <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl p-4">
              <SessionDetailPanel
                sessionId={selectedId}
                onClose={() => setSelectedId(null)}
              />
            </div>
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-800/20 border border-dashed border-gray-700/40 rounded-xl">
              <Camera size={32} className="mb-2 opacity-50" />
              <p className="text-sm">Sélectionnez une session</p>
              <p className="text-xs mt-1">Cliquez une ligne dans la file pour voir les détails</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoStudio;
