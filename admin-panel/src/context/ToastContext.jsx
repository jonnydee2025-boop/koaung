import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, options = {}) => {
    const id = ++toastId;
    const variant = options.variant ?? 'success';
    const duration = options.duration ?? 3500;

    setToasts((prev) => [...prev, { id, message, variant }]);

    if (duration > 0) {
      window.setTimeout(() => dismiss(id), duration);
    }

    return id;
  }, [dismiss]);

  const value = useMemo(
    () => ({
      showToast,
      showSuccess: (message, options) => showToast(message, { ...options, variant: 'success' }),
      showError: (message, options) => showToast(message, { ...options, variant: 'error' }),
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map(({ id, message, variant }) => (
          <div
            key={id}
            className={`toast toast--${variant}`}
            role={variant === 'error' ? 'alert' : 'status'}
          >
            {variant === 'error' ? (
              <AlertCircle size={16} className="toast-icon" aria-hidden />
            ) : (
              <CheckCircle size={16} className="toast-icon" aria-hidden />
            )}
            <span className="toast-message">{message}</span>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => dismiss(id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
