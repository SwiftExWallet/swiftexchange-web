import { asterHttpClient } from '../client/asterHttpClient';
import { ASTER_ENDPOINTS, BAPI_ENDPOINTS, getAsterBapiUrl, getAsterRestUrl } from '../constants';

export interface FundingRateData {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
}

export interface FundingInfoData {
  symbol: string;
  interestRate: string;
  time: number;
  fundingIntervalHours: number;
  fundingFeeCap: number;
  fundingFeeFloor: number;
}

export async function getFundingRates(
  symbol: string,
  limit: number = 336
): Promise<FundingRateData[]> {
  const cleanSymbol = symbol.replace('-', '').replace('/', '');
  try {
    const restUrl = getAsterRestUrl();
    const publicUrl = `${restUrl}${ASTER_ENDPOINTS.FUNDING_RATE}?symbol=${cleanSymbol}&limit=${Math.min(limit, 1000)}`;
    const data = await asterHttpClient.request<any>(publicUrl, {
      method: 'GET',
      weight: 1,
      ttlMs: 60_000,
    });

    if (Array.isArray(data)) {
      return data.map((item: any) => ({
        symbol: item.symbol,
        fundingRate: item.fundingRate,
        fundingTime: item.fundingTime,
      }));
    }
  } catch (e) {
    console.warn('[Funding] Failed to fetch from /fapi/v3/fundingRate, falling back to BAPI:', e);
  }

  // Fallback to internal BAPI
  const url = `${getAsterBapiUrl()}${BAPI_ENDPOINTS.FUNDING_HISTORY}`;
  try {
    const json = await asterHttpClient.request<any>(url, {
      method: 'POST',
      body: {
        symbol,
        page: 1,
        rows: limit,
        sourceCode: 'astherus',
      },
      ttlMs: 60_000,
    });

    if (json && json.code === '000000' && Array.isArray(json.data)) {
      return json.data.map((item: any) => ({
        symbol: item.symbol,
        fundingRate: item.lastFundingRate,
        fundingTime: item.calcTime,
      }));
    }
  } catch (e) {
    console.warn('[Funding] BAPI fallback failed:', e);
  }

  return [];
}

export async function getSymbolDetail(coin: string): Promise<any> {
  const url = `${getAsterBapiUrl()}${BAPI_ENDPOINTS.SYMBOL_DETAIL}?symbol=${coin}`;
  try {
    const json = await asterHttpClient.request<any>(url, {
      method: 'GET',
      ttlMs: 60_000,
    });

    if (json && json.code === '000000' && json.data?.detail?.info?.data) {
      const coinData = Object.values(json.data.detail.info.data)[0];
      const metrics = json.data.detail.quotes?.data;
      const finalMetrics = metrics ? Object.values(metrics)[0] : null;
      return { ...(coinData as object), metrics: finalMetrics };
    }
  } catch (e) {
    console.warn('[Funding] getSymbolDetail failed:', e);
  }
  return null;
}

export async function getSymbolAthl(coin: string): Promise<any> {
  const url = `${getAsterBapiUrl()}${BAPI_ENDPOINTS.SYMBOL_ATHL}?symbol=${coin}`;
  try {
    const json = await asterHttpClient.request<any>(url, {
      method: 'GET',
      ttlMs: 60_000,
    });

    if (json && json.code === '000000' && json.data) {
      return json.data;
    }
  } catch (e) {
    console.warn('[Funding] getSymbolAthl failed:', e);
  }
  return null;
}

export async function getFundingInfo(symbol?: string): Promise<FundingInfoData[]> {
  const restUrl = getAsterRestUrl();
  const url = symbol
    ? `${restUrl}${ASTER_ENDPOINTS.FUNDING_INFO}?symbol=${symbol}`
    : `${restUrl}${ASTER_ENDPOINTS.FUNDING_INFO}`;

  return asterHttpClient.request<FundingInfoData[]>(url, {
    method: 'GET',
    weight: 1,
    ttlMs: 30_000,
  });
}

export async function getBrackets(): Promise<any[]> {
  const url = `${getAsterBapiUrl()}${BAPI_ENDPOINTS.BRACKETS}`;
  try {
    const json = await asterHttpClient.request<any>(url, {
      method: 'POST',
      body: {},
      ttlMs: 60_000,
    });

    if (json && json.code === '000000' && json.data?.brackets) {
      return json.data.brackets;
    }
  } catch (e) {
    console.warn('[Funding] getBrackets failed:', e);
  }
  return [];
}

export async function getRealTimeFundingRate(symbol: string): Promise<any> {
  const url = `${getAsterBapiUrl()}${BAPI_ENDPOINTS.REAL_TIME_FUNDING_RATE}?symbol=${symbol}`;
  try {
    const json = await asterHttpClient.request<any>(url, {
      method: 'GET',
      ttlMs: 3_000,
    });

    if (json && json.code === '000000' && Array.isArray(json.data) && json.data.length > 0) {
      return json.data[0];
    }
  } catch (e) {
    console.warn('[Funding] getRealTimeFundingRate failed:', e);
  }
  return null;
}

export interface AsterOpenInterestResponse {
  symbol: string;
  openInterest: string;
  time: number;
}

/**
 * Official Aster Futures v3 Open Interest endpoint:
 * GET /fapi/v3/openInterest?symbol=BTCUSDT
 */
export async function getAsterOpenInterest(symbol: string): Promise<string> {
  const cleanSymbol = symbol.replace(/[-_/]/g, '').toUpperCase();
  const restUrl = getAsterRestUrl();
  const data = await asterHttpClient.request<AsterOpenInterestResponse>(
    `${restUrl}${ASTER_ENDPOINTS.OPEN_INTEREST}?symbol=${cleanSymbol}`,
    {
      method: 'GET',
      weight: 1,
      ttlMs: 3_000,
    }
  );

  return data?.openInterest || '0';
}
