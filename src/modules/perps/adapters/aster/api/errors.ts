/**
 * Aster API Error Codes and human-friendly messages mapping.
 * Source: https://asterdex.github.io/aster-api-website/futures-v3/error-codes/
 */

export interface AsterErrorDetail {
  code: number;
  name: string;
  message: string;
  userMessage: string;
}

const ERROR_MAP: Record<number, { name: string; userMessage: string }> = {
  // 10xx - Server / Network / Auth
  '-1000': {
    name: 'UNKNOWN',
    userMessage: 'An unexpected error occurred while processing the request. Please try again.',
  },
  '-1001': {
    name: 'DISCONNECTED',
    userMessage:
      'Unable to process request due to internal server disconnection. Please try again.',
  },
  '-1002': {
    name: 'UNAUTHORIZED',
    userMessage: 'Unauthorized request. Please check your wallet connection and permissions.',
  },
  '-1003': {
    name: 'TOO_MANY_REQUESTS',
    userMessage: 'Too many requests. Please wait a moment before trying again.',
  },
  '-1006': {
    name: 'UNEXPECTED_RESP',
    userMessage: 'Unexpected response from Aster server. Execution status unknown.',
  },
  '-1007': {
    name: 'TIMEOUT',
    userMessage: 'Request timed out waiting for Aster server. Please check your order history.',
  },
  '-1014': { name: 'UNKNOWN_ORDER_COMPOSITION', userMessage: 'Unsupported order composition.' },
  '-1015': {
    name: 'TOO_MANY_ORDERS',
    userMessage: 'Too many new operations submitted. Please wait a moment.',
  },
  '-1016': {
    name: 'SERVICE_SHUTTING_DOWN',
    userMessage: 'Aster service is currently undergoing maintenance.',
  },
  '-1020': { name: 'UNSUPPORTED_OPERATION', userMessage: 'This operation is not supported.' },
  '-1021': {
    name: 'INVALID_TIMESTAMP',
    userMessage: 'Request timestamp is out of sync with Aster server. Resynchronizing clock...',
  },
  '-1022': {
    name: 'INVALID_SIGNATURE',
    userMessage: 'Invalid cryptographic signature. Please verify and sign again.',
  },
  '-1023': {
    name: 'START_TIME_GREATER_THAN_END_TIME',
    userMessage: 'Start time cannot be after end time.',
  },

  // 11xx - Request Parameters & Filters
  '-1100': {
    name: 'ILLEGAL_CHARS',
    userMessage: 'Illegal characters found in request parameters.',
  },
  '-1101': { name: 'TOO_MANY_PARAMETERS', userMessage: 'Too many parameters submitted.' },
  '-1102': {
    name: 'MANDATORY_PARAM_EMPTY_OR_MALFORMED',
    userMessage: 'A required order parameter is missing or invalid. Please check your inputs.',
  },
  '-1103': { name: 'UNKNOWN_PARAM', userMessage: 'Unknown parameter sent in request.' },
  '-1104': {
    name: 'UNREAD_PARAMETERS',
    userMessage: 'Parameters could not be processed completely.',
  },
  '-1105': { name: 'PARAM_EMPTY', userMessage: 'A required field cannot be empty.' },
  '-1106': { name: 'PARAM_NOT_REQUIRED', userMessage: 'Unnecessary parameter submitted.' },
  '-1108': { name: 'BAD_ASSET', userMessage: 'Invalid or unsupported asset for this network.' },
  '-1109': { name: 'BAD_ACCOUNT', userMessage: 'Invalid account type specified.' },
  '-1111': {
    name: 'BAD_PRECISION',
    userMessage: 'Order size or price precision exceeds allowed decimals for this market.',
  },
  '-1113': { name: 'WITHDRAW_NOT_NEGATIVE', userMessage: 'Invalid withdrawal amount.' },
  '-1116': {
    name: 'ORDER_TYPE_NOT_SUPPORTED',
    userMessage: 'Order type is not supported for this symbol or market.',
  },
  '-1121': {
    name: 'INVALID_SYMBOL',
    userMessage: 'Invalid trading pair symbol specified.',
  },

  // 20xx - Trading & Margining
  '-2010': {
    name: 'NEW_ORDER_REJECTED',
    userMessage: 'Order rejected by exchange risk engine. Please check balance and inputs.',
  },
  '-2011': { name: 'CANCEL_REJECTED', userMessage: 'Order cancellation could not be completed.' },
  '-2018': {
    name: 'BALANCE_NOT_SUFFICIENT',
    userMessage: 'Insufficient available balance to place this order.',
  },
  '-2019': {
    name: 'MARGIN_NOT_SUFFICIENT',
    userMessage:
      'Insufficient margin balance. Please deposit funds or reduce order size / leverage.',
  },
  '-2021': {
    name: 'ORDER_WOULD_IMMEDIATELY_TRIGGER',
    userMessage:
      'Trigger price would immediately execute at current price. Please adjust your stop price.',
  },
  '-2022': {
    name: 'REDUCE_ONLY_REJECT',
    userMessage: 'Reduce-only order rejected because it would increase your position size.',
  },
  '-2023': {
    name: 'USER_IN_LIQUIDATION',
    userMessage: 'Account is currently undergoing risk liquidation.',
  },
  '-2024': {
    name: 'POSITION_NOT_SUFFICIENT',
    userMessage: 'Position size is insufficient to complete this reduce-only operation.',
  },
  '-2026': {
    name: 'POST_ONLY_WOULD_CROSS',
    userMessage:
      'Post-only order rejected because it would immediately cross the spread and take liquidity.',
  },

  // 40xx & 41xx - Price & Quantity Filters
  '-4003': {
    name: 'QUANTITY_LESS_THAN_ZERO',
    userMessage: 'Order quantity must be greater than zero.',
  },
  '-4004': {
    name: 'PRICE_LESS_THAN_ZERO',
    userMessage: 'Order price must be greater than zero.',
  },
  '-4005': {
    name: 'STOP_PRICE_LESS_THAN_ZERO',
    userMessage: 'Trigger stop price must be greater than zero.',
  },
  '-4014': {
    name: 'PRICE_GREATER_THAN_MAX_PRICE',
    userMessage: 'Order price exceeds the maximum allowed price band.',
  },
  '-4015': {
    name: 'PRICE_LESS_THAN_MIN_PRICE',
    userMessage: 'Order price is below the minimum allowed price band.',
  },
  '-4016': {
    name: 'PRICE_NOT_MULTIPLE_OF_TICK_SIZE',
    userMessage: 'Order price must be a multiple of the market tick size.',
  },
  '-4017': {
    name: 'QUANTITY_GREATER_THAN_MAX_QTY',
    userMessage: 'Order size exceeds the maximum allowed position limit.',
  },
  '-4018': {
    name: 'QUANTITY_LESS_THAN_MIN_QTY',
    userMessage: 'Order size is below the minimum allowed quantity.',
  },
  '-4019': {
    name: 'QUANTITY_NOT_MULTIPLE_OF_STEP_SIZE',
    userMessage: 'Order quantity must be a multiple of the market step size.',
  },
  '-4061': {
    name: 'POSITION_SIDE_NOT_MATCH',
    userMessage: 'Order position side does not match your account position mode (One-way / Hedge).',
  },
  '-4164': {
    name: 'ORDER_NOTIONAL_TOO_SMALL',
    userMessage: 'Order value is below the minimum required amount ($5.00 USDT).',
  },
  '-5022': {
    name: 'DUE_TO_RISK_LIMIT',
    userMessage:
      'Order exceeds the account risk limit for this leverage tier. Please reduce size or leverage.',
  },
};

export function parseAsterError(err: any): AsterErrorDetail {
  let code = typeof err?.code === 'number' ? err.code : -1000;
  let rawMsg = err?.msg || err?.message || 'Unknown Aster API error';

  // Check if rawMsg contains a JSON string error like {"code": -2019, "msg": "..."}
  if (typeof rawMsg === 'string' && rawMsg.includes('{') && rawMsg.includes('code')) {
    try {
      const match = rawMsg.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed.code === 'number') {
          code = parsed.code;
          if (parsed.msg) rawMsg = parsed.msg;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Wallet signature rejection
  if (/user rejected|action_rejected|user denied/i.test(rawMsg)) {
    return {
      code: 4001,
      name: 'USER_REJECTED',
      message: rawMsg,
      userMessage: 'Transaction signature was rejected in your wallet.',
    };
  }

  const mapped = ERROR_MAP[code];
  if (mapped) {
    return {
      code,
      name: mapped.name,
      message: rawMsg,
      userMessage: mapped.userMessage,
    };
  }

  // Text pattern matching
  if (/notional.*smaller than|min.*notional/i.test(rawMsg)) {
    return {
      code: -4164,
      name: 'ORDER_NOTIONAL_TOO_SMALL',
      message: rawMsg,
      userMessage: 'Order value is below the minimum required amount ($5.00 USDT).',
    };
  }

  if (/margin.*insufficient|insufficient margin/i.test(rawMsg)) {
    return {
      code: -2019,
      name: 'MARGIN_NOT_SUFFICIENT',
      message: rawMsg,
      userMessage:
        'Insufficient margin balance. Please deposit funds or reduce order size/leverage.',
    };
  }

  if (/would immediately trigger/i.test(rawMsg)) {
    return {
      code: -2021,
      name: 'ORDER_WOULD_IMMEDIATELY_TRIGGER',
      message: rawMsg,
      userMessage:
        'Trigger price would immediately execute at current price. Please adjust stop price.',
    };
  }

  if (/reduceonly/i.test(rawMsg)) {
    return {
      code: -2022,
      name: 'REDUCE_ONLY_REJECT',
      message: rawMsg,
      userMessage: 'Reduce-only order rejected because it would increase your position size.',
    };
  }

  if (/daily limit/i.test(rawMsg)) {
    return {
      code,
      name: 'DAILY_LIMIT_EXCEEDED',
      message: rawMsg,
      userMessage: 'Withdrawal amount exceeds your 24-hour remaining limit.',
    };
  }

  if (/min.*amount/i.test(rawMsg)) {
    return {
      code,
      name: 'BELOW_MIN_AMOUNT',
      message: rawMsg,
      userMessage: 'Amount is below the minimum allowed limit.',
    };
  }

  if (/insufficient/i.test(rawMsg)) {
    return {
      code,
      name: 'INSUFFICIENT_FUNDS',
      message: rawMsg,
      userMessage: 'Insufficient account balance for this transaction.',
    };
  }

  return {
    code,
    name: 'UNKNOWN',
    message: rawMsg,
    userMessage: rawMsg || 'An error occurred with Aster exchange.',
  };
}
