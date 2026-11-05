import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCheck,
  Layers,
  Percent,
  Send,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import React from 'react';

export interface FintechBadgeInfo {
  icon: React.ReactNode;
  badgeBg: string;
  tag?: string;
  tagColor?: string;
  isPositive?: boolean;
}

/**
 * Returns a high-contrast, premium fintech icon and badge style based on
 * the notification's action, title, and type.
 */
export function getFintechNotificationBadge(notif: {
  type?: string;
  title?: string;
  message?: any;
  status?: string;
}): FintechBadgeInfo {
  const title = (notif.title || '').toLowerCase();
  const msgStr = typeof notif.message === 'string' ? notif.message.toLowerCase() : '';
  const isError =
    notif.status === 'error' ||
    title.includes('failed') ||
    title.includes('rejected') ||
    title.includes('error') ||
    title.includes('expired');

  // 1. Error / Rejected / Failed
  if (isError) {
    return {
      icon: <XCircle size={15} className="text-rose-400" />,
      badgeBg:
        'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.18)]',
      tag: title.includes('rejected') ? 'REJECTED' : 'FAILED',
      tagColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      isPositive: false,
    };
  }

  // 2. Order Filled / Executed
  if (title.includes('filled') || title.includes('executed')) {
    return {
      icon: <CheckCheck size={16} className="text-emerald-400 stroke-[2.2]" />,
      badgeBg:
        'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.2)]',
      tag: 'FILLED',
      tagColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      isPositive: true,
    };
  }

  // 3. Order Partially Filled
  if (title.includes('partial')) {
    return {
      icon: <Percent size={14} className="text-sky-400 stroke-[2.2]" />,
      badgeBg:
        'bg-sky-500/15 border-sky-500/30 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.18)]',
      tag: 'PARTIAL',
      tagColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      isPositive: true,
    };
  }

  // 4. Order Placed - Long / Buy
  if (title.includes('order') || title.includes('placed')) {
    const isBuy =
      title.includes('long') ||
      title.includes('buy') ||
      msgStr.includes('buy') ||
      msgStr.includes('long');
    const isSell =
      title.includes('short') ||
      title.includes('sell') ||
      msgStr.includes('sell') ||
      msgStr.includes('short');

    if (isBuy) {
      return {
        icon: <TrendingUp size={15} className="text-emerald-400 stroke-[2.2]" />,
        badgeBg:
          'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.18)]',
        tag: 'BUY ORDER',
        tagColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        isPositive: true,
      };
    }

    if (isSell) {
      return {
        icon: <TrendingDown size={15} className="text-rose-400 stroke-[2.2]" />,
        badgeBg:
          'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.18)]',
        tag: 'SELL ORDER',
        tagColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        isPositive: false,
      };
    }

    return {
      icon: <ArrowUpRight size={15} className="text-cyan-400 stroke-[2.2]" />,
      badgeBg:
        'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.18)]',
      tag: 'ORDER',
      tagColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      isPositive: true,
    };
  }

  // 5. Leverage Updated
  if (title.includes('leverage')) {
    return {
      icon: <SlidersHorizontal size={15} className="text-violet-400 stroke-[2.2]" />,
      badgeBg:
        'bg-violet-500/15 border-violet-500/30 text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.2)]',
      tag: 'LEVERAGE',
      tagColor: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    };
  }

  // 6. TP / SL
  if (
    title.includes('tp') ||
    title.includes('sl') ||
    title.includes('take profit') ||
    title.includes('stop loss')
  ) {
    return {
      icon: <Target size={15} className="text-amber-400 stroke-[2.2]" />,
      badgeBg:
        'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
      tag: 'TP / SL',
      tagColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    };
  }

  // 7. Deposit
  if (title.includes('deposit')) {
    return {
      icon: <Wallet size={15} className="text-emerald-400 stroke-[2.2]" />,
      badgeBg:
        'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.18)]',
      tag: 'DEPOSIT',
      tagColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      isPositive: true,
    };
  }

  // 8. Withdrawal
  if (title.includes('withdrawal')) {
    return {
      icon: <ArrowUpRight size={15} className="text-blue-400 stroke-[2.2]" />,
      badgeBg:
        'bg-blue-500/15 border-blue-500/30 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.18)]',
      tag: 'WITHDRAW',
      tagColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    };
  }

  // 9. Swap
  if (notif.type === 'EVM_SWAP' || title.includes('swap')) {
    return {
      icon: <ArrowLeftRight size={15} className="text-cyan-400 stroke-[2.2]" />,
      badgeBg:
        'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.18)]',
      tag: 'SWAP',
      tagColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    };
  }

  // 10. Send
  if (notif.type === 'SEND' || title.includes('send')) {
    return {
      icon: <Send size={14} className="text-emerald-400 stroke-[2.2]" />,
      badgeBg:
        'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.18)]',
      tag: 'SEND',
      tagColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    };
  }

  // 11. Receive
  if (notif.type === 'RECEIVE' || title.includes('receive')) {
    return {
      icon: <ArrowDownLeft size={15} className="text-violet-400 stroke-[2.2]" />,
      badgeBg:
        'bg-violet-500/15 border-violet-500/30 text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.18)]',
      tag: 'RECEIVE',
      tagColor: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    };
  }

  // 12. Bridge
  if (notif.type === 'BRIDGE' || title.includes('bridge')) {
    return {
      icon: <Layers size={15} className="text-indigo-400 stroke-[2.2]" />,
      badgeBg:
        'bg-indigo-500/15 border-indigo-500/30 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.18)]',
      tag: 'BRIDGE',
      tagColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    };
  }

  // 13. Stellar
  if (notif.type === 'STELLAR' || title.includes('stellar')) {
    return {
      icon: <Sparkles size={15} className="text-amber-400 stroke-[2.2]" />,
      badgeBg:
        'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.18)]',
      tag: 'STELLAR',
      tagColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    };
  }

  // 14. Default / DYDX / Perps general
  return {
    icon: <Zap size={15} className="text-blue-400 stroke-[2.2]" />,
    badgeBg:
      'bg-blue-500/15 border-blue-500/30 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.18)]',
    tag: 'PERPS',
    tagColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
}
