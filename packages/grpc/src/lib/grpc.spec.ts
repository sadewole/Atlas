import { LEDGER_PROTO_PATH, WALLET_PROTO_PATH } from '@atlas/protobuf';
import { GRPC_STATUS, createGrpcClient, toGrpcServiceError } from './grpc.js';

describe('@atlas/grpc', () => {
  it('builds a client from a proto definition', () => {
    const client = createGrpcClient({
      protoPath: LEDGER_PROTO_PATH,
      packageName: 'ledger.v1',
      serviceName: 'LedgerService',
      url: 'localhost:50051',
    });
    expect(client).toBeTruthy();
    client.close();
  });

  it('rejects for an unknown service', () => {
    expect(() =>
      createGrpcClient({
        protoPath: LEDGER_PROTO_PATH,
        packageName: 'ledger.v1',
        serviceName: 'NopeService',
        url: 'localhost:50051',
      }),
    ).toThrow(/not found/);
  });

  it('maps grpc-js errors to a GrpcServiceError with canonical status', () => {
    const err = toGrpcServiceError({
      code: 5,
      message: 'account not found',
      details: 'no such account',
    });
    expect(err.status).toBe('NOT_FOUND');
    expect(err.code).toBe(GRPC_STATUS.NOT_FOUND);
    expect(err.message).toBe('account not found');
  });

  it('exposes the wallet proto path', () => {
    expect(WALLET_PROTO_PATH.endsWith('/proto/wallet.proto')).toBe(true);
  });
});
