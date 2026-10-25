import { getRecoveryServerUrl } from '../../../service/apiConfig';
import { getEffectiveAuthToken, makeHeaders } from '../../../service/apiService';

export const DEFAULT_PROOF_API_URL = getRecoveryServerUrl();

export interface NormalizedRecoveryStatus {
  attemptId: string;
  status: string;
  isActive: boolean;
  isRegistered?: boolean;
  email?: string;
  destination: string;
  unlockAt: number | null;
  error: string;
  raw?: any;
}

export function normalizeRecoveryStatus(result: any = {}): NormalizedRecoveryStatus {
  const pending = result?.pending || null;
  const status = result?.status || (pending ? 'PENDING' : '');
  const isActive = ['STARTED', 'PENDING', 'EXECUTING'].includes(status);
  const isRegistered = Boolean(
    result?.isRegistered ||
    result?.registered ||
    result?.email ||
    result?.guardian ||
    status === 'REGISTERED' ||
    status === 'ACTIVE' ||
    isActive ||
    Boolean(result?.attemptId || result?._id)
  );

  return {
    attemptId: String(result?.attemptId || result?._id || ''),
    status,
    isActive,
    isRegistered,
    email: result?.email || '',
    destination: result?.destination || pending?.destination || '',
    unlockAt: result?.unlockAt ?? pending?.unlockAt ?? null,
    error: result?.error || '',
    raw: result,
  };
}

export function recoveryStatusNotice(status: string): string {
  return (
    {
      STARTED: 'Recovery request received. Waiting for email verification.',
      PENDING: 'Recovery email verified. Starting the safety timelock.',
      EXECUTING: 'Recovery execution is in progress.',
      COMPLETED: 'Recovery completed successfully.',
    }[status] || ''
  );
}

export function extractUnsignedXdr(res: any): string {
  if (typeof res === 'string') return res.trim();
  return (
    res?.xdr ||
    res?.unsignedXdr ||
    res?.transactionXdr ||
    res?.txXdr ||
    res?.data?.xdr ||
    res?.data?.unsignedXdr ||
    res?.data?.transactionXdr ||
    res?.result?.xdr ||
    res?.result?.unsignedXdr ||
    ''
  );
}

export interface RecoveryAssetItem {
  type: 'native' | 'classic' | 'contract';
  code?: string;
  floor: string;
  issuer?: string;
  contract?: string;
}

export function formatRecoveryAssets(assets?: any[]): RecoveryAssetItem[] {
  if (!assets || !Array.isArray(assets)) return [];
  return assets.map(a => {
    const isContract =
      a?.type === 'contract' ||
      (Boolean(a?.contract || a?.contractId) && !a?.issuer) ||
      (Boolean(a?.tokenAddress?.startsWith('C')) &&
        !a?.issuer &&
        a?.code?.toUpperCase() !== 'XLM' &&
        a?.tokenAddress !== 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');

    if (isContract) {
      return {
        type: 'contract',
        contract: String(a?.contract || a?.contractId || a?.tokenAddress || a?.token || ''),
        floor: String(a?.floor ?? '0'),
      };
    }

    const isNative =
      a?.type === 'native' ||
      a?.code?.toUpperCase() === 'XLM' ||
      (!a?.issuer && (!a?.type || a?.type === 'native'));

    if (isNative) {
      return {
        type: 'native',
        code: 'XLM',
        floor: String(a?.floor ?? '20000000'),
      };
    }

    return {
      type: 'classic',
      code: String(a?.code || '').toUpperCase(),
      issuer: String(a?.issuer || ''),
      floor: String(a?.floor ?? '0'),
    };
  });
}

export function createRecoveryApi(_baseUrl: string = DEFAULT_PROOF_API_URL, request?: any) {
  async function call(
    path: string,
    methodName: 'GET' | 'POST',
    body?: any,
    owner?: string
  ): Promise<any> {
    if (typeof request === 'function') {
      const result = await request(path, methodName, body, owner);
      if (result?.err) throw new Error(result.err.message || 'Recovery API failed');
      return result?.res ?? result?.data ?? result;
    }

    const cleanBase = (_baseUrl || getRecoveryServerUrl() || '').trim().replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/?(v1\/)?(recovery\/)?/, '').replace(/^\/+/, '');
    const fullUrl = `${cleanBase}/${cleanPath}`;

    const headers = makeHeaders(owner ? { 'x-wallet-address': owner } : undefined, 'stellar', body);
    if (body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const options: RequestInit = {
      method: methodName,
      headers,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    };

    let response: Response;
    try {
      response = await fetch(fullUrl, options);
    } catch (networkErr: any) {
      throw new Error(
        networkErr?.message === 'Failed to fetch'
          ? 'Unable to reach the recovery server. Please check your internet connection or try again shortly.'
          : networkErr?.message || 'Network request failed'
      );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || data?.error || `Recovery API error (${response.status})`;
      const err: any = new Error(message);
      err.status = response.status;
      err.statusCode = response.status;
      err.data = data;
      throw err;
    }

    if (data?.err) {
      throw new Error(data.err.message || 'Recovery API failed');
    }

    return data?.res ?? data?.data ?? data;
  }

  return {
    async startRecovery({ owner, file }: { owner: string; file: any }) {
      if (!owner) throw new Error('Original wallet address is required');
      if (!file) throw new Error('Select the delivered .eml file first');

      const form = new FormData();
      form.append('owner', owner);

      if (file instanceof Blob || (typeof File !== 'undefined' && file instanceof File)) {
        form.append('eml', file, (file as any).name || 'recovery.eml');
      } else if (file?.uri) {
        form.append('eml', {
          uri: file.uri,
          name: file.name || 'recovery.eml',
          type: file.type || 'message/rfc822',
        } as any);
      } else {
        throw new Error('Invalid .eml file format provided');
      }

      return call('/v1/recovery/start', 'POST', form, owner);
    },

    async getRecoveryStatus(owner: string): Promise<NormalizedRecoveryStatus> {
      const token = getEffectiveAuthToken();
      if (!token) {
        return Promise.resolve(normalizeRecoveryStatus({}));
      }
      const result = await call(
        `/v1/recovery/${encodeURIComponent(owner)}`,
        'GET',
        undefined,
        owner
      );
      return normalizeRecoveryStatus(result);
    },

    executeRecovery(owner: string) {
      return call('/v1/recovery/execute', 'POST', { owner }, owner);
    },

    saveRecoveryRegistration({ email, walletAddress }: { email: string; walletAddress: string }) {
      return call('/v1/recovery/registration', 'POST', { email, walletAddress }, walletAddress);
    },

    prepareRecoveryRegistration({
      email,
      walletAddress,
      assets,
    }: {
      email: string;
      walletAddress: string;
      assets?: Array<RecoveryAssetItem | any>;
    }) {
      const formattedAssets = formatRecoveryAssets(assets);
      return call(
        '/v1/recovery/registration/prepare',
        'POST',
        { email, walletAddress, assets: formattedAssets },
        walletAddress
      );
    },

    confirmRecoveryRegistration({
      email,
      walletAddress,
      transactionHash,
    }: {
      email: string;
      walletAddress: string;
      transactionHash: string;
    }) {
      return call(
        '/v1/recovery/registration/confirm',
        'POST',
        { email, walletAddress, transactionHash },
        walletAddress
      );
    },

    prepareRecoveryCancellation(owner: string) {
      return call('/v1/recovery/cancel/prepare', 'POST', { owner }, owner);
    },

    confirmRecoveryCancellation({
      owner,
      transactionHash,
    }: {
      owner: string;
      transactionHash: string;
    }) {
      return call('/v1/recovery/cancel/confirm', 'POST', { owner, transactionHash }, owner);
    },
  };
}

export const recoveryApi = createRecoveryApi();
export default recoveryApi;
