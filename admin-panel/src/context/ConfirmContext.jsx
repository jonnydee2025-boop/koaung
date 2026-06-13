import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmContext = createContext(null);

const DEFAULT_STATE = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  variant: 'default',
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(DEFAULT_STATE);
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    setState(DEFAULT_STATE);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: options.title ?? 'Confirm',
        message: options.message ?? '',
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        variant: options.variant ?? 'default',
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state.open && (
        <div className="modal-overlay" role="presentation" onClick={() => close(false)}>
          <div
            className="modal-card modal-card--calm confirm-dialog"
            role="alertdialog"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog-body">
              {state.variant === 'danger' && (
                <div className="confirm-dialog-icon confirm-dialog-icon--danger" aria-hidden>
                  <AlertTriangle size={22} />
                </div>
              )}
              <h2 id="confirm-dialog-title" className="confirm-dialog-title">
                {state.title}
              </h2>
              <p id="confirm-dialog-message" className="confirm-dialog-message">
                {state.message}
              </p>
            </div>
            <div className="modal-actions confirm-dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                {state.cancelLabel}
              </button>
              <button
                type="button"
                className={`btn ${state.variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx.confirm;
}
