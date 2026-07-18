import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, Info } from 'lucide-react';

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

const AUTO_DISMISS_MS = 3200;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// Pastille d'icône : la couleur vit dans la pastille, pas dans le fond —
// la carte reste blanche comme tout le design system.
const CHIP: Record<ToastType, { bg: string; icon: React.ReactNode }> = {
  success: { bg: '#10B981', icon: <Check size={13} strokeWidth={3} className="text-white" /> },
  error:   { bg: '#EF4444', icon: <X size={13} strokeWidth={3} className="text-white" /> },
  info:    { bg: '#F5C842', icon: <Info size={13} strokeWidth={3} className="text-[#3D2800]" /> },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startX: 0, dx: 0, active: false });
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const leave = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 220);
  }, [onDismiss]);

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
    leaveTimer.current = setTimeout(leave, AUTO_DISMISS_MS);
    return () => clearTimeout(leaveTimer.current);
  }, [leave]);

  // Glisser horizontalement pour fermer
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startX: e.clientX, dx: 0, active: true };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    clearTimeout(leaveTimer.current);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active || !elRef.current) return;
    drag.current.dx = e.clientX - drag.current.startX;
    elRef.current.style.transition = 'none';
    elRef.current.style.transform = `translateX(${drag.current.dx}px)`;
    elRef.current.style.opacity = String(Math.max(0.2, 1 - Math.abs(drag.current.dx) / 160));
  };
  const onPointerUp = () => {
    if (!drag.current.active || !elRef.current) return;
    drag.current.active = false;
    if (Math.abs(drag.current.dx) > 70) {
      const dir = drag.current.dx > 0 ? 1 : -1;
      elRef.current.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
      elRef.current.style.transform = `translateX(${dir * 320}px)`;
      elRef.current.style.opacity = '0';
      setTimeout(onDismiss, 180);
    } else {
      elRef.current.style.transition = 'transform 0.25s cubic-bezier(0.2,0.8,0.2,1), opacity 0.25s ease';
      elRef.current.style.transform = 'translateX(0)';
      elRef.current.style.opacity = '1';
      leaveTimer.current = setTimeout(leave, 1500);
    }
  };

  const chip = CHIP[toast.type];

  return (
    <div
      ref={elRef}
      role="status"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="pointer-events-auto flex items-center gap-2.5 pl-2.5 pr-4 py-2.5 rounded-2xl bg-white cursor-pointer select-none"
      style={{
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
        touchAction: 'pan-y',
        transform: entered && !leaving ? 'translateY(0) scale(1)' : 'translateY(-16px) scale(0.95)',
        opacity: entered && !leaving ? 1 : 0,
        transition: 'transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease',
      }}
    >
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: chip.bg, boxShadow: `0 2px 8px ${chip.bg}55` }}
      >
        {chip.icon}
      </span>
      <span className="flex-1 text-[13px] font-semibold text-[#111318] leading-snug">{toast.message}</span>
    </div>
  );
};
