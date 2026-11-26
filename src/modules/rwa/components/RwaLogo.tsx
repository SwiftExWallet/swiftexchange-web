import React, { useState } from 'react';

interface RwaLogoProps {
  logo?: string | null;
  symbol: string;
  size?: number;
}

export const RwaLogo: React.FC<RwaLogoProps> = ({ logo, symbol, size = 36 }) => {
  const [failed, setFailed] = useState(false);

  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="rounded-full object-cover bg-secondary border border-divider/40 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-brand/15 text-brand font-bold flex items-center justify-center border border-brand/30 shrink-0 text-xs"
      style={{ width: size, height: size }}
    >
      {symbol.slice(0, 3).toUpperCase()}
    </div>
  );
};
