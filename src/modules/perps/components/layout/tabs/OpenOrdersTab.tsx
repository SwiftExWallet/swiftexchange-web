import React, { useState } from 'react';

import { useOrderStore } from '../../../core/stores/orderStore';
import { useUnifiedExecution } from '../../../services/useUnifiedExecution';

interface Props {
  signer?: any;
  userAddr?: string;
}

export const OpenOrdersTab: React.FC<Props> = () => {
  const orders = useOrderStore(state => state.orders);
  const displayOrders = Object.values(orders).filter(
    o => o.status === 'new' || o.status === 'partially_filled'
  );
  const { isReady, cancelSingleOrder } = useUnifiedExecution();

  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const handleCancel = async (symbol: string, orderId: string) => {
    if (!isReady) return;
    setCancelingId(orderId);
    try {
      await cancelSingleOrder(symbol, orderId);
    } catch (e) {
      console.error('Failed to cancel order:', e);
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="w-full h-full overflow-x-auto overflow-y-auto scrollbar-thin">
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-secondary z-10">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Time</th>
            <th className="px-2.5 py-1.5 font-medium">Type</th>
            <th className="px-2.5 py-1.5 font-medium">Symbol</th>
            <th className="px-2.5 py-1.5 font-medium">Side</th>
            <th className="px-2.5 py-1.5 font-medium">Price</th>
            <th className="px-2.5 py-1.5 font-medium">Amount</th>
            <th className="px-2.5 py-1.5 font-medium">Status</th>
            <th className="px-2.5 py-1.5 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {displayOrders.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-muted">
                No open orders
              </td>
            </tr>
          ) : (
            displayOrders.map(o => (
              <tr key={o.id} className="border-b border-color hover:bg-hover transition-colors">
                <td className="px-2.5 py-1.5 text-secondary">
                  {new Date(o.timestamp).toLocaleString()}
                </td>
                <td className="px-2.5 py-1.5 text-primary uppercase font-medium">{o.type}</td>
                <td className="px-2.5 py-1.5 text-primary font-medium">{o.symbol}</td>
                <td
                  className={`px-2.5 py-1.5 font-medium ${o.side === 'buy' ? 'text-success' : 'text-danger'} uppercase`}
                >
                  {o.side}
                </td>
                <td className="px-2.5 py-1.5 text-primary font-mono-tabular">{o.price}</td>
                <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
                  {o.filledSize} / {o.size}
                </td>
                <td className="px-2.5 py-1.5 text-secondary uppercase">{o.status}</td>
                <td className="px-2.5 py-1.5 text-right">
                  <button
                    onClick={() => handleCancel(o.symbol.replace('-', ''), o.id)}
                    disabled={cancelingId === o.id || !isReady}
                    className="text-[10px] bg-tertiary hover:bg-hover px-2 py-0.5 rounded text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title={!isReady ? 'Trading session not active' : 'Cancel Order'}
                  >
                    {cancelingId === o.id ? '...' : 'Cancel'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
