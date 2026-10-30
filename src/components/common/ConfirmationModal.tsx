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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4"
      onClick={isLoading ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm sm:max-w-md bg-secondary rounded-xl shadow-lg border border-color animate-slide-up overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        onClick={handleModalClick}
      >
        <div className="p-6 space-y-3">
          {title && (
            <h3 id="modal-title" className="text-xl font-semibold text-primary">
              {title}
            </h3>
          )}
          <div className="text-secondary text-sm md:text-base leading-relaxed">{message}</div>
        </div>

        <div className="px-6 py-4 bg-tertiary border-t border-color flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="btn btn-ghost disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            type="button"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`btn btn-${confirmButtonType} flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed min-w-[120px] cursor-pointer`}
            type="button"
          >
            {isLoading && (
              <svg
                className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-current shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
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
