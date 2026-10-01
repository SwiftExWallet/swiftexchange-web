import {
  type CctpBridgeTransfer,
  type CctpCreateBridgeRequest,
  createCctpBridge,
  submitCctpDestinationTx,
  submitCctpSourceTx,
} from '../../../../../../service/evmToStellarCctpService';
import { sendEVMTransaction } from '../../../../../../utils/walletConnectUtils';
import {
  refreshStellarPreconditions,
  signAndSubmitTransaction,
} from '../../../../../stellar/utils/transactionService';
import { getStellarConfig } from '../../../../../walletconnect/config/chains';
import { parseRawChainId, switchOrAddChain } from '../../../../utils/evmChainUtils';

export interface ExecuteEvmToStellarParams {
  currentTransfer: CctpBridgeTransfer;
  evmAddress: string;
  stellarAddress: string;
  amount: string;
  chainConfig: any;
  currentNetwork: 'mainnet' | 'testnet';
  networkPassphrase: string;
  evmProvider?: any;
  stellarProvider?: any;
  signEvmTx?: (rawTx: any, evmAddress: string, chainId: number) => Promise<string>;
  signStellarTx?: (xdr: string) => Promise<string>;
  onMessage?: (msg: string) => void;
  onSuccess?: (transfer: CctpBridgeTransfer) => void;
}

export async function waitForEvmReceipt(
  provider: any,
  txHash: string,
  timeoutMs = 120_000,
  rpcUrl?: string
): Promise<any> {
  const start = Date.now();
  const cleanHash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;

  while (Date.now() - start < timeoutMs) {
    try {
      if (provider && typeof provider.request === 'function') {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [cleanHash],
        });
        if (receipt && receipt.blockNumber) {
          if (receipt.status === '0x0' || receipt.status === 0) {
            throw new Error(`Transaction reverted on-chain (hash: ${cleanHash})`);
          }
          return receipt;
        }
      } else if (rpcUrl) {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getTransactionReceipt',
            params: [cleanHash],
          }),
        });
        const data = await res.json();
        const receipt = data?.result;
        if (receipt && receipt.blockNumber) {
          if (receipt.status === '0x0' || receipt.status === 0) {
            throw new Error(`Transaction reverted on-chain (hash: ${cleanHash})`);
          }
          return receipt;
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('reverted')) throw err;
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  return null;
}

export async function executeEvmSigning(
  params: ExecuteEvmToStellarParams
): Promise<CctpBridgeTransfer> {
  const {
    currentTransfer,
    evmAddress,
    stellarAddress,
    amount,
    chainConfig,
    evmProvider,
    signEvmTx,
    onMessage,
  } = params;

  const signingRequest = currentTransfer?.signingRequest;
  if (signingRequest?.type !== 'EVM') return currentTransfer;

  if (!signingRequest.rawTx) {
    throw new Error('Backend did not return rawTx.');
  }

  const rawTx = signingRequest.rawTx;
  let signedTxHex = '';
  const targetChainId = chainConfig.chainId;

  if (signEvmTx) {
    signedTxHex = await signEvmTx(rawTx, evmAddress || '', targetChainId);
  } else if (typeof (window as any)?.TransactionSigner?.signTransaction === 'function') {
    const rawTxStr = typeof rawTx === 'string' ? rawTx : JSON.stringify(rawTx);
    const res = await (window as any).TransactionSigner.signTransaction(
      chainConfig.nativeChainKey,
      evmAddress,
      rawTxStr,
      targetChainId
    );
    if (!res?.success || typeof res?.signedTx !== 'string') {
      throw new Error('Native signer returned invalid signedTx');
    }
    signedTxHex = res.signedTx;
  } else if (evmProvider) {
    const parsedTx = typeof rawTx === 'string' ? JSON.parse(rawTx) : { ...rawTx };

    try {
      if (typeof evmProvider.request === 'function') {
        const rawChainId = await evmProvider.request({ method: 'eth_chainId' });
        const activeChain = parseRawChainId(rawChainId);
        if (activeChain !== Number(targetChainId)) {
          await switchOrAddChain(evmProvider, targetChainId);
        }
      }
    } catch (switchErr) {
      console.warn('[CCTP Bridge] Chain switch check warning:', switchErr);
    }

    const toHex = (val: any) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'string') {
        return val.startsWith('0x') ? val : '0x' + BigInt(val).toString(16);
      }
      if (typeof val === 'number' || typeof val === 'bigint') {
        return '0x' + val.toString(16);
      }
      return val;
    };

    const txParams: Record<string, any> = {
      from: evmAddress,
      to: parsedTx.to,
      data: parsedTx.data || '0x',
      value: toHex(parsedTx.value) || '0x0',
    };

    if (parsedTx.nonce !== undefined && parsedTx.nonce !== null) {
      txParams.nonce = toHex(parsedTx.nonce);
    }

    if (parsedTx.gasLimit || parsedTx.gas) {
      const gasVal = toHex(parsedTx.gasLimit || parsedTx.gas);
      txParams.gas = gasVal;
      txParams.gasLimit = gasVal;
    }

    if (parsedTx.gasPrice) {
      txParams.gasPrice = toHex(parsedTx.gasPrice);
    }

    if (parsedTx.maxFeePerGas) {
      txParams.maxFeePerGas = toHex(parsedTx.maxFeePerGas);
    }

    if (parsedTx.maxPriorityFeePerGas) {
      txParams.maxPriorityFeePerGas = toHex(parsedTx.maxPriorityFeePerGas);
    }

    if (parsedTx.chainId !== undefined && parsedTx.chainId !== null) {
      txParams.chainId = toHex(parsedTx.chainId);
    } else if (targetChainId) {
      txParams.chainId = toHex(targetChainId);
    }

    if (parsedTx.type !== undefined && parsedTx.type !== null) {
      txParams.type = toHex(parsedTx.type);
    }

    signedTxHex = await sendEVMTransaction(evmProvider, targetChainId, txParams);
  } else {
    throw new Error('No EVM wallet connected to sign transaction');
  }

  if (!signedTxHex) {
    throw new Error('Wallet did not return a transaction hash');
  }

  const normalizedTxHash = '0x' + signedTxHex.replace(/^(0x)+/i, '');
  const isApproval = signingRequest?.purpose === 'APPROVAL';

  if (isApproval) {
    onMessage?.('USDC approval submitted. Waiting for on-chain confirmation...');
    await waitForEvmReceipt(evmProvider, normalizedTxHash, 120_000, chainConfig.rpcUrl);

    onMessage?.('USDC approved! Generating CCTP deposit transaction...');

    const bridgePayload: CctpCreateBridgeRequest = {
      direction: 'EVM_TO_STELLAR',
      evmAddress: currentTransfer.evmAddress || evmAddress || '',
      stellarAddress: currentTransfer.stellarAddress || stellarAddress || '',
      amount: amount.trim() || currentTransfer.amount || '',
      sourceChain: chainConfig.sourceChainKey,
      fast: currentTransfer.fast,
    };

    let nextTransfer = await createCctpBridge(bridgePayload);

    let retries = 0;
    while (nextTransfer.status === 'APPROVAL_SIGNATURE_REQUIRED' && retries < 5) {
      retries++;
      await new Promise(r => setTimeout(r, 2500));
      nextTransfer = await createCctpBridge(bridgePayload);
    }

    const finalTransfer: CctpBridgeTransfer = {
      ...nextTransfer,
      approvalTxHash: normalizedTxHash,
    };

    if (
      finalTransfer.signingRequest?.type === 'EVM' &&
      finalTransfer.signingRequest?.purpose === 'BRIDGE'
    ) {
      onMessage?.('USDC approved! Confirm CCTP deposit in EVM wallet...');
      return await executeEvmSigning({
        ...params,
        currentTransfer: finalTransfer,
      });
    }

    return finalTransfer;
  }

  onMessage?.('Deposit broadcasted! Notifying bridge relayer...');

  let updatedTransfer: CctpBridgeTransfer;
  try {
    updatedTransfer = await submitCctpSourceTx(currentTransfer.id, normalizedTxHash);
  } catch {
    updatedTransfer = {
      ...currentTransfer,
      status: 'SOURCE_PENDING',
      sourceTxHash: normalizedTxHash,
      signingRequest: null,
    };
  }

  return {
    ...updatedTransfer,
    status: 'SOURCE_PENDING',
    sourceTxHash: normalizedTxHash,
    signingRequest: null,
  };
}

export async function executeStellarMint(
  params: ExecuteEvmToStellarParams
): Promise<CctpBridgeTransfer> {
  const {
    currentTransfer,
    stellarAddress,
    currentNetwork,
    networkPassphrase,
    stellarProvider,
    signStellarTx,
    onMessage,
    onSuccess,
  } = params;

  const signingRequest = currentTransfer?.signingRequest;
  const rawXdr = signingRequest?.xdr || currentTransfer?.stellarUnsignedXdr;
  if (!rawXdr) {
    throw new Error('Backend did not return Stellar XDR.');
  }

  const xdr = refreshStellarPreconditions(rawXdr, networkPassphrase);
  onMessage?.('Confirm & broadcast USDC mint in Stellar wallet...');

  let stellarTxHash = '';

  if (signStellarTx) {
    const signedRes = await signStellarTx(xdr);
    if (signedRes.length === 64 && /^[0-9a-fA-F]+$/.test(signedRes)) {
      stellarTxHash = signedRes;
    } else {
      const { submitToHorizon } = await import('../../../../../stellar/utils/transactionService');
      const config = getStellarConfig(currentNetwork);
      stellarTxHash = await submitToHorizon(signedRes, config.horizonUrl);
    }
  } else {
    const submitRes = await signAndSubmitTransaction({
      xdr,
      network: currentNetwork,
      networkPassphrase,
      provider: stellarProvider,
      stellarAddress,
    });

    if (!submitRes || !submitRes.success || !submitRes.hash) {
      throw new Error(submitRes?.error || 'Stellar mint failed or was cancelled');
    }
    stellarTxHash = submitRes.hash;
  }

  if (!stellarTxHash) {
    throw new Error('Stellar network did not return transaction hash.');
  }

  onMessage?.('USDC minted on Stellar! Finalizing transfer...');

  try {
    await submitCctpDestinationTx(currentTransfer.id, stellarTxHash);
  } catch {
    void 0;
  }

  const completedTransfer: CctpBridgeTransfer = {
    ...currentTransfer,
    status: 'COMPLETED',
    destinationTxHash: stellarTxHash,
    signingRequest: null,
  };

  onSuccess?.(completedTransfer);
  return completedTransfer;
}
