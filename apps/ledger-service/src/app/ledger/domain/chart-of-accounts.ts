import { Currency, SUPPORTED_CURRENCIES } from '@atlas/shared';
import { AccountType } from './account.js';

/**
 * The Atlas seed chart of accounts (ledger spec §Chart of Accounts).
 * Codes are hierarchical: 1xxx Assets, 2xxx Liabilities, 3xxx Equity,
 * 4xxx Revenue, 5xxx Expenses.
 */
export interface SeedAccount {
  accountCode: string;
  name: string;
  type: AccountType;
  currency: Currency;
}

export const CHART_OF_ACCOUNTS: SeedAccount[] = [
  // Assets
  { accountCode: '1110', name: 'Main Bank Account', type: 'asset', currency: 'NGN' },
  { accountCode: '1120', name: 'Escrow Account', type: 'asset', currency: 'NGN' },
  { accountCode: '1200', name: 'Settlement Receivables', type: 'asset', currency: 'NGN' },
  // Liabilities
  { accountCode: '2100', name: 'Customer Wallets', type: 'liability', currency: 'NGN' },
  { accountCode: '2200', name: 'Merchant Wallets', type: 'liability', currency: 'NGN' },
  { accountCode: '2300', name: 'Outstanding Transfers', type: 'liability', currency: 'NGN' },
  // Equity
  { accountCode: '3100', name: 'Retained Earnings', type: 'equity', currency: 'NGN' },
  // Revenue
  { accountCode: '4100', name: 'Processing Fees', type: 'revenue', currency: 'NGN' },
  { accountCode: '4200', name: 'FX Revenue', type: 'revenue', currency: 'NGN' },
  // Expenses
  { accountCode: '5100', name: 'Refunds', type: 'expense', currency: 'NGN' },
  { accountCode: '5200', name: 'Operational Costs', type: 'expense', currency: 'NGN' },
];

/** Every currency Atlas supports in the ledger, for validation. */
export function assertSupportedCurrency(currency: string): asserts currency is Currency {
  if (!SUPPORTED_CURRENCIES.includes(currency as Currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
}
