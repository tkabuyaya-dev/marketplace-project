import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuditLogs, AuditLogEntry } from '../../services/firebase';
import type { AuditLogsProps } from './types';

const ENTITY_TYPES = ['country', 'account'] as const;
const PAGE_SIZE = 25;

const actionIcon: Record<string, string> = {
  country_add:    '🌍',
  country_update: '✏️',
  country_toggle: '🔀',
  country_delete: '🗑️',
  account_deleted:'❌',
};

const actionColor: Record<string, string> = {
  country_add:    'text-green-400',
  country_update: 'text-blue-400',
  country_toggle: 'text-yellow-400',
  country_delete: 'text-red-400',
  account_deleted:'text-red-500',
};

function formatTs(ms: number): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}

export const AuditLogs: React.FC<AuditLogsProps> = () => {
  const { t } = useTranslation();

  const [logs, setLogs]             = useState<AuditLogEntry[]>([]);
  const [loading, setLoading]       = useState(false);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [searchAdmin, setSearchAdmin]   = useState('');
  const [page, setPage]             = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs({
        entityType: entityFilter || undefined,
        limitCount: 200,
      });
      setLogs(data);
      setPage(0);
    } finally {
      setLoading(false);
    }
  }, [entityFilter]);

  useEffect(() => { load(); }, [load]);

  // Client-side secondary filters
  const filtered = logs.filter(e => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (searchAdmin && !e.adminEmail.toLowerCase().includes(searchAdmin.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const uniqueActions = [...new Set(logs.map(e => e.action))].sort();

  const hasActiveFilter = entityFilter || actionFilter || searchAdmin;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-white">{t('admin.auditTitle')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{t('admin.auditSubtitle')}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-3 bg-gray-900/60 border border-gray-800 rounded-xl">
        {/* Admin email search */}
        <div className="relative flex-1 min-w-[160px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input
            type="text"
            value={searchAdmin}
            onChange={e => { setSearchAdmin(e.target.value); setPage(0); }}
            placeholder={t('admin.auditSearchAdmin')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Entity type */}
        <select
          value={entityFilter}
          onChange={e => { setEntityFilter(e.target.value); setPage(0); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
        >
          <option value="">{t('admin.auditAllEntities')}</option>
          {ENTITY_TYPES.map(et => (
            <option key={et} value={et}>{et}</option>
          ))}
        </select>

        {/* Action */}
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(0); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
        >
          <option value="">{t('admin.auditAllActions')}</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-blue-400 border border-blue-500/30 bg-blue-600/10 hover:bg-blue-600/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {loading ? '…' : '↻ ' + t('admin.auditRefresh')}
        </button>

        {hasActiveFilter && (
          <button
            onClick={() => { setEntityFilter(''); setActionFilter(''); setSearchAdmin(''); setPage(0); }}
            className="text-xs text-gray-500 hover:text-red-400 underline transition-colors ml-auto"
          >
            {t('admin.filterClearAll')}
          </button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-gray-500">{t('admin.auditCount', { count: filtered.length })}</p>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : paginated.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-gray-500">
          <div className="text-4xl mb-3">📋</div>
          <p>{t('admin.auditNoLogs')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map(entry => {
            const isExpanded = expandedId === entry.id;
            const icon  = actionIcon[entry.action] ?? '📝';
            const color = actionColor[entry.action] ?? 'text-gray-300';

            return (
              <div
                key={entry.id}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/60 transition-colors"
                >
                  <span className="text-lg flex-shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold font-mono ${color}`}>{entry.action}</span>
                      <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{entry.entityType}</span>
                      {entry.entityId && (
                        <span className="text-[10px] text-gray-600 truncate max-w-[120px]">{entry.entityId}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{entry.adminEmail || entry.adminId}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-500">{formatTs(entry.timestamp)}</p>
                    <span className="text-gray-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-800 px-4 py-3 space-y-3 bg-gray-950/50">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">{t('admin.auditPrevValue')}</p>
                        <pre className="text-gray-400 whitespace-pre-wrap break-all bg-gray-900 rounded-lg p-2 text-[10px] max-h-32 overflow-y-auto">
                          {entry.previousValue != null
                            ? JSON.stringify(entry.previousValue, null, 2)
                            : '—'}
                        </pre>
                      </div>
                      <div>
                        <p className="text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">{t('admin.auditNewValue')}</p>
                        <pre className="text-gray-400 whitespace-pre-wrap break-all bg-gray-900 rounded-lg p-2 text-[10px] max-h-32 overflow-y-auto">
                          {entry.newValue != null
                            ? JSON.stringify(entry.newValue, null, 2)
                            : '—'}
                        </pre>
                      </div>
                    </div>
                    <div className="flex gap-4 text-[10px] text-gray-600">
                      <span>{t('admin.auditAdminId')}: <span className="text-gray-400 font-mono">{entry.adminId}</span></span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            ← {t('admin.auditPrev')}
          </button>
          <span className="text-xs text-gray-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
          >
            {t('admin.auditNext')} →
          </button>
        </div>
      )}
    </div>
  );
};
