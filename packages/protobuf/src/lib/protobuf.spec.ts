import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { LEDGER_PROTO_PATH, WALLET_PROTO_PATH } from '../index.js';

describe('@atlas/protobuf', () => {
  it('exposes existing proto files', () => {
    expect(existsSync(LEDGER_PROTO_PATH)).toBe(true);
    expect(existsSync(WALLET_PROTO_PATH)).toBe(true);
  });

  it('proto paths resolve relative to the package (src or dist)', () => {
    const pkgRoot = fileURLToPath(new URL('../../', import.meta.url));
    expect(LEDGER_PROTO_PATH.startsWith(pkgRoot)).toBe(true);
    expect(LEDGER_PROTO_PATH.endsWith('/proto/ledger.proto')).toBe(true);
    expect(WALLET_PROTO_PATH.endsWith('/proto/wallet.proto')).toBe(true);
  });
});
