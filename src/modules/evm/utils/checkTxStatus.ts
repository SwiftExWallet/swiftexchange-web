export const PUBLIC_TX_CHEKER: Record<string, string> = {
  ETH: `https://eth.blockscout.com/api/v2/transactions/`,
  BSC: `https://bsc.blockscout.com/api/v2/transactions/`,
  BNB: `https://bsc.blockscout.com/api/v2/transactions/`,
  POL: `https://polygon.blockscout.com/api/v2/transactions/`,
  ARB: `https://arbitrum.blockscout.com/api/v2/transactions/`,
  OPT: `https://optimism.blockscout.com/api/v2/transactions/`,
  AVAX: `https://avalanche.blockscout.com/api/v2/transactions/`,
  BASE: `https://base.blockscout.com/api/v2/transactions/`,
};

export const checkTxStatus = async (txHash: string, chain: string) => {
  const baseUrl = PUBLIC_TX_CHEKER[chain];
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}${txHash}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'ok' || data.result === 'success') {
      return { status: true, message: data.result, chain, reqStatus: data.status };
    } else {
      return { status: false, message: data.result, chain, reqStatus: data.status };
    }
  } catch {
    return null;
  }
};
