/**
 * NUNULIA — Page diagnostic /fcm-debug
 *
 * Outil permanent pour debugger les push notifications sur PC ET mobile.
 * Accessible aux utilisateurs connectés (chacun voit ses propres tokens).
 *
 * Affiche en temps réel (refresh 2s) :
 *   - Permission notif navigateur
 *   - Service Workers actifs + état
 *   - FCM token enregistré localement
 *   - Tokens enregistrés Firestore (multi-devices)
 *   - Push events reçus dans le SW (via BroadcastChannel)
 *
 * 2 boutons de test :
 *   - "Test notif directe" : new Notification() — sans FCM/serveur
 *   - "Test push FCM" : appelle CF sendTestPush → push réel multicast
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { useAppContext } from '../contexts/AppContext';
import { db, getFirebaseFunctions } from '../firebase-config';
import { collection, getDocs } from 'firebase/firestore';

interface SwInfo {
  scope: string;
  scriptName: string;
  state: string;
  waiting: boolean;
}

interface RemoteToken {
  id: string;
  preview: string;
  device: string;
  createdAt: string;
}

interface Diagnostic {
  permission: NotificationPermission | 'unsupported';
  swCount: number;
  sws: SwInfo[];
  localToken: string | null;
  remoteTokens: RemoteToken[];
  fcmReady: boolean;
  isIOS: boolean;
  iosVersion: number | null;     // Major version (16, 17, etc.) or null si non-iOS
  isStandalone: boolean;          // true = installé en PWA (Home Screen)
  pushSupportedIOS: boolean;      // iOS 16.4+ AND standalone — sinon impossible
}

interface TestResult {
  type: 'direct' | 'fcm';
  ok: boolean;
  message: string;
  details?: string;
  at: string;
}

export default function FcmDebug() {
  const { currentUser } = useAppContext();
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [pushLog, setPushLog] = useState<string[]>([]);
  const [testing, setTesting] = useState<'none' | 'direct' | 'fcm'>('none');
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  // ── Collecte diagnostic ────────────────────────────────────────────
  const collect = useCallback(async () => {
    // iOS-specific detection : Web Push n'existe sur iOS qu'à partir de 16.4
    // ET uniquement quand l'app est installée en PWA (Add to Home Screen).
    // Hors PWA, navigator.standalone est false et Apple bloque le Web Push.
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    let iosVersion: number | null = null;
    if (isIOS) {
      // ex: "OS 16_4_1 like Mac OS X" → 16
      const m = ua.match(/OS (\d+)[_\.](\d+)/);
      if (m) iosVersion = parseInt(m[1], 10) + parseInt(m[2], 10) / 100;
    }
    const isStandalone =
      (window as unknown as { navigator: { standalone?: boolean } }).navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    const pushSupportedIOS = !isIOS || (iosVersion !== null && iosVersion >= 16.4 && isStandalone);

    const d: Diagnostic = {
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
      swCount: 0,
      sws: [],
      localToken: null,
      remoteTokens: [],
      fcmReady: false,
      isIOS,
      iosVersion,
      isStandalone,
      pushSupportedIOS,
    };
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      d.swCount = regs.length;
      d.sws = regs.map((r) => ({
        scope: r.scope,
        scriptName: r.active?.scriptURL?.split('/').pop() || '—',
        state: r.active?.state || 'inactive',
        waiting: !!r.waiting,
      }));
    }
    try {
      d.localToken = localStorage.getItem('nunulia_fcm_token');
    } catch { /* private mode */ }

    if (currentUser?.id && db) {
      try {
        const snap = await getDocs(collection(db, 'users', currentUser.id, 'fcmTokens'));
        d.remoteTokens = snap.docs.map((doc) => {
          const data = doc.data() as { token?: string; userAgent?: string; createdAt?: { toMillis?: () => number } };
          const ua = data.userAgent || '';
          let device = 'Inconnu';
          if (/Android/i.test(ua)) device = '📱 Android';
          else if (/iPhone|iPad/i.test(ua)) device = '🍎 iOS';
          else if (/Mac/i.test(ua)) device = '💻 Mac';
          else if (/Windows/i.test(ua)) device = '🖥️ Windows';
          else if (/Linux/i.test(ua)) device = '🐧 Linux';
          const ts = data.createdAt?.toMillis?.() || 0;
          return {
            id: doc.id,
            preview: data.token?.slice(0, 20) + '…' || '—',
            device,
            createdAt: ts ? new Date(ts).toLocaleString('fr-FR') : '—',
          };
        });
      } catch { /* rules block, etc. */ }
    }

    d.fcmReady =
      d.permission === 'granted' &&
      d.swCount >= 2 &&
      d.sws.some((s) => s.scriptName === 'firebase-messaging-sw.js' && s.state === 'activated') &&
      !!d.localToken;
    setDiag(d);
  }, [currentUser?.id]);

  // ── Refresh auto toutes les 3s ─────────────────────────────────────
  useEffect(() => {
    collect();
    const i = setInterval(collect, 3000);
    return () => clearInterval(i);
  }, [collect]);

  // ── Écoute des push events du SW via BroadcastChannel ──────────────
  // Le SW poste sur le channel 'nunulia-fcm-debug' à chaque push reçu.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('nunulia-fcm-debug');
    broadcastRef.current = ch;
    ch.onmessage = (event) => {
      const time = new Date().toLocaleTimeString('fr-FR');
      const data = event.data || {};
      const msg = `[${time}] SW push reçu — title: "${data.title || '—'}" type: ${data.type || '—'}`;
      setPushLog((prev) => [msg, ...prev].slice(0, 20));
    };
    return () => ch.close();
  }, []);

  // ── Test direct via ServiceWorkerRegistration.showNotification() ───
  // (compatible desktop + mobile — `new Notification()` est bloqué sur Android Chrome)
  const testDirect = useCallback(async () => {
    setTesting('direct');
    const at = new Date().toLocaleTimeString('fr-FR');
    if (typeof Notification === 'undefined') {
      setResults((p) => [{ type: 'direct' as const, ok: false, message: 'API Notification non supportée', at }, ...p].slice(0, 10));
      setTesting('none');
      return;
    }
    if (Notification.permission !== 'granted') {
      setResults((p) => [{ type: 'direct' as const, ok: false, message: `Permission = ${Notification.permission}`, at }, ...p].slice(0, 10));
      setTesting('none');
      return;
    }
    if (!('serviceWorker' in navigator)) {
      setResults((p) => [{ type: 'direct' as const, ok: false, message: 'Service Worker non supporté', at }, ...p].slice(0, 10));
      setTesting('none');
      return;
    }
    try {
      // Même registration que les vraies notifs foreground (SW FCM) : le
      // test valide ainsi l'affichage ET le clic (focus + navigation).
      const { getNotificationSwRegistration } = await import('../services/fcm');
      const reg = await getNotificationSwRegistration();
      await reg.showNotification('🧪 Test direct Nunulia', {
        body: `Si tu vois ce popup, l'API Notification marche ! (${at})`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'fcm-debug-direct',
        data: { link: '/fcm-debug' },
      });
      setResults((p) => [{ type: 'direct' as const, ok: true, message: 'Notification créée via SW. Popup visible ?', details: 'Si tu ne vois rien → OS bloque (Focus Assist Windows, HiOS Tecno, mode silencieux…)', at }, ...p].slice(0, 10));
    } catch (e) {
      setResults((p) => [{ type: 'direct' as const, ok: false, message: 'Exception', details: String(e), at }, ...p].slice(0, 10));
    } finally {
      setTesting('none');
    }
  }, []);

  // ── Test push FCM réel via CF ──────────────────────────────────────
  const testFcm = useCallback(async () => {
    setTesting('fcm');
    const at = new Date().toLocaleTimeString('fr-FR');
    if (!currentUser?.id) {
      setResults((p) => [{ type: 'fcm' as const, ok: false, message: 'Pas connecté', at }, ...p].slice(0, 10));
      setTesting('none');
      return;
    }
    try {
      const fns = await getFirebaseFunctions();
      if (!fns) throw new Error('Firebase Functions non initialisé');
      const fn = httpsCallable<unknown, { sent: number; failed: number; tokensCount: number; errors: string[] }>(
        fns,
        'sendTestPush',
      );
      const res = await fn({});
      const d = res.data;
      const msg = `sent=${d.sent}/${d.tokensCount} failed=${d.failed}`;
      const details = d.errors.length > 0 ? `Erreurs : ${d.errors.join(', ')}` : 'Attends le popup système…';
      setResults((p) => [{ type: 'fcm' as const, ok: d.sent > 0, message: msg, details, at }, ...p].slice(0, 10));
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setResults((p) => [{ type: 'fcm' as const, ok: false, message: err.code || 'Erreur', details: err.message, at }, ...p].slice(0, 10));
    } finally {
      setTesting('none');
    }
  }, [currentUser?.id]);

  // ── Render ─────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-black mb-4">🔍 Diagnostic Push Nunulia</h1>
        <p className="text-gray-600 mb-4">Connexion requise pour accéder à cette page.</p>
        <Link to="/login" className="inline-block px-4 py-2 bg-gold-400 text-gray-900 rounded-lg font-bold">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-black">🔍 Diagnostic Push Nunulia</h1>
        <p className="text-sm text-gray-600 mt-1">
          Outil permanent pour debugger les notifications. Connecté : <strong>{currentUser.name}</strong>
        </p>
      </header>

      {/* ⚠️ Bandeau iOS — Apple bloque Web Push hors PWA installée */}
      {diag?.isIOS && !diag.pushSupportedIOS && (
        <div className="rounded-2xl p-4 border-2 bg-red-50 border-red-300">
          <div className="text-base font-bold mb-2 text-red-800">
            🍎 iOS détecté — push impossible en l'état
          </div>
          <div className="text-xs text-red-900 space-y-1">
            {diag.iosVersion !== null && diag.iosVersion < 16.4 && (
              <p>❌ <b>iOS {diag.iosVersion.toFixed(2)}</b> — il faut iOS 16.4 minimum. Mettez à jour votre iPhone.</p>
            )}
            {(diag.iosVersion === null || diag.iosVersion >= 16.4) && !diag.isStandalone && (
              <>
                <p>❌ <b>L'app n'est PAS installée</b> sur votre écran d'accueil.</p>
                <p className="mt-2 font-bold">Comment installer (obligatoire pour les notifications) :</p>
                <ol className="list-decimal ml-5 space-y-0.5">
                  <li>Ouvrir Safari (pas Chrome ni Brave sur iPhone)</li>
                  <li>Aller sur <b>nunulia.com</b></li>
                  <li>Toucher l'icône <b>Partager</b> (carré avec flèche ↑) en bas</li>
                  <li>Faire défiler → <b>« Sur l'écran d'accueil »</b></li>
                  <li>Toucher <b>« Ajouter »</b> en haut à droite</li>
                  <li>Ouvrir Nunulia depuis l'écran d'accueil (PAS Safari)</li>
                  <li>Autoriser les notifications dans le Profil</li>
                </ol>
                <p className="mt-2 italic">C'est une limitation Apple : Safari iOS refuse les notifications hors PWA installée.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* État global */}
      {diag && (!diag.isIOS || diag.pushSupportedIOS) && (
        <div className={`rounded-2xl p-4 border-2 ${diag.fcmReady ? 'bg-green-50 border-green-300' : 'bg-orange-50 border-orange-300'}`}>
          <div className="text-base font-bold mb-1">
            {diag.fcmReady ? '✅ Pipeline FCM opérationnel' : '⚠️ Pipeline FCM incomplet'}
          </div>
          <div className="text-xs text-gray-700">
            {diag.isIOS
              ? 'iOS PWA détectée. Si les push ne s\'affichent pas → vérifier les réglages iOS (Réglages → Notifications → Nunulia).'
              : 'Si les push ne s\'affichent pas malgré ce statut vert → c\'est Windows / l\'OS qui bloque (Focus Assist, mode Ne pas déranger…).'}
          </div>
        </div>
      )}

      {/* Détails techniques */}
      {diag && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-700">État technique</h2>

          {diag.isIOS && (
            <>
              <Row label="iOS version">
                <Badge ok={diag.iosVersion !== null && diag.iosVersion >= 16.4}>
                  {diag.iosVersion !== null ? diag.iosVersion.toFixed(2) : 'inconnu'}
                </Badge>
              </Row>
              <Row label="App installée (PWA)">
                <Badge ok={diag.isStandalone}>{diag.isStandalone ? 'oui' : 'non — bloque tout'}</Badge>
              </Row>
            </>
          )}

          <Row label="Permission navigateur">
            <Badge ok={diag.permission === 'granted'}>{diag.permission}</Badge>
          </Row>

          <Row label="Service Workers actifs">
            <span className="text-sm">{diag.swCount}</span>
          </Row>

          {diag.sws.map((sw) => (
            <Row key={sw.scope} label={`└ ${sw.scriptName}`}>
              <span className="text-xs">
                <Badge ok={sw.state === 'activated' && !sw.waiting}>{sw.state}{sw.waiting ? ' (waiting!)' : ''}</Badge>
              </span>
            </Row>
          ))}

          <Row label="FCM token local">
            <Badge ok={!!diag.localToken}>{diag.localToken ? `${diag.localToken.slice(0, 16)}…` : 'absent'}</Badge>
          </Row>

          <Row label="Tokens enregistrés Firestore">
            <span className="text-sm">{diag.remoteTokens.length}</span>
          </Row>

          {diag.remoteTokens.map((t) => (
            <Row key={t.id} label={`└ ${t.device}`}>
              <span className="text-[10px] text-gray-500">{t.preview} — {t.createdAt}</span>
            </Row>
          ))}
        </div>
      )}

      {/* Boutons test */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-700">Tests</h2>

        <button
          onClick={testDirect}
          disabled={testing !== 'none'}
          className="w-full py-3 px-4 bg-blue-500 text-white font-bold rounded-xl active:scale-95 disabled:opacity-50"
        >
          {testing === 'direct' ? 'Test en cours…' : '🧪 Tester notification directe (sans FCM)'}
        </button>
        <p className="text-[11px] text-gray-500 px-1">
          Bypass complet de Firebase. Si ça ne s'affiche pas → c'est ton OS qui bloque.
        </p>

        <button
          onClick={testFcm}
          disabled={testing !== 'none'}
          className="w-full py-3 px-4 bg-purple-500 text-white font-bold rounded-xl active:scale-95 disabled:opacity-50"
        >
          {testing === 'fcm' ? 'Envoi push…' : '🚀 Tester push FCM réel (multicast)'}
        </button>
        <p className="text-[11px] text-gray-500 px-1">
          Appelle le serveur Nunulia qui pousse un vrai FCM vers tous tes devices. Reflète exactement la prod.
        </p>
      </div>

      {/* Résultats des tests */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">Résultats des tests</h2>
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li key={i} className={`text-xs p-2.5 rounded-lg ${r.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="font-bold">
                  [{r.at}] {r.type === 'direct' ? '🧪 Direct' : '🚀 FCM'} — {r.ok ? '✅' : '❌'} {r.message}
                </div>
                {r.details && <div className="text-gray-600 mt-1">{r.details}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Log des push reçus en live */}
      {pushLog.length > 0 && (
        <div className="bg-gray-900 text-green-400 rounded-2xl p-4 font-mono text-[11px]">
          <h2 className="text-sm font-bold text-white mb-2">📡 Push reçus par le SW (live)</h2>
          <ul className="space-y-0.5">
            {pushLog.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-center pt-2 pb-6">
        <Link to="/" className="text-xs text-gray-500 underline">← Retour à l'accueil</Link>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {children}
    </span>
  );
}
