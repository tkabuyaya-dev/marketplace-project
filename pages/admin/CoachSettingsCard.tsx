/**
 * NUNULIA - Admin : contrôle du Coach vendeur
 *
 * Kill switch + fréquence max, appliqués en temps réel par la CF sellerCoach
 * (doc `appSettings/sellerCoach`, write admin autorisé par les rules
 * existantes). Affiche aussi le dernier passage et les envois par type.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, doc, getDoc, setDoc } from '../../services/firebase/constants';
import { useToast } from '../../components/Toast';

interface CoachSettings {
  enabled?: boolean;
  maxPerWeek?: number;
  lastRunAt?: number;
  lastCounts?: Record<string, number>;
}

const MOMENT_LABELS: Record<string, string> = {
  j1: '1er produit', j3: 'Vitrine', boost: 'Boost', studio: 'Studio', digest: 'Digest',
};

export const CoachSettingsCard: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [settings, setSettings] = useState<CoachSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'appSettings', 'sellerCoach'))
      .then(snap => setSettings(snap.exists() ? (snap.data() as CoachSettings) : {}))
      .catch(() => setSettings({}));
  }, []);

  const save = async (patch: Partial<CoachSettings>) => {
    if (!db || saving) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'appSettings', 'sellerCoach'), patch, { merge: true });
      setSettings(prev => ({ ...(prev ?? {}), ...patch }));
      toast(t('admin.coachSaved', 'Réglage Coach appliqué (effectif au prochain passage).'), 'success');
    } catch {
      toast(t('admin.coachSaveError', 'Échec de la sauvegarde.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const enabled = settings?.enabled !== false;
  const maxPerWeek = settings?.maxPerWeek ?? 2;
  const lastRun = settings?.lastRunAt
    ? new Date(settings.lastRunAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h3 className="text-white text-sm font-bold">✨ {t('admin.coachTitle', 'Coach vendeur')}</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {t('admin.coachDesc', 'Rappels intelligents (1er produit, boost, digest…) - cron quotidien 18h.')}
          </p>
        </div>
        <button
          onClick={() => save({ enabled: !enabled })}
          disabled={saving || settings === null}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 flex-shrink-0 ${
            enabled
              ? 'bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600 hover:text-white'
              : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
          }`}
        >
          {settings === null ? '…' : enabled ? t('admin.coachOn', 'Actif') : t('admin.coachOff', 'Désactivé')}
        </button>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <span className="text-[11px] text-gray-400 font-bold">
          {t('admin.coachMaxPerWeek', 'Max / semaine / vendeur')}
        </span>
        {[1, 2, 3].map(n => (
          <button
            key={n}
            onClick={() => save({ maxPerWeek: n })}
            disabled={saving || settings === null}
            className={`w-8 h-7 rounded-lg text-xs font-black border transition-colors disabled:opacity-50 ${
              maxPerWeek === n
                ? 'bg-gold-400 text-gray-900 border-gold-400'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10px] text-gray-500">
          {lastRun
            ? t('admin.coachLastRun', 'Dernier passage : {{date}}', { date: lastRun })
            : t('admin.coachNoRun', 'Aucun passage encore (cron quotidien à 18h)')}
        </span>
        {settings?.lastCounts && Object.entries(settings.lastCounts)
          .filter(([k, v]) => k !== 'skipped' && v > 0)
          .map(([k, v]) => (
            <span key={k} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
              {MOMENT_LABELS[k] ?? k} : {v}
            </span>
          ))}
      </div>
    </div>
  );
};
