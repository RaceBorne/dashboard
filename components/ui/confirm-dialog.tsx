'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  ReactNode,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { AlertTriangle } from 'lucide-react';

/**
 * Standardised confirmation dialog used throughout the app.
 *
 * Light-grey modal, always centred, two actions: cancel (ghost) on the left,
 * the action button on the right. For delete/destructive confirms the action
 * button renders in the danger tone.
 *
 * Usage (imperative):
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Delete task?',
 *     description: 'This can\'t be undone.',
 *     confirmLabel: 'Delete',
 *     tone: 'danger',
 *   });
 *   if (ok) runDelete();
 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | undefined>(
  undefined,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  function close(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
  }

  const tone = pending?.tone ?? 'default';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        {pending && (
          <DialogContent>
            <DialogHeader>
              <div className="flex items-start gap-3">
                {tone === 'danger' && (
                  <div className="h-8 w-8 rounded-full bg-evari-danger flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <DialogTitle>{pending.title}</DialogTitle>
                  {pending.description && (
                    <DialogDescription className="mt-1.5">
                      {pending.description}
                    </DialogDescription>
                  )}
                </div>
              </div>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => close(false)}
                autoFocus
              >
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={tone === 'danger' ? 'destructive' : 'primary'}
                size="sm"
                onClick={() => close(true)}
              >
                {pending.confirmLabel ??
                  (tone === 'danger' ? 'Delete' : 'Confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx)
    throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}
