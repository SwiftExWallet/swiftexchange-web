import { Check, Copy, Download, Eye, EyeOff, X } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { SHARE_BACKGROUND_IMAGES } from './sharePnlConstants';

export interface StellarSharePnlModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  totalPnL: number;
  winRate?: number;
  bestTrade?: { asset: string; pnl: number };
  tradeCount?: number;
  timeframe?: string;
  assetPair?: string;
  referralCode?: string;
}

export const StellarSharePnlModal: React.FC<StellarSharePnlModalProps> = ({
  isOpen,
  onClose,
  address,
  totalPnL,
  winRate = 0,
  bestTrade,
  tradeCount = 0,
  timeframe = '30D',
  referralCode,
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [hideAmount, setHideAmount] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const selectedImage = SHARE_BACKGROUND_IMAGES[selectedImageIndex] || SHARE_BACKGROUND_IMAGES[0];
  const isProfit = totalPnL >= 0;

  // Masked address GBQH5C...3YWO
  const maskedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : 'Stellar Trader';

  // Format cryptic timeframes (like '2m', '1m', '1w') into clear readable text
  const formatTimeframe = (tf?: string): string => {
    if (!tf) return 'Past 30 Days';
    const clean = tf.toLowerCase().trim();
    if (clean === '1w' || clean === '7d') return 'Past 7 Days';
    if (clean === '1m' || clean === '30d') return 'Past 30 Days';
    if (clean === '2m' || clean === '60d') return 'Past 60 Days';
    if (clean === '3m' || clean === '90d') return 'Past 90 Days';
    if (clean === '1y' || clean === '365d') return 'Past 1 Year';
    if (clean === 'all' || clean === 'all time') return 'All Time';
    if (clean.includes('-')) return tf;
    return `Past ${tf.toUpperCase()}`;
  };

  const friendlyTimeframe = formatTimeframe(timeframe);

  const absPnL = Math.abs(totalPnL);
  const formattedPnL = absPnL.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = isProfit ? '+' : '-';
  const displayPnL = hideAmount ? (isProfit ? '+$••••••' : '-$••••••') : `${sign}$${formattedPnL}`;

  const displayReferral = referralCode || (address ? address.slice(0, 6).toUpperCase() : 'SWIFTEX');

  const officialBaseUrl = 'https://app.swiftexchange.io';
  const shareUrl = address
    ? `${officialBaseUrl}/stellar/portfolio?address=${address}`
    : officialBaseUrl;

  const shareTitle = `My Stellar Trading PnL on @SwiftExExchange (${friendlyTimeframe}):\n${
    hideAmount ? '💰 PnL: Verified Profit' : `💰 PnL: ${displayPnL} USD`
  }\n🎯 Win Rate: ${winRate}% | Trades: ${tradeCount || 1}\n⚡ Network: Stellar Pubnet\n${shareUrl}`;

  // High-Resolution 16:9 Canvas Generation for Export
  const generateCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Dark luxury crypto background
    const bgGrad = ctx.createLinearGradient(0, 0, 1200, 675);
    bgGrad.addColorStop(0, '#060913');
    bgGrad.addColorStop(0.5, '#0b1226');
    bgGrad.addColorStop(1, '#05070e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 675);

    // Glowing Ambient Neon Light behind Character
    const glow = ctx.createRadialGradient(960, 360, 30, 960, 360, 460);
    glow.addColorStop(0, isProfit ? 'rgba(0, 229, 153, 0.28)' : 'rgba(244, 63, 94, 0.28)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 675);

    // Draw Character on the right
    try {
      const charImg = new Image();
      charImg.crossOrigin = 'anonymous';
      charImg.src = selectedImage.url;
      await new Promise<void>(resolve => {
        charImg.onload = () => resolve();
        charImg.onerror = () => resolve();
      });

      if (charImg.complete && charImg.naturalWidth > 0) {
        const targetH = 590;
        const ratio = charImg.naturalWidth / charImg.naturalHeight;
        const targetW = targetH * ratio;
        const targetX = 1180 - targetW;
        const targetY = 675 - targetH;
        ctx.drawImage(charImg, targetX, targetY, targetW, targetH);
      }
    } catch (e) {
      console.warn('Canvas character rendering skipped:', e);
    }

    // Outer subtle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 1140, 615);

    // Draw SwiftEx official logo
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = '/logo.png';
      await new Promise<void>(resolve => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => {
          logoImg.src = 'https://app.swiftexchange.io/logo.png';
          logoImg.onload = () => resolve();
          logoImg.onerror = () => resolve();
        };
      });
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.drawImage(logoImg, 80, 72, 48, 48);
      }
    } catch (e) {
      console.warn('Canvas logo error:', e);
    }

    // Brand text: SWIFTEX Stellar PnL
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px sans-serif';
    ctx.fillText('SWIFTEX', 142, 108);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 24px sans-serif';
    ctx.fillText('Stellar PnL', 295, 108);

    // Subtitle text: Past 60 Days • GBQH5C...3YWO
    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px sans-serif';
    ctx.fillText(friendlyTimeframe, 80, 168);

    const tfWidth = ctx.measureText(friendlyTimeframe).width;
    ctx.fillStyle = '#64748b';
    ctx.fillText('•', 80 + tfWidth + 12, 168);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '22px monospace';
    ctx.fillText(maskedAddress, 80 + tfWidth + 28, 168);

    // Realized PnL label
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('TOTAL REALIZED PNL', 80, 250);

    // Big PnL
    ctx.fillStyle = isProfit ? '#00e599' : '#f43f5e';
    ctx.font = '900 86px sans-serif';
    ctx.fillText(displayPnL, 80, 335);

    const pnlWidth = ctx.measureText(displayPnL).width;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('USD', 80 + pnlWidth + 16, 335);

    // Metrics Row 1: Win Rate & Total Trades
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.fillText('WIN RATE', 80, 420);
    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 32px monospace';
    ctx.fillText(`${winRate}%`, 80, 462);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.fillText('TOTAL TRADES', 340, 420);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 32px monospace';
    ctx.fillText(`${tradeCount || 1} Trades`, 340, 462);

    // Metrics Row 2: Top Asset & Network
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.fillText('TOP ASSET', 80, 530);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 30px monospace';
    const bestPnlStr = bestTrade?.pnl ? ` (+${bestTrade.pnl.toFixed(2)})` : '';
    ctx.fillText(`${bestTrade?.asset || 'XLM'}${bestPnlStr}`, 80, 570);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.fillText('NETWORK', 340, 530);
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('STELLAR PUBNET', 340, 570);

    // Watermark
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('✓ Verified On-Chain', 80, 625);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('app.swiftexchange.io', 340, 625);

    return canvas;
  };

  const handleWhatsAppShare = async () => {
    try {
      const canvas = await generateCanvas();
      canvas.toBlob(async blob => {
        if (!blob) return;

        const file = new File([blob], 'swiftex-stellar-pnl.png', {
          type: 'image/png',
        });

        // Mobile Web Share with file if supported
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'SwiftEx Stellar PnL',
              text: shareTitle,
              files: [file],
            });
            return;
          } catch (e: any) {
            if (e.name === 'AbortError') return;
          }
        }

        // Desktop: copy image to clipboard and open WhatsApp
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob,
            }),
          ]);
        } catch {
          // ignore
        }

        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareTitle)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadImage = async () => {
    try {
      const canvas = await generateCanvas();
      const link = document.createElement('a');
      link.download = `swiftex-stellar-pnl-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyImageToClipboard = async () => {
    try {
      const canvas = await generateCanvas();
      canvas.toBlob(async blob => {
        if (!blob) {
          navigator.clipboard.writeText(shareUrl);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
          return;
        }

        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob,
            }),
          ]);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } catch {
          navigator.clipboard.writeText(shareUrl);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        }
      });
    } catch {
      handleDownloadImage();
    }
  };

  const handleTwitterShare = async () => {
    await handleCopyImageToClipboard();
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleTelegramShare = async () => {
    await handleCopyImageToClipboard();
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDiscordShare = async () => {
    await handleCopyImageToClipboard();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-[480px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-[var(--color-text-primary)] tracking-tight">
              Share PnL
            </h3>
            {/* Balance Visibility Toggle */}
            <button
              onClick={() => setHideAmount(!hideAmount)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-[11px] font-medium transition-colors cursor-pointer border border-[var(--color-border)]"
              title={hideAmount ? 'Show exact numbers' : 'Hide balance for privacy'}
            >
              {hideAmount ? (
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{hideAmount ? 'Hidden' : 'Visible'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] p-1 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The Aesthetic Stellar Share Card */}
        <div
          ref={cardRef}
          className="relative w-full rounded-xl p-5 overflow-hidden border border-white/10 shadow-xl flex flex-col justify-between"
          style={{
            background: 'linear-gradient(145deg, #070a14 0%, #0c1224 50%, #060810 100%)',
            minHeight: '235px',
          }}
        >
          {/* Subtle Ambient Glow behind Character */}
          <div
            className="absolute -right-6 top-1/2 -translate-y-1/2 w-60 h-60 rounded-full blur-3xl pointer-events-none opacity-30"
            style={{
              background: isProfit
                ? 'radial-gradient(circle, #00e599 0%, transparent 70%)'
                : 'radial-gradient(circle, #f43f5e 0%, transparent 70%)',
            }}
          />

          {/* Character Artwork Layer on the right */}
          <div className="absolute right-0 bottom-0 top-0 w-[46%] pointer-events-none select-none flex items-end justify-end overflow-hidden">
            <img
              src={selectedImage.url}
              alt={selectedImage.name}
              crossOrigin="anonymous"
              className="h-[96%] max-h-[235px] w-auto object-contain object-bottom transition-all duration-300 transform scale-105"
            />
          </div>

          {/* Left Content Area */}
          <div className="relative z-10 flex flex-col justify-between h-full space-y-2.5 max-w-[62%]">
            {/* Top Brand & Clean Subtitle (Simple text, no bulky container boxes) */}
            <div>
              <div className="flex items-center gap-1.5">
                <img
                  src="/logo.png"
                  alt="SwiftEx"
                  className="w-5 h-5 object-contain rounded-full bg-white/10"
                  onError={e => {
                    (e.target as HTMLImageElement).src = 'https://app.swiftexchange.io/logo.png';
                  }}
                />
                <span className="text-sm font-black text-white tracking-wider">SWIFTEX</span>
                <span className="text-xs text-zinc-400 font-normal">Stellar PnL</span>
              </div>

              {/* Timeframe & Masked Address on a single clean line */}
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-normal mt-1">
                <span>{friendlyTimeframe}</span>
                <span className="text-zinc-600">•</span>
                <span className="font-mono text-zinc-300">{maskedAddress}</span>
              </div>
            </div>

            {/* Realized Hero PnL */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                Total Realized PnL
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span
                  className={`text-3xl sm:text-4xl font-black tracking-tight ${
                    isProfit ? 'text-[#00e599]' : 'text-rose-500'
                  }`}
                >
                  {displayPnL}
                </span>
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isProfit ? 'text-[#00e599]' : 'text-rose-500'
                  }`}
                >
                  USD
                </span>
              </div>
            </div>

            {/* Stellar Portfolio Metrics (Win Rate & Total Trades) */}
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              <div>
                <div className="text-[10px] text-zinc-400 font-medium">Win Rate</div>
                <div className="text-xs sm:text-[13px] font-bold text-purple-400 mt-0.5 font-mono">
                  {winRate}%
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 font-medium">Total Trades</div>
                <div className="text-xs sm:text-[13px] font-bold text-cyan-400 mt-0.5 font-mono">
                  {tradeCount || 1} Trades
                </div>
              </div>
            </div>

            {/* Top Asset & Network */}
            <div className="grid grid-cols-2 gap-3 pt-0.5">
              <div>
                <div className="text-[10px] text-zinc-400 font-medium">Top Asset</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5 font-mono truncate">
                  {bestTrade?.asset || 'XLM'}
                  {bestTrade?.pnl ? (
                    <span className="text-[10px] text-emerald-400/80 ml-1">
                      (+${bestTrade.pnl.toFixed(0)})
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 font-medium">Network</div>
                <div className="text-xs font-bold text-sky-400 tracking-wide font-mono mt-0.5">
                  Pubnet
                </div>
              </div>
            </div>

            {/* Bottom Verification Strip */}
            <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-zinc-400">
              <span className="text-emerald-400 font-medium">✓ Verified On-Chain</span>
              <span className="font-mono text-zinc-500">Ref: {displayReferral}</span>
            </div>
          </div>
        </div>

        {/* Thumbnail Selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Choose your background image
          </span>
          <div className="flex items-center gap-2.5">
            {SHARE_BACKGROUND_IMAGES.map((img, index) => {
              const isSelected = selectedImageIndex === index;
              return (
                <button
                  key={img.id}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 bg-[var(--color-bg-tertiary)] ${
                    isSelected
                      ? 'border-2 border-[var(--color-brand-primary)] ring-2 ring-[var(--color-brand-primary)]/40 shadow-md scale-105'
                      : 'border border-[var(--color-border)] opacity-60 hover:opacity-100 hover:border-[var(--color-text-secondary)]'
                  }`}
                  title={img.name}
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover object-center"
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Minimal Action Buttons Row (WhatsApp, X, Telegram, Discord, Copy, Download) */}
        <div className="flex items-center justify-center gap-3 sm:gap-5 pt-3 border-t border-[var(--color-border)]">
          {/* WhatsApp */}
          <button
            onClick={handleWhatsAppShare}
            className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 group"
            title="Share to WhatsApp"
          >
            <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
              WhatsApp
            </span>
          </button>

          {/* X (Twitter) */}
          <button
            onClick={handleTwitterShare}
            className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 group"
            title="Share to X"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">𝕏</span>
          </button>

          {/* Telegram */}
          <button
            onClick={handleTelegramShare}
            className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 group"
            title="Share to Telegram"
          >
            <div className="w-8 h-8 rounded-full bg-[#2AABEE] text-white flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
              </svg>
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
              Telegram
            </span>
          </button>

          {/* Discord */}
          <button
            onClick={handleDiscordShare}
            className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 group"
            title="Copy image for Discord"
          >
            <div className="w-8 h-8 rounded-full bg-[#5865F2] text-white flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
              Discord
            </span>
          </button>

          {/* Copy Image */}
          <button
            onClick={handleCopyImageToClipboard}
            className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 group"
            title="Copy image directly to clipboard"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              {isCopied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
              {isCopied ? 'Copied!' : 'Copy'}
            </span>
          </button>

          {/* Download */}
          <button
            onClick={handleDownloadImage}
            className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-tertiary)] rounded-xl transition-all cursor-pointer flex flex-col items-center gap-1 group"
            title="Download PNG"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Download className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
              Download
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
