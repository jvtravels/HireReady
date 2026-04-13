import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { c, font } from "./tokens";

/* ─── Types ─── */
type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

/* ─── Provider ─── */
let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Start exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    // Remove after animation
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++nextId;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]); // max 5
    const timer = setTimeout(() => dismiss(id), 4000);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach(t => clearTimeout(t)); };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          role="status"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9999,
            display: "flex", flexDirection: "column", gap: 8,
            pointerEvents: "none",
          }}
        >
          {toasts.map((t) => {
            const color = t.type === "success" ? c.sage : t.type === "error" ? c.ember : c.gilt;
            const borderColor = t.type === "success" ? "rgba(122,158,126,0.25)" : t.type === "error" ? "rgba(196,112,90,0.25)" : "rgba(212,179,127,0.25)";
            return (
              <div
                key={t.id}
                style={{
                  padding: "10px 16px", borderRadius: 10,
                  background: c.graphite, border: `1px solid ${borderColor}`,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                  display: "flex", alignItems: "center", gap: 10,
                  pointerEvents: "auto", maxWidth: 360,
                  animation: t.exiting ? "toastOut 0.2s ease forwards" : "toastIn 0.25s ease",
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.4, flex: 1 }}>{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 2, flexShrink: 0 }}
                >
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translateY(12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes toastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(12px) scale(0.95); } }
      `}</style>
    </ToastContext.Provider>
  );
}
