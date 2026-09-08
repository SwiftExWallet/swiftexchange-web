import { signL1Action } from '@nktkas/hyperliquid/signing';

import type {
  CancelPayload,
  OrderPayload,
  PerpSigner,
  SignatureResponse,
} from '../../core/signing/signer';

/**
 * Hyperliquid authentic implementation of PerpSigner using @nktkas/hyperliquid/signing
 */
export class HyperliquidSigner implements PerpSigner {
  private wallet?: any;

  constructor(wallet?: any) {
    this.wallet = wallet;
  }

  public setWallet(wallet: any): void {
    this.wallet = wallet;
  }

  public async initialize(): Promise<void> {
    return Promise.resolve();
  }

  public async signOrder(order: OrderPayload): Promise<SignatureResponse> {
    if (!this.wallet) {
      throw new Error('HyperliquidSigner wallet not initialized');
    }

    const action = {
      type: 'order',
      orders: [
        {
          a: order.assetId,
          b: order.isBuy,
          p: String(order.limitPx),
          s: String(order.sz),
          r: Boolean(order.reduceOnly),
          t: order.orderType,
        },
      ],
      grouping: 'na',
    };

    const nonce = Date.now();
    const sig = await signL1Action({ wallet: this.wallet, action, nonce });

    return {
      signature: `${sig.r}${sig.s.slice(2)}${sig.v.toString(16)}`,
      payload: action,
    };
  }

  public async signCancel(cancel: CancelPayload): Promise<SignatureResponse> {
    if (!this.wallet) {
      throw new Error('HyperliquidSigner wallet not initialized');
    }

    const action = {
      type: 'cancel',
      cancels: [
        {
          a: cancel.assetId,
          o: Number(cancel.oid),
        },
      ],
    };

    const nonce = Date.now();
    const sig = await signL1Action({ wallet: this.wallet, action, nonce });

    return {
      signature: `${sig.r}${sig.s.slice(2)}${sig.v.toString(16)}`,
      payload: action,
    };
  }
}
