import { get_last_price, get_last_vwap, get_last_ema, has_data } from './dataHelpers';

/**
 * Voice coach tools for OpenAI Realtime API.
 * These tools allow the voice assistant to access real-time market data.
 */

interface ToolCall {
  call_id: string;
  name: string;
  arguments: string;
}

interface ToolResponse {
  type: 'conversation.item.create';
  item: {
    type: 'function_call_output';
    call_id: string;
    output: string;
  };
}

/**
 * Tool definitions for OpenAI Realtime API
 */
export const voiceTools = [
  {
    type: 'function',
    name: 'get_last_price',
    description: 'Get the most recent price for a stock symbol from the live market feed',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol (e.g., SPY, QQQ, AAPL)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    type: 'function',
    name: 'get_last_vwap',
    description: 'Get the current session VWAP (Volume Weighted Average Price) for a stock symbol',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol (e.g., SPY, QQQ, AAPL)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    type: 'function',
    name: 'get_last_ema',
    description: 'Calculate the latest EMA (Exponential Moving Average) for a stock symbol using recent bars',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol (e.g., SPY, QQQ, AAPL)',
        },
        period: {
          type: 'number',
          description: 'EMA period (default: 9). Common values: 9, 20, 50, 200',
          default: 9,
        },
      },
      required: ['symbol'],
    },
  },
  {
    type: 'function',
    name: 'has_data',
    description: 'Check if we currently have real-time market data for a given stock symbol',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol to check',
        },
      },
      required: ['symbol'],
    },
  },
];

/**
 * Handle tool calls from the voice assistant
 */
export function handleToolCall(toolCall: ToolCall): ToolResponse {
  try {
    const args = JSON.parse(toolCall.arguments);
    let result: any;

    // Defensive check: ensure symbol is provided
    if (toolCall.name !== 'has_data' && (!args.symbol || typeof args.symbol !== 'string')) {
      return {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: JSON.stringify({ error: 'Symbol parameter is required' }),
        },
      };
    }

    switch (toolCall.name) {
      case 'get_last_price': {
        const price = get_last_price(args.symbol.toUpperCase());
        result = price !== null ? { price, symbol: args.symbol } : { error: 'No data available' };
        break;
      }
      case 'get_last_vwap': {
        const vwap = get_last_vwap(args.symbol.toUpperCase());
        result = vwap !== null ? { vwap, symbol: args.symbol } : { error: 'No data available' };
        break;
      }
      case 'get_last_ema': {
        const period = args.period || 9;
        const ema = get_last_ema(args.symbol.toUpperCase(), period);
        result =
          ema !== null ? { ema, period, symbol: args.symbol } : { error: 'Insufficient data' };
        break;
      }
      case 'has_data': {
        if (!args.symbol) {
          result = { error: 'Symbol parameter is required' };
        } else {
          const available = has_data(args.symbol.toUpperCase());
          result = { symbol: args.symbol, available };
        }
        break;
      }
      default:
        result = { error: 'Unknown tool' };
    }

    return {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: toolCall.call_id,
        output: JSON.stringify(result),
      },
    };
  } catch (error) {
    return {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: toolCall.call_id,
        output: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      },
    };
  }
}
