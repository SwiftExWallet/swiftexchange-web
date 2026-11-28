import { getEVMNetworkConfig } from '@/modules/evm/utils/evmUtils';
import { Contract, Interface, JsonRpcProvider } from 'ethers';

import { CHAIN_INFO, HORIZON, MULTICALL3, ONEINCH_LOP } from '../config/rwaConfig';
import type { RwaAsset, RwaChain } from '../types/rwa.types';

const providers = new Map<string, JsonRpcProvider>();
const lastGood = new Map<number, string>();

const rpcUrlsFor = (chainId: number): string[] => {
  const urls = (getEVMNetworkConfig(chainId)?.rpcUrls || []).filter(
    u => typeof u === 'string' && /^https:\/\//.test(u)
  );
  const uniq = Array.from(new Set(urls)).sort(
    (a, b) => (/publicnode\.com/.test(b) ? 1 : 0) - (/publicnode\.com/.test(a) ? 1 : 0)
  );
  const good = lastGood.get(chainId);
  return good && uniq.includes(good) ? [good, ...uniq.filter(u => u !== good)] : uniq;
};

const providerFor = (url: string, chainId: number): JsonRpcProvider => {
  const key = `${chainId}:${url}`;
  if (!providers.has(key)) {
    providers.set(key, new JsonRpcProvider(url, chainId, { staticNetwork: true }));
  }
  return providers.get(key)!;
};

export const withRpc = async <T>(
  chain: RwaChain,
  fn: (provider: JsonRpcProvider) => Promise<T>
): Promise<T> => {
  const info = CHAIN_INFO[chain];
  if (!info.chainId) throw new Error(`No EVM chainId for ${chain}`);
  const urls = rpcUrlsFor(info.chainId).slice(0, 4);
  let lastErr: unknown = new Error('no RPC configured');
  for (const url of urls) {
    try {
      const r = await fn(providerFor(url, info.chainId));
      lastGood.set(info.chainId, url);
      return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
};

const ERC20_IFACE = new Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);
const MC_ABI = [
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])',
];
const CHUNK = 200;

export const evmBalances = async (
  chain: RwaChain,
  wallet: string,
  assets: RwaAsset[]
): Promise<Record<string, string>> => {
  const info = CHAIN_INFO[chain];
  if (!info || !info.chainId || !wallet || !assets.length) return {};
  const out: Record<string, string> = {};
  const chunks: RwaAsset[][] = [];
  for (let i = 0; i < assets.length; i += CHUNK) chunks.push(assets.slice(i, i + CHUNK));

  for (let i = 0; i < chunks.length; i += 2) {
    await Promise.all(
      chunks.slice(i, i + 2).map(async part => {
        const calls = part.map(a => ({
          target: a.address!,
          allowFailure: true,
          callData: ERC20_IFACE.encodeFunctionData('balanceOf', [wallet]),
        }));
        const res = await withRpc(chain, async p => {
          const mc = new Contract(MULTICALL3, MC_ABI, p);
          return mc.aggregate3(calls) as Promise<{ success: boolean; returnData: string }[]>;
        });
        res.forEach((r, idx) => {
          if (!r?.success || !r.returnData || r.returnData === '0x') return;
          try {
            const [val] = ERC20_IFACE.decodeFunctionResult('balanceOf', r.returnData);
            const raw = BigInt(val);
            if (raw > 0n) out[part[idx].id] = raw.toString();
          } catch {
            // ignore decode failure
          }
        });
      })
    );
  }
  return out;
};

export const tokenBalance = async (
  chain: RwaChain,
  tokenAddress: string,
  wallet: string
): Promise<string> => {
  return withRpc(chain, async p => {
    const c = new Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], p);
    const val: bigint = await c.balanceOf(wallet);
    return val.toString();
  });
};

export const tokenAllowance = async (
  chain: RwaChain,
  tokenAddress: string,
  wallet: string,
  spender = ONEINCH_LOP
): Promise<string> => {
  return withRpc(chain, async p => {
    const c = new Contract(
      tokenAddress,
      ['function allowance(address,address) view returns (uint256)'],
      p
    );
    const val: bigint = await c.allowance(wallet, spender);
    return val.toString();
  });
};

export const nativeBalance = async (chain: RwaChain, wallet: string): Promise<string> => {
  return withRpc(chain, async p => {
    const val = await p.getBalance(wallet);
    return val.toString();
  });
};

export const gasPrice = async (chain: RwaChain): Promise<string> => {
  return withRpc(chain, async p => {
    const feeData = await p.getFeeData();
    const gp = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    return gp.toString();
  });
};

export const stellarBalances = async (
  stellarAddress: string,
  assets: RwaAsset[]
): Promise<Record<string, string>> => {
  if (!stellarAddress || !assets.length) return {};
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 12_000) : null;
  try {
    const res = await fetch(`${HORIZON}/accounts/${encodeURIComponent(stellarAddress)}`, {
      signal: controller?.signal,
    });
    if (!res.ok) return {};
    const acct = await res.json();
    const bals: any[] = Array.isArray(acct?.balances) ? acct.balances : [];
    const out: Record<string, string> = {};
    assets.forEach(a => {
      const hit = bals.find(b => b.asset_code === a.code && b.asset_issuer === a.stellarIssuer);
      if (hit && Number(hit.balance) > 0) {
        out[a.id] = String(hit.balance);
      }
    });
    return out;
  } catch {
    return {};
  } finally {
    if (timer) clearTimeout(timer);
  }
};
