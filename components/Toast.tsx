import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

const COLORS: Record<ToastType, string> = {
  success: 'bg-green-600/90 border-green-500/50',
  error: 'bg-red-600/90 border-red-500/50',
  info: 'bg-gray-700/90 border-gray-600/50',
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 2700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      onClick={onDismiss}
      className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-md text-white text-sm font-medium shadow-lg transition-all duration-300 cursor-pointer ${COLORS[toast.type]} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <span className="text-base flex-shrink-0">{ICONS[toast.type]}</span>
      <span className="flex-1">{toast.message}</span>
    </div>
  );
};
