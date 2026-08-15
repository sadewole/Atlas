import * as grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

/**
 * Options for creating a gRPC client from a `.proto` definition at runtime.
 *
 * NestJS microservices uses the same `@grpc/proto-loader` underneath, so a
 * client created here can talk to a NestJS gRPC server out of the box.
 */
export interface GrpcClientOptions {
  protoPath: string;
  /** Proto package, e.g. `ledger.v1`. */
  packageName: string;
  /** Service name within the package, e.g. `LedgerService`. */
  serviceName: string;
  /** gRPC endpoint, e.g. `localhost:50051`. */
  url: string;
}

/** proto-loader options shared with the NestJS gRPC transport. */
const LOADER_OPTIONS: Parameters<typeof loadSync>[1] = {
  keepCase: true,
  longs: Number,
  enums: Number,
  defaults: true,
  oneofs: true,
};

/** Walk a dotted package path (e.g. "ledger.v1") down a loaded GrpcObject. */
function resolvePackage(
  root: grpc.GrpcObject,
  packageName: string,
): grpc.GrpcObject {
  let current: grpc.GrpcObject = root;
  for (const segment of packageName.split('.')) {
    const next = current[segment];
    if (
      typeof next === 'function' ||
      !next ||
      'type' in next ||
      'encode' in next
    ) {
      throw new Error(
        `gRPC package ${packageName} not found (missing segment "${segment}")`,
      );
    }
    current = next;
  }
  return current;
}

/**
 * Build a gRPC client stub from a `.proto` file at runtime.
 *
 * Returns a typed service stub whose methods call the wire protocol. Callers
 * wrap it in their own client abstraction (e.g. `LedgerClient`) so they never
 * touch gRPC details.
 */
export function createGrpcClient(
  options: GrpcClientOptions,
): grpc.Client {
  const packageDefinition = loadSync(options.protoPath, LOADER_OPTIONS);
  const proto = grpc.loadPackageDefinition(packageDefinition);
  const pkg = resolvePackage(proto, options.packageName);
  const service = pkg[options.serviceName] as
    | grpc.ServiceClientConstructor
    | undefined;
  if (!service) {
    throw new Error(
      `gRPC service ${options.packageName}.${options.serviceName} not found in ${options.protoPath}`,
    );
  }
  return new service(
    options.url,
    grpc.credentials.createInsecure(),
    { 'grpc.keepalive_time_ms': 10_000, 'grpc.keepalive_timeout_ms': 5_000 },
  );
}

/**
 * Call a unary gRPC method and return a promise.
 * Rejects with a `GrpcServiceError` carrying the canonical gRPC status code.
 */
export function grpcCall<Request, Response>(
  client: grpc.Client,
  method: string,
  request: Request,
): Promise<Response> {
  const fn = (client as unknown as Record<string, unknown>)[method];
  if (typeof fn !== 'function') {
    return Promise.reject(new Error(`gRPC method ${method} not found on client`));
  }
  return new Promise<Response>((resolve, reject) => {
    // Invoke through the client so `this` (channel/request config) is bound.
    (client as unknown as Record<string, (req: Request, cb: (err: grpc.ServiceError | null, res: Response) => void) => void>)[method](
      request,
      (err, response) => {
        if (err) {
          reject(toGrpcServiceError(err));
          return;
        }
        resolve(response);
      },
    );
  });
}

export interface GrpcServiceError {
  code: number;
  status: string;
  message: string;
  details: string;
}

/** Map a @grpc/grpc-js error to a domain-agnostic gRPC error. */
export function toGrpcServiceError(err: unknown): GrpcServiceError {
  const e = err as grpc.ServiceError;
  return {
    code: typeof e.code === 'number' ? e.code : grpc.status.UNKNOWN,
    status: grpc.status[(e.code as grpc.status) ?? grpc.status.UNKNOWN] ?? 'UNKNOWN',
    message: e.message ?? 'gRPC call failed',
    details: e.details ?? '',
  };
}

/** gRPC canonical status codes (re-exported for error mapping). */
export const GRPC_STATUS = grpc.status;

/** Map an HTTP-style status code to a canonical gRPC status. */
export function httpStatusToGrpcStatus(httpStatus: number): grpc.status {
  switch (httpStatus) {
    case 400:
      return grpc.status.INVALID_ARGUMENT;
    case 401:
      return grpc.status.UNAUTHENTICATED;
    case 403:
      return grpc.status.PERMISSION_DENIED;
    case 404:
      return grpc.status.NOT_FOUND;
    case 409:
      return grpc.status.ALREADY_EXISTS;
    case 422:
      return grpc.status.FAILED_PRECONDITION;
    default:
      return grpc.status.INTERNAL;
  }
}
