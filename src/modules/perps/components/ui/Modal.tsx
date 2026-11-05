import { X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
  isLocked?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 'w-[420px]',
  isLocked = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLocked) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, isLocked]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        ref={overlayRef}
        className="absolute inset-0"
        onClick={() => {
          if (!isLocked) onClose();
        }}
      />
      <div
        className={`relative bg-secondary border border-color rounded-2xl shadow-2xl overflow-hidden flex flex-col ${width} max-h-[92vh] animate-in zoom-in-95 duration-200`}
      >
        <div className="relative z-20 flex justify-between items-center px-5 py-4 border-b border-color bg-secondary">
          <h2 className="text-primary text-[15px] font-semibold tracking-tight">{title}</h2>
          <button
            onClick={() => {
              if (!isLocked) onClose();
            }}
            disabled={isLocked}
            className={`transition-colors p-1.5 rounded-lg ${
              isLocked
                ? 'opacity-30 cursor-not-allowed text-secondary'
                : 'text-secondary hover:text-primary hover:bg-tertiary cursor-pointer'
            }`}
            title={isLocked ? 'Action in progress' : 'Close'}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="relative z-20 p-5 overflow-y-auto scrollbar-thin text-primary">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
