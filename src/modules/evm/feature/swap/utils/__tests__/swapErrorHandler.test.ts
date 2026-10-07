import { describe, expect, it } from 'vitest';

import { extractFusionErrorMessage } from '../../services/fusionOrderService';
import { extractCleanMessage, parseSwapError, parseWalletError } from '../swapErrorHandler';

describe('swapErrorHandler - Backend Provider Error handling', () => {
  it('cleanly parses {"code":"PROVIDER_BAD_RESPONSE","message":"Provider rejected the request."} from raw JSON string', () => {
    const raw = '{"code":"PROVIDER_BAD_RESPONSE","message":"Provider rejected the request."}';
    expect(extractCleanMessage(raw)).toBe('Provider rejected the request.');
    expect(parseSwapError(raw)).toBe('Provider rejected the request.');
  });

  it('cleanly parses error prefixed with API error: {"code":"PROVIDER_BAD_RESPONSE",...}', () => {
    const raw =
      'API error: {"code":"PROVIDER_BAD_RESPONSE","message":"Provider rejected the request."}';
    expect(extractCleanMessage(raw)).toBe('Provider rejected the request.');
    expect(parseSwapError(new Error(raw))).toBe('Provider rejected the request.');
  });

  it('cleanly parses error object with code PROVIDER_BAD_RESPONSE', () => {
    const errObj = {
      code: 'PROVIDER_BAD_RESPONSE',
      message: 'Provider rejected the request.',
    };
    expect(parseSwapError(errObj)).toBe('Provider rejected the request.');
  });

  it('cleanly parses error with response.data containing PROVIDER_BAD_RESPONSE', () => {
    const errWithResponse = {
      response: {
        data: {
          code: 'PROVIDER_BAD_RESPONSE',
          message: 'Provider rejected the request.',
        },
      },
    };
    expect(parseSwapError(errWithResponse)).toBe('Provider rejected the request.');
  });

  it('does NOT treat PROVIDER_BAD_RESPONSE as user cancellation', () => {
    const errObj = {
      code: 'PROVIDER_BAD_RESPONSE',
      message: 'Provider rejected the request.',
    };
    expect(parseWalletError(errObj)).toBe('Provider rejected the request.');
    expect(parseSwapError(errObj)).toBe('Provider rejected the request.');
  });

  it('extracts description if message is absent in backend response', () => {
    const raw = '{"code":"PROVIDER_BAD_RESPONSE","description":"Provider rejected the request."}';
    expect(extractCleanMessage(raw)).toBe('Provider rejected the request.');
    expect(parseSwapError(raw)).toBe('Provider rejected the request.');
  });
});

describe('fusionOrderService - extractFusionErrorMessage', () => {
  it('returns null for null, undefined, or empty objects', () => {
    expect(extractFusionErrorMessage(null)).toBeNull();
    expect(extractFusionErrorMessage(undefined)).toBeNull();
    expect(extractFusionErrorMessage({})).toBeNull();
  });

  it('returns null for successful order response with orderHash', () => {
    expect(extractFusionErrorMessage({ orderHash: '0x123abc' })).toBeNull();
    expect(extractFusionErrorMessage({ success: true, orderHash: '0x123abc' })).toBeNull();
  });

  it('detects PROVIDER_BAD_RESPONSE and extracts message', () => {
    const data = {
      code: 'PROVIDER_BAD_RESPONSE',
      message: 'Provider rejected the request.',
    };
    expect(extractFusionErrorMessage(data)).toBe('Provider rejected the request.');
  });

  it('detects nested error object with message', () => {
    const data = {
      error: {
        code: 'PROVIDER_BAD_RESPONSE',
        message: 'Provider rejected the request.',
      },
    };
    expect(extractFusionErrorMessage(data)).toBe('Provider rejected the request.');
  });

  it('detects statusCode >= 400 error payloads', () => {
    const data = {
      statusCode: 400,
      description: 'Insufficient liquidity for swap',
    };
    expect(extractFusionErrorMessage(data)).toBe('Insufficient liquidity for swap');
  });

  it('falls back to default message if error payload has no description or message', () => {
    const data = {
      code: 'PROVIDER_BAD_RESPONSE',
    };
    expect(extractFusionErrorMessage(data)).toBe('Provider rejected the request.');
  });
});
