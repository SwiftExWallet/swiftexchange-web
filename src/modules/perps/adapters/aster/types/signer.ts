export interface AsterSignRequestParams {
  userAddress: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params: Record<string, string>;
  chainId: number;
  serverTime: number;
}

export interface AsterSignResponse {
  signature: string;
  nonce: string;
  timestamp: string;
  signerAddress: string;
}

export interface IAsterSigner {
  getAddress(): Promise<string>;
  signAsterRequest(params: AsterSignRequestParams): Promise<AsterSignResponse>;
  isIsolated?: boolean;
}
