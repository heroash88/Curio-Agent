/**
 * Financial data lookup through the Vite/Firebase stock proxy.
 */

import { fetchStockQuote } from '../../stockMarketService';
import { register } from '../router';

register('get_financial_data', async (args, _ctx) => {
    try {
        const quote = await fetchStockQuote(String(args.symbol || ''));
        return { result: { success: true, price: quote.price, currency: quote.currency, change: quote.change, changePercent: quote.changePercent, symbol: quote.symbol, instrumentType: quote.instrumentType }, emittedCard: false };
    } catch (e) {
        return { result: { success: false, error: 'Failed to fetch financial data through the stock proxy. Use available search grounding or market data to find the stock price, then call show_finance_card once you find it. If live lookup is unavailable, tell the user briefly. Error details: ' + (e as Error).message }, emittedCard: false };
    }
});
