import type { NetworkType } from '@/modules/walletconnect/config/chains';
import * as StellarSDK from '@stellar/stellar-sdk';

import type { SingleVaultConfig } from '../config/vault.config';
import { getVaultEnvironment } from '../config/vault.config';
import type {
  InterestRateModelData,
  UserVaultPosition,
  VaultActivityRecord,
  VaultMetrics,
} from '../types/vault.types';
import { convertToAssets, formatPreciseUnits, formatTokenUnits } from '../utils/vaultFormatters';

const rpcServers = new Map<string, StellarSDK.rpc.Server>();
const horizonServers = new Map<string, StellarSDK.Horizon.Server>();

export const getRpcServer = (network: NetworkType = 'testnet'): StellarSDK.rpc.Server => {
  const env = getVaultEnvironment(network);
  let server = rpcServers.get(env.rpcUrl);
  if (!server) {
    server = new StellarSDK.rpc.Server(env.rpcUrl);
    rpcServers.set(env.rpcUrl, server);
  }
  return server;
};

export const getHorizonServer = (network: NetworkType = 'testnet'): StellarSDK.Horizon.Server => {
  const env = getVaultEnvironment(network);
  let server = horizonServers.get(env.horizonUrl);
  if (!server) {
    server = new StellarSDK.Horizon.Server(env.horizonUrl);
    horizonServers.set(env.horizonUrl, server);
  }
  return server;
};

export class VaultService {
  /**
   * Fetches live on-chain metrics for a vault
   */
  static async fetchVaultMetrics(
    vault: SingleVaultConfig,
    network: NetworkType = 'testnet'
  ): Promise<VaultMetrics> {
    const rpc = getRpcServer(network);
    const env = getVaultEnvironment(network);
    const contract = new StellarSDK.Contract(vault.vaultAddress);
    const dummyAccount = new StellarSDK.Account(
      vault.roles.vaultManager || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      '100'
    );

    let totalAssets = 0n;
    let totalShares = 0n;
    let idleAmount = 0n;
    let investedAmount = 0n;
    let feeBps = 0;

    // 1. Fetch total managed funds
    try {
      const simFunds = await rpc.simulateTransaction(
        new StellarSDK.TransactionBuilder(dummyAccount, {
          fee: '100',
          networkPassphrase: env.networkPassphrase,
        })
          .addOperation(contract.call('fetch_total_managed_funds'))
          .setTimeout(30)
          .build()
      );

      if (StellarSDK.rpc.Api.isSimulationSuccess(simFunds) && simFunds.result) {
        const rawFunds = StellarSDK.scValToNative(simFunds.result.retval);
        if (Array.isArray(rawFunds) && rawFunds.length > 0) {
          const item = rawFunds[0];
          totalAssets = BigInt(item.total_amount?.toString() || '0');
          idleAmount = BigInt(item.idle_amount?.toString() || '0');
          investedAmount = BigInt(item.invested_amount?.toString() || '0');
        }
      }
    } catch (e) {
      console.warn(`[VaultService] Failed to fetch total managed funds for ${vault.id}:`, e);
    }

    // 2. Fetch total shares (total_supply)
    try {
      const simSupply = await rpc.simulateTransaction(
        new StellarSDK.TransactionBuilder(dummyAccount, {
          fee: '100',
          networkPassphrase: env.networkPassphrase,
        })
          .addOperation(contract.call('total_supply'))
          .setTimeout(30)
          .build()
      );

      if (StellarSDK.rpc.Api.isSimulationSuccess(simSupply) && simSupply.result) {
        totalShares = BigInt(StellarSDK.scValToNative(simSupply.result.retval)?.toString() || '0');
      }
    } catch (e) {
      console.warn(`[VaultService] Failed to fetch total supply for ${vault.id}:`, e);
    }

    // 3. Fetch fees
    try {
      const simFees = await rpc.simulateTransaction(
        new StellarSDK.TransactionBuilder(dummyAccount, {
          fee: '100',
          networkPassphrase: env.networkPassphrase,
        })
          .addOperation(contract.call('get_fees'))
          .setTimeout(30)
          .build()
      );
      if (StellarSDK.rpc.Api.isSimulationSuccess(simFees) && simFees.result) {
        feeBps = Number(StellarSDK.scValToNative(simFees.result.retval) || 0);
      }
    } catch {
      feeBps = 0;
    }

    // 4. Calculate share price
    let sharePrice = 1.0;
    if (totalShares > 0n && totalAssets > 0n) {
      sharePrice = Number(totalAssets) / Number(totalShares);
    }

    // 5. Calculate Realized APY vs Target APY
    const realizedApyPercent =
      sharePrice > 1.0 && sharePrice <= 2.0 ? (sharePrice - 1.0) * 100 : vault.targetApyPercent;
    const utilizationPercent =
      totalAssets > 0n ? (Number(investedAmount) / Number(totalAssets)) * 100 : 0;

    let interestRateModel: InterestRateModelData | undefined;
    try {
      const irm = await VaultService.fetchInterestRateModel(vault, network);
      if (irm) interestRateModel = irm;
    } catch {
      interestRateModel = undefined;
    }

    return {
      vaultId: vault.id,
      totalAssets,
      totalShares,
      idleAmount,
      investedAmount,
      sharePrice,
      realizedApyPercent,
      targetApyPercent: vault.targetApyPercent,
      utilizationPercent,
      oraclePriceUsd: vault.underlyingAsset.oraclePriceUsd,
      feeBps,
      lastUpdated: Date.now(),
      interestRateModel,
    };
  }

  /**
   * Fetches user's vault position
   */
  static async fetchUserPosition(
    vault: SingleVaultConfig,
    userAddress: string,
    network: NetworkType = 'testnet'
  ): Promise<UserVaultPosition> {
    if (!userAddress) {
      return {
        vaultId: vault.id,
        userAddress: '',
        shares: 0n,
        underlyingAssets: 0n,
        depositedPrincipal: 0n,
        accruedYield: 0n,
        poolSharePercentage: 0,
        formatted: { shares: '0.00', underlying: '0.00', deposited: '0.00', yield: '+0.00' },
      };
    }

    const rpc = getRpcServer(network);
    const env = getVaultEnvironment(network);
    const contract = new StellarSDK.Contract(vault.vaultAddress);
    const dummyAccount = new StellarSDK.Account(userAddress, '100');

    let userShares = 0n;
    try {
      const simBal = await rpc.simulateTransaction(
        new StellarSDK.TransactionBuilder(dummyAccount, {
          fee: '100',
          networkPassphrase: env.networkPassphrase,
        })
          .addOperation(contract.call('balance', new StellarSDK.Address(userAddress).toScVal()))
          .setTimeout(30)
          .build()
      );

      if (StellarSDK.rpc.Api.isSimulationSuccess(simBal) && simBal.result) {
        userShares = BigInt(StellarSDK.scValToNative(simBal.result.retval)?.toString() || '0');
      }
    } catch (e) {
      console.warn(`[VaultService] Failed to query user share balance for ${userAddress}:`, e);
    }

    const metrics = await this.fetchVaultMetrics(vault, network);
    const underlyingAssets = convertToAssets(userShares, metrics.totalAssets, metrics.totalShares);

    // Track user principal from localStorage or baseline 1:1
    const storedPrincipalKey = `swiftex_vault_principal_${vault.id}_${userAddress}`;
    let depositedPrincipal = 0n;
    try {
      const cached = localStorage.getItem(storedPrincipalKey);
      if (cached) {
        depositedPrincipal = BigInt(cached);
      } else if (userShares > 0n) {
        depositedPrincipal = userShares;
      }
    } catch {
      depositedPrincipal = userShares;
    }

    // Pure on-chain yield calculation from contract share price appreciation
    let accruedYield = 0n;
    if (underlyingAssets > depositedPrincipal && depositedPrincipal > 0n) {
      accruedYield = underlyingAssets - depositedPrincipal;
    } else if (underlyingAssets > userShares && userShares > 0n) {
      accruedYield = underlyingAssets - userShares;
    }

    const poolSharePercentage =
      metrics.totalShares > 0n ? (Number(userShares) / Number(metrics.totalShares)) * 100 : 0;

    return {
      vaultId: vault.id,
      userAddress,
      shares: userShares,
      underlyingAssets,
      depositedPrincipal,
      accruedYield,
      poolSharePercentage,
      formatted: {
        shares: formatPreciseUnits(userShares),
        underlying: formatTokenUnits(underlyingAssets),
        deposited: formatTokenUnits(depositedPrincipal),
        yield: `+${formatTokenUnits(accruedYield)}`,
      },
    };
  }

  /**
   * Fetches user's wallet balance for the underlying token (e.g. USDC)
   */
  static async fetchUserWalletBalance(
    assetContractId: string,
    userAddress: string,
    network: NetworkType = 'testnet'
  ): Promise<{ balanceFormatted: string; stroops: bigint }> {
    if (!userAddress) return { balanceFormatted: '0.00', stroops: 0n };

    const rpc = getRpcServer(network);
    const env = getVaultEnvironment(network);
    const tokenContract = new StellarSDK.Contract(assetContractId);
    const dummyAccount = new StellarSDK.Account(userAddress, '100');

    try {
      const sim = await rpc.simulateTransaction(
        new StellarSDK.TransactionBuilder(dummyAccount, {
          fee: '100',
          networkPassphrase: env.networkPassphrase,
        })
          .addOperation(
            tokenContract.call('balance', new StellarSDK.Address(userAddress).toScVal())
          )
          .setTimeout(30)
          .build()
      );

      if (StellarSDK.rpc.Api.isSimulationSuccess(sim) && sim.result) {
        const val = BigInt(StellarSDK.scValToNative(sim.result.retval)?.toString() || '0');
        return {
          balanceFormatted: formatTokenUnits(val),
          stroops: val,
        };
      }
    } catch (e) {
      console.warn(`[VaultService] Failed to fetch token balance for ${userAddress}:`, e);
    }

    return { balanceFormatted: '0.00', stroops: 0n };
  }

  /**
   * Builds and prepares an unsigned Soroban Deposit Transaction XDR
   */
  static async buildDepositTransaction(
    vault: SingleVaultConfig,
    userAddress: string,
    amountStroops: bigint,
    network: NetworkType = 'testnet'
  ): Promise<{ xdr: string; minShares: bigint }> {
    const rpc = getRpcServer(network);
    const env = getVaultEnvironment(network);
    const account = await rpc.getAccount(userAddress);

    const metrics = await this.fetchVaultMetrics(vault, network);
    const expectedShares =
      metrics.totalShares > 0n && metrics.totalAssets > 0n
        ? (amountStroops * metrics.totalShares) / metrics.totalAssets
        : amountStroops;

    // 0.5% slippage protection
    const minShares = (expectedShares * 995n) / 1000n;

    const amountsDesiredVec = StellarSDK.xdr.ScVal.scvVec([
      StellarSDK.nativeToScVal(amountStroops, { type: 'i128' }),
    ]);
    const amountsMinVec = StellarSDK.xdr.ScVal.scvVec([
      StellarSDK.nativeToScVal(minShares, { type: 'i128' }),
    ]);

    const contract = new StellarSDK.Contract(vault.vaultAddress);
    const rawTx = new StellarSDK.TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: env.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'deposit',
          amountsDesiredVec,
          amountsMinVec,
          new StellarSDK.Address(userAddress).toScVal(),
          StellarSDK.xdr.ScVal.scvBool(false)
        )
      )
      .setTimeout(300)
      .build();

    const prepared = await rpc.prepareTransaction(rawTx);
    return {
      xdr: prepared.toXDR(),
      minShares,
    };
  }

  /**
   * Builds and prepares an unsigned Soroban Withdraw Transaction XDR
   */
  static async buildWithdrawTransaction(
    vault: SingleVaultConfig,
    userAddress: string,
    sharesToBurn: bigint,
    network: NetworkType = 'testnet'
  ): Promise<{ xdr: string; expectedAssets: bigint }> {
    const rpc = getRpcServer(network);
    const env = getVaultEnvironment(network);
    const account = await rpc.getAccount(userAddress);

    const metrics = await this.fetchVaultMetrics(vault, network);
    const expectedAssets = convertToAssets(sharesToBurn, metrics.totalAssets, metrics.totalShares);

    // 0.5% slippage protection
    const minAssets = (expectedAssets * 995n) / 1000n;

    const amountsMinVec = StellarSDK.xdr.ScVal.scvVec([
      StellarSDK.nativeToScVal(minAssets, { type: 'i128' }),
    ]);

    const contract = new StellarSDK.Contract(vault.vaultAddress);
    const rawTx = new StellarSDK.TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: env.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'withdraw',
          StellarSDK.nativeToScVal(sharesToBurn, { type: 'i128' }),
          amountsMinVec,
          new StellarSDK.Address(userAddress).toScVal()
        )
      )
      .setTimeout(300)
      .build();

    const prepared = await rpc.prepareTransaction(rawTx);
    return {
      xdr: prepared.toXDR(),
      expectedAssets,
    };
  }

  /**
   * Submits a signed transaction to Soroban RPC
   */
  static async submitSignedTransaction(
    signedXdr: string,
    network: NetworkType = 'testnet'
  ): Promise<string> {
    const rpc = getRpcServer(network);
    const env = getVaultEnvironment(network);
    const tx = StellarSDK.TransactionBuilder.fromXDR(signedXdr, env.networkPassphrase);
    const sendRes = await rpc.sendTransaction(tx);

    if (sendRes.status === 'ERROR') {
      const errorMsg =
        (sendRes as any).errorResult?.result?.switch?.name ||
        (sendRes as any).error ||
        'Transaction rejected by Soroban RPC';
      throw new Error(errorMsg);
    }

    return sendRes.hash;
  }

  /**
   * Polls Soroban RPC until transaction achieves finality
   */
  static async pollTransactionStatus(
    txHash: string,
    network: NetworkType = 'testnet',
    maxAttempts: number = 30
  ): Promise<{ success: boolean; hash: string }> {
    const rpc = getRpcServer(network);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      const res = await rpc.getTransaction(txHash);
      if (res.status === 'SUCCESS') {
        return { success: true, hash: txHash };
      }
      if (res.status === 'FAILED') {
        throw new Error('Transaction execution failed on-chain.');
      }
    }
    throw new Error('Transaction confirmation timed out. Please verify on Stellar Expert.');
  }

  /**
   * Fetches user's transaction history strictly for this DeFindex vault from Horizon (indexed ledger replica)
   * Ensures 0 Soroban RPC overhead and isolates DeFindex operations.
   */
  static async fetchVaultHistoryFromHorizon(
    userAddress: string,
    vault: SingleVaultConfig,
    network: NetworkType = 'testnet',
    cursor?: string,
    limit: number = 25
  ): Promise<{ records: VaultActivityRecord[]; nextCursor?: string; isDone: boolean }> {
    if (!userAddress) return { records: [], isDone: true };
    try {
      const horizon = getHorizonServer(network);
      let callBuilder = horizon.operations().forAccount(userAddress).order('desc').limit(limit);

      if (cursor) {
        callBuilder = callBuilder.cursor(cursor);
      }

      const res = await callBuilder.call();
      const records = res.records || [];
      const isDone = records.length < limit;
      const nextCursor = records.length > 0 ? records[records.length - 1].paging_token : undefined;
      const vaultActivities: VaultActivityRecord[] = [];

      for (const op of records) {
        if (op.type !== 'invoke_host_function') continue;

        const anyOp = op as any;
        if (!Array.isArray(anyOp.parameters) || anyOp.parameters.length < 2) continue;

        try {
          const raw0 = anyOp.parameters[0]?.value || anyOp.parameters[0];
          let contractAddress = '';
          if (raw0 && typeof raw0 === 'string') {
            const sc0 = StellarSDK.xdr.ScVal.fromXDR(raw0, 'base64');
            const v0 = StellarSDK.scValToNative(sc0);
            contractAddress = typeof v0 === 'string' ? v0 : (v0 as any)?.toString?.() || '';
          }

          if (contractAddress !== vault.vaultAddress) continue;

          const raw1 = anyOp.parameters[1]?.value || anyOp.parameters[1];
          let fnName = '';
          if (raw1 && typeof raw1 === 'string') {
            const sc1 = StellarSDK.xdr.ScVal.fromXDR(raw1, 'base64');
            const v1 = StellarSDK.scValToNative(sc1);
            fnName = typeof v1 === 'string' ? v1 : (v1 as any)?.toString?.() || '';
          }

          if (fnName !== 'deposit' && fnName !== 'withdraw') continue;

          let parsedAmount = '';
          if (anyOp.parameters.length >= 3) {
            try {
              const raw2 = anyOp.parameters[2]?.value || anyOp.parameters[2];
              if (raw2 && typeof raw2 === 'string') {
                const sc2 = StellarSDK.xdr.ScVal.fromXDR(raw2, 'base64');
                const v2 = StellarSDK.scValToNative(sc2);
                if (Array.isArray(v2) && v2.length > 0) {
                  const valItem = v2[0];
                  if (typeof valItem === 'bigint' || typeof valItem === 'number') {
                    parsedAmount = (Number(valItem) / 1e7).toFixed(2);
                  }
                } else if (typeof v2 === 'bigint' || typeof v2 === 'number') {
                  parsedAmount = (Number(v2) / 1e7).toFixed(2);
                }
              }
            } catch {
              // fallback
            }
          }

          vaultActivities.push({
            id: op.id,
            type: fnName === 'withdraw' ? 'withdraw' : 'deposit',
            vaultId: vault.id,
            vaultName: vault.name,
            vaultAddress: vault.vaultAddress,
            amount: parsedAmount || '0.00',
            symbol: vault.underlyingAsset.symbol,
            txHash: op.transaction_hash,
            timestamp: new Date(op.created_at).getTime(),
            status: 'confirmed',
          });
        } catch {
          // ignore corrupted operation entries
        }
      }

      return { records: vaultActivities, nextCursor, isDone };
    } catch (err) {
      console.warn('[VaultService] Failed to fetch vault history from Horizon:', err);
      return { records: [], isDone: true };
    }
  }

  static async fetchInterestRateModel(
    vault: SingleVaultConfig,
    network: NetworkType = 'testnet'
  ): Promise<InterestRateModelData | null> {
    try {
      const rpc = getRpcServer(network);
      const env = getVaultEnvironment(network);
      const strategyContract = new StellarSDK.Contract(vault.strategyAddress);
      const dummyAccount = new StellarSDK.Account(
        vault.roles.vaultManager || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        '100'
      );

      const sim = await rpc.simulateTransaction(
        new StellarSDK.TransactionBuilder(dummyAccount, {
          fee: '100',
          networkPassphrase: env.networkPassphrase,
        })
          .addOperation(strategyContract.call('get_pool'))
          .setTimeout(30)
          .build()
      );

      if (StellarSDK.rpc.Api.isSimulationSuccess(sim) && sim.result) {
        const raw = StellarSDK.scValToNative(sim.result.retval);
        if (raw && typeof raw === 'object') {
          const ir = raw.config?.ir_params || raw.ir_params || raw.interest_rate || null;
          if (ir) {
            const targetUtil =
              ir.target_util !== undefined ? (Number(ir.target_util) / 1e7) * 100 : 80.0;
            const maxUtil = ir.max_util !== undefined ? (Number(ir.max_util) / 1e7) * 100 : 90.0;
            const baseApr = ir.r_base !== undefined ? (Number(ir.r_base) / 1e7) * 100 : 2.5;
            const rOne = ir.r_one !== undefined ? (Number(ir.r_one) / 1e7) * 100 : 0;
            const rTwo = ir.r_two !== undefined ? (Number(ir.r_two) / 1e7) * 100 : 0;
            const currentUtil =
              raw.utilization !== undefined ? (Number(raw.utilization) / 1e7) * 100 : 0;
            const currentApr =
              currentUtil <= targetUtil
                ? baseApr + (rOne * currentUtil) / targetUtil
                : baseApr + rOne + (rTwo * (currentUtil - targetUtil)) / (maxUtil - targetUtil);

            return {
              currentApr,
              baseApr,
              currentUtilization: currentUtil,
              targetUtilization: targetUtil,
              maxUtilization: maxUtil,
              collateralFactor:
                ir.collateral_factor !== undefined ? Number(ir.collateral_factor) / 1e7 : 0,
              liabilityFactor:
                ir.liability_factor !== undefined ? Number(ir.liability_factor) / 1e7 : 0,
            };
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }
}
