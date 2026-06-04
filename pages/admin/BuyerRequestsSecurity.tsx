/**
 * NUNULIA — Admin: Sécurité Demandes Clients
 *
 * Dashboard de pilotage du système de confirmation et anti-abus :
 *  • KPI : demandes pending, suspects, abus signalés, devices bloqués
 *  • Alertes prioritaires : devices multi-numéros, abus signalés
 *  • Liste demandes pending_confirmation (score, expiration)
 *  • Liste devices récents (statut, totaux, dernière IP)
 *  • Blocklist active
 *
 * Lecture seule pour le moment — toutes les actions d'écriture
 * (blocklist manuel, score override) passeront par des callables admin
 * dédiées dans une itération ultérieure.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  getPendingConfirmationRequests,
  getAbuseReportedRequests,
  getRecentDevices,
  getBlocklist,
  detectMultiNumberAlerts,
  adminConfirmBuyerRequest,
  adminSignalBuyerRequest,
} from '../../services/firebase/security-buyer-requests';
import { AdminSharedProps } from './types';
import type {
  BuyerRequest,
  DeviceBlock,
  DeviceFingerprint,
} from '../../types';

interface SecState {
  pending: BuyerRequest[];
  abuse: BuyerRequest[];
  devices: DeviceFingerprint[];
  blocklist: DeviceBlock[];
}

const formatDate = (ts: number) => new Date(ts).toLocaleString('fr-FR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const minutesUntil = (ts: number): number => Math.max(0, Math.ceil((ts - Date.now()) / 60000));

function scoreColor(score: number | undefined): string {
  if (score === undefined) return 'bg-gray-700/40 text-gray-400';
  if (score >= 70) return 'bg-green-500/20 text-green-300 border-green-500/30';
  if (score >= 40) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  return 'bg-red-500/20 text-red-300 border-red-500/30';
}

function statusColor(status: string): string {
  switch (status) {
    case 'normal':  return 'bg-gray-700/40 text-gray-300';
    case 'watched': return 'bg-orange-500/20 text-orange-300';
    case 'blocked': return 'bg-red-500/20 text-red-300';
    default: return 'bg-gray-700/40 text-gray-300';
  }
}

export const BuyerRequestsSecurity: React.FC<AdminSharedProps> = () => {
  const [data, setData] = useState<SecState>({
    pending: [], abuse: [], devices: [], blocklist: [],
  });
  const [loading, setLoading] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const showFlash = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleActivate = async (requestId: string) => {
    if (!confirm('Activer cette demande ? Le numéro WhatsApp émetteur a-t-il bien été vérifié ?')) return;
    setActingId(requestId);
    try {
      const res = await adminConfirmBuyerRequest(requestId);
      if (res.alreadyConfirmed) {
        showFlash('⏩ Demande déjà confirmée.');
      } else {
        showFlash('✅ Demande activée — visible par les vendeurs.');
      }
      // Retire de la liste pending optimistically
      setData(d => ({ ...d, pending: d.pending.filter(r => r.id !== requestId) }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showFlash(`❌ Échec activation : ${msg}`);
    } finally {
      setActingId(null);
    }
  };

  const handleSignal = async (requestId: string) => {
    if (!confirm('Signaler comme abus ? La demande sera suspendue et le device pourra être blacklisté.')) return;
    setActingId(requestId);
    try {
      const res = await adminSignalBuyerRequest(requestId);
      if (res.alreadyHandled) {
        showFlash('⏩ Déjà traitée.');
      } else {
        showFlash('🛡️ Demande suspendue + abus enregistré.');
      }
      setData(d => ({ ...d, pending: d.pending.filter(r => r.id !== requestId) }));
      // Rafraîchit la blocklist (peut avoir basculé en auto)
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showFlash(`❌ Échec signalement : ${msg}`);
    } finally {
      setActingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      // Promise.allSettled (et non Promise.all) : si une query échoue
      // (ex: index Firestore en cours de build), les autres sections
      // continuent de s'afficher au lieu de tout faire tomber à 0.
      const results = await Promise.allSettled([
        getPendingConfirmationRequests(),
        getAbuseReportedRequests(7),
        getRecentDevices(7),
        getBlocklist(),
      ]);
      const pick = <T,>(idx: number, fallback: T): T =>
        results[idx].status === 'fulfilled'
          ? (results[idx] as PromiseFulfilledResult<T>).value
          : (console.warn('[Security dashboard] query failed:',
              (results[idx] as PromiseRejectedResult).reason), fallback);
      setData({
        pending:   pick<BuyerRequest[]>(0, []),
        abuse:     pick<BuyerRequest[]>(1, []),
        devices:   pick<DeviceFingerprint[]>(2, []),
        blocklist: pick<DeviceBlock[]>(3, []),
      });
      setLastLoaded(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const multiNumberAlerts = useMemo(
    () => detectMultiNumberAlerts(data.pending.concat(data.abuse)),
    [data.pending, data.abuse],
  );

  const blockedCount = data.blocklist.filter(b =>
    b.expiresAt === null || (b.expiresAt && b.expiresAt > Date.now())
  ).length;

  // ── Vue dossier device ────────────────────────────────────────────
  if (selectedDeviceId) {
    const device = data.devices.find(d => d.deviceId === selectedDeviceId);
    const requestsForDevice = data.pending
      .concat(data.abuse)
      .filter(r => r.deviceId === selectedDeviceId);
    return (
      <DeviceFileView
        deviceId={selectedDeviceId}
        device={device}
        requests={requestsForDevice}
        blocked={data.blocklist.find(b => b.deviceId === selectedDeviceId)}
        onBack={() => setSelectedDeviceId(null)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {actionMessage && (
        <div className="bg-gold-400/10 border border-gold-400/30 text-gold-200 text-sm font-bold px-4 py-3 rounded-xl">
          {actionMessage}
        </div>
      )}

      {/* Mémo procédure manuelle (Option C) */}
      <div className="bg-blue-950/30 border border-blue-700/30 rounded-xl px-4 py-3 text-xs text-blue-200/80 leading-relaxed">
        <p className="font-bold text-blue-300 mb-1">📋 Procédure activation manuelle</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>Ouvrir WhatsApp Business Nunulia <span className="font-mono text-blue-300">+257 61 65 30 00</span></li>
          <li>Repérer le message <em>« Je confirme ma demande … »</em> du buyer</li>
          <li>Vérifier que <strong>le numéro WhatsApp émetteur</strong> correspond au numéro déclaré dans la demande pending ci-dessous</li>
          <li>Si OK → cliquer <strong>✅ Activer</strong>. Si NON (usurpation) → cliquer <strong>🛡️ Suspendre</strong></li>
        </ol>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'En attente confirmation', value: data.pending.length, color: 'orange' },
          { label: '🚨 Abus signalés (7j)', value: data.abuse.length, color: 'red' },
          { label: 'Devices vus (7j)', value: data.devices.length, color: 'blue' },
          { label: '🚫 Blacklist active', value: blockedCount, color: 'red' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 text-center">
            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{s.label}</p>
            <p className="text-2xl font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {lastLoaded && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Dernière MAJ : {formatDate(lastLoaded)}</span>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg disabled:opacity-50"
          >
            {loading ? '...' : '↻ Actualiser'}
          </button>
        </div>
      )}

      {/* Alertes prioritaires */}
      {multiNumberAlerts.length > 0 && (
        <section className="bg-red-950/30 border border-red-700/40 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-red-300 mb-3 flex items-center gap-2">
            🚨 Alertes 🔴 — Devices multi-numéros (24h)
            <span className="text-[10px] text-red-400">{multiNumberAlerts.length} cas</span>
          </h2>
          <div className="space-y-2">
            {multiNumberAlerts.slice(0, 10).map(a => (
              <div key={a.deviceId} className="bg-red-900/20 border border-red-800/40 rounded-xl px-3 py-2 flex items-center gap-3">
                <span className="text-xl shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-red-200 truncate">
                    {a.deviceId}
                  </p>
                  <p className="text-[11px] text-red-300/80 mt-0.5">
                    {a.whatsappNumbers.length} numéros · {a.count} demandes · {a.ip || 'no IP'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDeviceId(a.deviceId)}
                  className="text-[11px] text-red-200 border border-red-500/40 hover:bg-red-900/40 px-3 py-1 rounded-lg"
                >
                  Enquêter →
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Abus signalés */}
      {data.abuse.length > 0 && (
        <section className="bg-orange-950/20 border border-orange-700/30 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-orange-300 mb-3">
            🛡️ Demandes signalées par le vrai propriétaire WhatsApp (7j)
          </h2>
          <div className="space-y-2">
            {data.abuse.slice(0, 15).map(r => (
              <div key={r.id} className="bg-orange-900/10 border border-orange-800/30 rounded-xl px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-orange-200 truncate">{r.title}</p>
                    <p className="text-[11px] text-orange-300/70 mt-0.5">
                      📱 {r.whatsapp} · {r.city} · {formatDate(r.createdAt)}
                    </p>
                    <p className="text-[10px] text-orange-400/60 mt-0.5">
                      Score: {r.scoreConfiance ?? '—'} · Device: {r.deviceId?.slice(0, 8) || '—'}…
                    </p>
                  </div>
                  {r.deviceId && (
                    <button
                      onClick={() => setSelectedDeviceId(r.deviceId!)}
                      className="text-[11px] text-orange-200 border border-orange-500/30 hover:bg-orange-900/30 px-2 py-1 rounded-lg shrink-0"
                    >
                      Dossier
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending confirmations */}
      <section className="bg-gray-800/30 border border-gray-700/40 rounded-2xl p-4">
        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          ⏳ En attente de confirmation
          <span className="text-[10px] text-gray-500">({data.pending.length} demandes)</span>
        </h2>
        {data.pending.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">
            Aucune demande en attente. Tout est traité.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/50">
                  <th className="text-left font-bold py-2 px-1">Titre</th>
                  <th className="text-left font-bold py-2 px-1">Numéro</th>
                  <th className="text-left font-bold py-2 px-1">Score</th>
                  <th className="text-left font-bold py-2 px-1">Soumise</th>
                  <th className="text-left font-bold py-2 px-1">Expire</th>
                  <th className="text-left font-bold py-2 px-1">Device</th>
                  <th className="text-left font-bold py-2 px-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.pending.slice(0, 50).map(r => {
                  const mins = r.confirmationExpiresAt ? minutesUntil(r.confirmationExpiresAt) : 0;
                  const isActing = actingId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-gray-800/40 hover:bg-gray-800/40">
                      <td className="py-2 px-1 text-gray-200 truncate max-w-[180px]">{r.title}</td>
                      <td className="py-2 px-1 text-gray-400 font-mono">{r.whatsapp}</td>
                      <td className="py-2 px-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scoreColor(r.scoreConfiance)}`}>
                          {r.scoreConfiance ?? '—'}
                        </span>
                      </td>
                      <td className="py-2 px-1 text-gray-500">{formatDate(r.createdAt)}</td>
                      <td className="py-2 px-1">
                        <span className={mins <= 5 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                          {mins} min
                        </span>
                      </td>
                      <td className="py-2 px-1">
                        {r.deviceId ? (
                          <button
                            onClick={() => setSelectedDeviceId(r.deviceId!)}
                            className="text-[10px] text-blue-300 hover:underline font-mono"
                          >
                            {r.deviceId.slice(0, 8)}…
                          </button>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-1">
                        <div className="flex gap-1.5">
                          <button
                            disabled={isActing}
                            onClick={() => handleActivate(r.id)}
                            className="text-[10px] font-bold text-green-300 border border-green-500/30 hover:bg-green-500/10 px-2 py-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Activer après vérification du numéro WhatsApp émetteur"
                          >
                            {isActing ? '...' : '✅ Activer'}
                          </button>
                          <button
                            disabled={isActing}
                            onClick={() => handleSignal(r.id)}
                            className="text-[10px] font-bold text-red-300 border border-red-500/30 hover:bg-red-500/10 px-2 py-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Suspendre + flag abus (numéro émetteur ≠ déclaré)"
                          >
                            🛡️ Suspendre
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Devices récents */}
      <section className="bg-gray-800/30 border border-gray-700/40 rounded-2xl p-4">
        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          📟 Devices récents (7j)
          <span className="text-[10px] text-gray-500">({data.devices.length})</span>
        </h2>
        {data.devices.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">Aucun device tracké.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/50">
                  <th className="text-left font-bold py-2 px-1">Device</th>
                  <th className="text-left font-bold py-2 px-1">Status</th>
                  <th className="text-left font-bold py-2 px-1">Total</th>
                  <th className="text-left font-bold py-2 px-1">Confirmés</th>
                  <th className="text-left font-bold py-2 px-1">Abus</th>
                  <th className="text-left font-bold py-2 px-1">N° distincts</th>
                  <th className="text-left font-bold py-2 px-1">Dernier vu</th>
                  <th className="text-left font-bold py-2 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {data.devices.slice(0, 50).map(d => (
                  <tr key={d.deviceId} className="border-b border-gray-800/40 hover:bg-gray-800/40">
                    <td className="py-2 px-1 font-mono text-gray-300 truncate max-w-[140px]">
                      {d.deviceId.slice(0, 12)}…
                    </td>
                    <td className="py-2 px-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(d.status)}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-2 px-1 text-gray-300">{d.totalRequests}</td>
                    <td className="py-2 px-1 text-green-400">{d.confirmedRequests}</td>
                    <td className={`py-2 px-1 ${d.abuseFlagged > 0 ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                      {d.abuseFlagged}
                    </td>
                    <td className="py-2 px-1 text-gray-400">{(d.whatsappNumbers || []).length}</td>
                    <td className="py-2 px-1 text-gray-500">{formatDate(d.lastSeenAt)}</td>
                    <td className="py-2 px-1">
                      <button
                        onClick={() => setSelectedDeviceId(d.deviceId)}
                        className="text-[10px] text-blue-300 hover:underline"
                      >
                        Dossier →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Blocklist */}
      <section className="bg-gray-800/30 border border-gray-700/40 rounded-2xl p-4">
        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          🚫 Blacklist devices
          <span className="text-[10px] text-gray-500">({data.blocklist.length})</span>
        </h2>
        {data.blocklist.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">Aucun device bloqué.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/50">
                  <th className="text-left font-bold py-2 px-1">Device</th>
                  <th className="text-left font-bold py-2 px-1">Source</th>
                  <th className="text-left font-bold py-2 px-1">Raison</th>
                  <th className="text-left font-bold py-2 px-1">Durée</th>
                  <th className="text-left font-bold py-2 px-1">Bloqué</th>
                  <th className="text-left font-bold py-2 px-1">Expire</th>
                </tr>
              </thead>
              <tbody>
                {data.blocklist.slice(0, 50).map(b => {
                  const now = Date.now();
                  const isActive = b.expiresAt === null || (b.expiresAt && b.expiresAt > now);
                  return (
                    <tr key={b.deviceId} className={`border-b border-gray-800/40 ${!isActive ? 'opacity-50' : ''}`}>
                      <td className="py-2 px-1 font-mono text-gray-300 truncate max-w-[140px]">
                        {b.deviceId.slice(0, 12)}…
                      </td>
                      <td className="py-2 px-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          b.blockedBy === 'auto' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {b.blockedBy}
                        </span>
                      </td>
                      <td className="py-2 px-1 text-gray-400 truncate max-w-[200px]">{b.reason}</td>
                      <td className="py-2 px-1 text-gray-300">{b.duration}</td>
                      <td className="py-2 px-1 text-gray-500">{formatDate(b.blockedAt)}</td>
                      <td className="py-2 px-1 text-gray-500">
                        {b.expiresAt === null ? '∞' : formatDate(b.expiresAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[10px] text-gray-600 text-center italic">
        Pour bloquer manuellement un device ou modifier la blocklist, voir
        la doc d'exploitation SECURITE_README.md (ou via Firebase Console
        en attendant les callables admin dédiées).
      </p>
    </div>
  );
};

// ─── Vue dossier device ────────────────────────────────────────────
const DeviceFileView: React.FC<{
  deviceId: string;
  device?: DeviceFingerprint;
  requests: BuyerRequest[];
  blocked?: DeviceBlock;
  onBack: () => void;
}> = ({ deviceId, device, requests, blocked, onBack }) => {
  return (
    <div className="space-y-5 animate-fade-in">
      <button
        onClick={onBack}
        className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5"
      >
        ← Retour
      </button>

      <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5">
        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Dossier device</p>
        <p className="font-mono text-sm text-white break-all">{deviceId}</p>
        {device && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Stat label="Status" value={device.status} />
            <Stat label="Total demandes" value={String(device.totalRequests)} />
            <Stat label="Confirmées" value={String(device.confirmedRequests)} />
            <Stat label="Abus signalés" value={String(device.abuseFlagged)} highlight={device.abuseFlagged > 0} />
            <Stat label="Première fois" value={device.firstSeenAt ? new Date(device.firstSeenAt).toLocaleDateString('fr-FR') : '—'} />
            <Stat label="Dernière fois" value={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleDateString('fr-FR') : '—'} />
            <Stat label="N° distincts" value={String((device.whatsappNumbers || []).length)} />
            <Stat label="Dernière IP" value={device.lastIp || '—'} />
          </div>
        )}
        {!device && (
          <p className="mt-4 text-xs text-gray-500 italic">
            Pas de fingerprint enregistré (premier passage ou collection vide).
          </p>
        )}
      </div>

      {blocked && (
        <div className={`border rounded-2xl p-4 ${
          blocked.expiresAt === null || (blocked.expiresAt && blocked.expiresAt > Date.now())
            ? 'bg-red-950/30 border-red-700/40'
            : 'bg-gray-800/30 border-gray-700/40 opacity-60'
        }`}>
          <p className="text-sm font-bold text-red-300 mb-2">🚫 Device blacklisté</p>
          <p className="text-xs text-red-200/80">Source : <strong>{blocked.blockedBy}</strong></p>
          <p className="text-xs text-red-200/80">Raison : {blocked.reason}</p>
          <p className="text-xs text-red-200/80">Durée : {blocked.duration}</p>
          <p className="text-xs text-red-300/60 mt-1">
            Bloqué le {new Date(blocked.blockedAt).toLocaleString('fr-FR')}
            {blocked.expiresAt && <> · expire le {new Date(blocked.expiresAt).toLocaleString('fr-FR')}</>}
          </p>
        </div>
      )}

      <div className="bg-gray-800/30 border border-gray-700/40 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-3">
          Demandes liées ({requests.length})
        </h3>
        {requests.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Aucune demande visible dans la fenêtre 7j chargée.</p>
        ) : (
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="bg-gray-800/40 border border-gray-700/30 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-bold text-gray-100 truncate max-w-[260px]">{r.title}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scoreColor(r.scoreConfiance)}`}>
                    score {r.scoreConfiance ?? '—'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {r.whatsapp} · {r.city} · {r.status}
                  {r.isAbuse && <span className="text-red-400 font-bold"> · 🛡️ signalée</span>}
                </p>
                {r.scoreSignals && r.scoreSignals.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.scoreSignals.map((s, i) => (
                      <span key={i} className="text-[9px] font-mono bg-gray-700/40 text-gray-400 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="bg-gray-900/40 rounded-lg px-3 py-2">
    <p className="text-[10px] uppercase font-bold text-gray-500 mb-0.5">{label}</p>
    <p className={`text-sm font-bold ${highlight ? 'text-red-400' : 'text-gray-200'}`}>{value}</p>
  </div>
);
