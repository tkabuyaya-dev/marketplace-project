import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';

export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markNotifRead, markAllNotifsRead } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleNotifClick = async (notif: typeof notifications[0]) => {
    if (!notif.read) await markNotifRead(notif.id);
    setIsOpen(false);
    if (notif.data?.link) {
      navigate(notif.data.link);
    } else if (notif.data?.productSlug) {
      navigate(`/product/${notif.data.productSlug}`);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'product_approved': return '✅';
      case 'product_rejected': return '❌';
      case 'new_message': return '💬';
      case 'subscription_change': return '⭐';
      case 'subscription_reminder': return '⏰';
      default: return '🔔';
    }
  };

  const timeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
        aria-label="Notifications"
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-gray-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed md:absolute right-2 md:right-0 top-16 md:top-full mt-0 md:mt-2 w-[calc(100vw-16px)] md:w-80 max-h-[420px] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-[60] animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-white font-bold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllNotifsRead()}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[360px] scrollbar-hide">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-sm">Aucune notification</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800 transition-colors border-b border-gray-800/50 ${
                    !notif.read ? 'bg-blue-900/10' : ''
                  }`}
                >
                  <span className="text-lg mt-0.5 flex-shrink-0">{typeIcon(notif.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.read ? 'text-white font-semibold' : 'text-gray-300'}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{notif.body}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{timeAgo(notif.createdAt)}</p>
                  </div>
                  {!notif.read && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
