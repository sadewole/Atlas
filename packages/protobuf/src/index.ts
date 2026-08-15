import { fileURLToPath } from 'node:url';

export * from './lib/protobuf.js';

/**
 * Absolute paths to the `.proto` files. The proto files live at the package
 * root (`proto/`), so `../proto/x.proto` resolves correctly whether this
 * package is running from `src/` (dev) or `dist/` (build).
 */
export const LEDGER_PROTO_PATH = fileURLToPath(
  new URL('../proto/ledger.proto', import.meta.url),
);
export const WALLET_PROTO_PATH = fileURLToPath(
  new URL('../proto/wallet.proto', import.meta.url),
);
