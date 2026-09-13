import { createContext, useCallback, useContext, useRef, useState } from "react";

const ConfirmContext = createContext({ confirmAction: async () => false });

/**
 * ConfirmProvider — remplace window.confirm() par une fenêtre de
 * confirmation stylée, cohérente avec le reste de l'app. useConfirm()
 * renvoie une fonction confirmAction(message, options) => Promise<boolean>,
 * utilisable exactement comme confirm() mais async.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, danger, confirmLabel, cancelLabel }
  const resolver = useRef(null);

  const confirmAction = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        message,
        title: options.title || "Confirmer",
        confirmLabel: options.confirmLabel || "Confirmer",
        cancelLabel: options.cancelLabel || "Annuler",
        danger: options.danger !== false,
      });
    });
  }, []);

  function handle(result) {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirmAction }}>
      {children}
      {state && (
        <div onClick={() => handle(false)} className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
            <div className="font-display text-lg mb-2">{state.title}</div>
            <div className="text-sm text-felt-cream/70 whitespace-pre-line">{state.message}</div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => handle(false)}
                className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream"
              >
                {state.cancelLabel}
              </button>
              <button
                onClick={() => handle(true)}
                className={`flex-1 px-4 py-2 rounded-md font-display ${
                  state.danger ? "bg-felt-alert text-white hover:bg-felt-alert/90" : "bg-felt-gold text-felt-bg hover:bg-felt-gold/90"
                }`}
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
  return useContext(ConfirmContext).confirmAction;
}
