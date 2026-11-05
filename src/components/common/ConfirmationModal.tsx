import { X } from 'lucide-react';
import React, { useEffect } from 'react';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmButtonType?: 'primary' | 'danger' | 'success';
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonType = 'primary',
  isLoading = false,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel, isLoading]);

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
      onClick={isLoading ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm sm:max-w-[420px] bg-secondary rounded-2xl shadow-2xl border border-color animate-scale-in overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        onClick={handleModalClick}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-color bg-secondary">
            <h3 id="modal-title" className="text-primary text-[15px] font-semibold tracking-tight">
              {title}
            </h3>
            <button
              onClick={onCancel}
              disabled={isLoading}
              aria-label="Close"
              className="text-secondary hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-tertiary cursor-pointer disabled:opacity-40"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="p-5 text-secondary text-sm leading-relaxed">{message}</div>

        <div className="px-5 py-3.5 bg-tertiary/20 border-t border-color flex items-center justify-end gap-2.5">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="h-10 px-4 text-xs font-semibold text-secondary hover:text-primary bg-tertiary hover:bg-hover border border-color rounded-xl transition-all disabled:opacity-40 cursor-pointer"
            type="button"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`h-10 px-5 text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${
              confirmButtonType === 'danger'
                ? 'bg-danger text-white hover:bg-danger/90 shadow-danger/20'
                : confirmButtonType === 'success'
                  ? 'bg-success text-white hover:bg-success/90 shadow-success/20'
                  : 'bg-brand text-white hover:bg-brand-hover shadow-brand/20'
            }`}
            type="button"
          >
            {isLoading && (
              <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white/20 border-t-white rounded-full mr-0.5" />
            )}
            <span>
              {isLoading
                ? confirmText.includes('Close')
                  ? 'Closing...'
                  : confirmText.includes('Reverse')
                    ? 'Reversing...'
                    : 'Processing...'
                : confirmText}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
