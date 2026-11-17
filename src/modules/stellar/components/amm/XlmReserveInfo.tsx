import { AlertCircle, HelpCircle, Info, Lock, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { StellarBaseService } from '../../service/StellarBaseService';

interface XlmReserveInfoProps {
  xlmBalance: string;
  trustlineCount: number;
  isOpen: boolean;
  onClose: () => void;
}

const BASE_RESERVE = 1;
const SUBENTRY_RESERVE = 0.5;

const calculateReserve = (trustlineCount: number): number => {
  return (2 + trustlineCount) * SUBENTRY_RESERVE;
};

const calculateAvailableBalance = (balance: number, trustlineCount: number): number => {
  return parseFloat(StellarBaseService.calculateSpendableBalance(balance, trustlineCount, true));
};

export const XlmReserveInfoModal = ({
  xlmBalance,
  trustlineCount,
  isOpen,
  onClose,
}: XlmReserveInfoProps) => {
  const balance = parseFloat(xlmBalance) || 0;
  const reserveRequired = calculateReserve(trustlineCount);
  const availableBalance = calculateAvailableBalance(balance, trustlineCount);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="absolute right-0 top-full mt-2 w-80 sm:w-[380px] max-w-[calc(100vw-2rem)] bg-secondary rounded-xl border border-color shadow-2xl z-50 animate-slide-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-color sticky top-0 bg-secondary z-10">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-semibold text-primary">XLM Reserve Info</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-hover transition-colors">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-primary rounded-lg">
            <Lock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-primary">Base Reserve</span>
                <span className="text-sm text-amber-500 font-medium">{BASE_RESERVE} XLM</span>
              </div>
              <p className="text-xs text-muted mt-1">
                Required to keep your Stellar account active on the network
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-primary rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-primary">Subentry Reserve</span>
                <span className="text-sm text-blue-500 font-medium">
                  {SUBENTRY_RESERVE} XLM each
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                Additional reserve for each trustline, open offer, signer, or data entry
              </p>
            </div>
          </div>

          <div className="border-t border-color" />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted uppercase tracking-wide">
              Your Account
            </h4>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-secondary">Total Balance</span>
                <span className="text-sm font-medium text-primary">{balance.toFixed(7)} XLM</span>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-secondary">Reserved</span>
                  <span className="text-xs text-muted">({trustlineCount} subentries)</span>
                </div>
                <span className="text-sm font-medium text-amber-500">
                  {reserveRequired.toFixed(1)} XLM
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-color">
                <span className="text-sm font-semibold text-primary">Available to Spend</span>
                <span className="text-sm font-bold text-green-500">
                  {availableBalance.toFixed(7)} XLM
                </span>
              </div>
            </div>
          </div>

          {availableBalance < 1 && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-500">
                Your available balance is low. Keep enough XLM for transaction fees (typically
                0.00001 XLM per operation).
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-color">
          <a
            href="https://developers.stellar.org/docs/learn/fundamentals/lumens#minimum-balance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            Learn more about Stellar reserves
            <span>→</span>
          </a>
        </div>
      </div>
    </>
  );
};

interface XlmReserveButtonProps {
  xlmBalance: string;
  trustlineCount: number;
}

export const XlmReserveButton = ({ xlmBalance, trustlineCount }: XlmReserveButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const reserveRequired = calculateReserve(trustlineCount);

  return (
    <div className="relative">
      <button
        onClick={() => setIsModalOpen(prev => !prev)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors"
      >
        <HelpCircle className="w-3 h-3" />
        <span>Reserve: {reserveRequired.toFixed(1)} XLM</span>
      </button>

      <XlmReserveInfoModal
        xlmBalance={xlmBalance}
        trustlineCount={trustlineCount}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default XlmReserveInfoModal;
