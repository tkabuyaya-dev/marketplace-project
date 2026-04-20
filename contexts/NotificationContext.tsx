/**
 * NUNULIA — NotificationContext
 * Holds: notifications, unreadCount
 * Depends on AuthContext (needs currentUser.id to subscribe).
 * Re-renders only on notification changes — isolated from auth/preference updates.
 */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppNotification } from '../types';
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/firebase';
import { useAuthContext } from './AuthContext';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markNotifRead: (id: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotificationContext = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotificationContext must be used within NotificationProvider');
  return ctx;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuthContext();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifUnsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (notifUnsub.current) { notifUnsub.current(); notifUnsub.current = null; }

    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Exclude new_message from bell count (those appear on the chat icon)
    notifUnsub.current = subscribeToNotifications(currentUser.id, (notifs) => {
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read && n.type !== 'new_message').length);
    });

    return () => {
      if (notifUnsub.current) notifUnsub.current();
    };
  }, [currentUser?.id]);

  const markNotifRead = async (id: string) => {
    await markNotificationRead(id);
  };

  const markAllNotifsRead = async () => {
    if (currentUser) await markAllNotificationsRead(currentUser.id);
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      markNotifRead,
      markAllNotifsRead,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
