import type { ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';

export type AuthRequestLike = {
  user?: JwtPayload;
  headers?: Record<string, unknown>;
  cookies?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function readUser(carrier: unknown): JwtPayload | undefined {
  const rec = asRecord(carrier);
  if (!rec) {
    return undefined;
  }
  if (rec.user) {
    return rec.user as JwtPayload;
  }
  const nested =
    asRecord(rec.data) ??
    asRecord(rec.req) ??
    asRecord(rec.request) ??
    asRecord(asRecord(rec.extra)?.request) ??
    asRecord(rec.extra);
  return nested?.user as JwtPayload | undefined;
}

function bearerFrom(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  return value.toLowerCase().startsWith('bearer ')
    ? value
    : `Bearer ${value}`;
}

function headersFrom(value: unknown): Record<string, unknown> {
  const rec = asRecord(value);
  if (!rec) {
    return {};
  }
  if (typeof rec.get === 'function') {
    const get = rec.get as (key: string) => unknown;
    const authorization = get('authorization') ?? get('Authorization');
    return authorization ? { ...rec, authorization } : rec;
  }
  return rec;
}

function withAuthorization(
  headers: Record<string, unknown>,
  authorization: string | undefined,
): Record<string, unknown> {
  if (!authorization || headers.authorization) {
    return headers;
  }
  return { ...headers, authorization };
}

function cookiesFromHeader(
  header: unknown,
): Record<string, string> | undefined {
  if (typeof header !== 'string' || header.length === 0) {
    return undefined;
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    if (!key) {
      continue;
    }
    try {
      cookies[key] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      cookies[key] = part.slice(eq + 1).trim();
    }
  }
  return cookies;
}

/**
 * Return the live request/socket/rpc/gql object so Passport can attach `user`.
 */
function attachAuthShape(
  carrier: Record<string, unknown>,
  headers: Record<string, unknown>,
  cookies?: Record<string, unknown>,
): AuthRequestLike {
  const existing = asRecord(carrier.headers);
  if (!existing) {
    carrier.headers = headers;
  } else if (!existing.authorization && headers.authorization) {
    existing.authorization = headers.authorization;
  }
  if (!carrier.cookies && cookies) {
    carrier.cookies = cookies;
  }
  return carrier as AuthRequestLike;
}

function fromHttp(context: ExecutionContext): AuthRequestLike {
  return context.switchToHttp().getRequest<AuthRequestLike>() ?? {};
}

function fromWs(context: ExecutionContext): AuthRequestLike {
  const client =
    context.switchToWs().getClient<Record<string, unknown>>() ?? {};
  const handshake = asRecord(client.handshake);
  const headers = withAuthorization(
    headersFrom(handshake?.headers),
    bearerFrom(asRecord(handshake?.auth)?.token),
  );
  return attachAuthShape(
    client,
    headers,
    asRecord(client.cookies) ??
      cookiesFromHeader(headers.cookie ?? headers.Cookie),
  );
}

function fromRpc(context: ExecutionContext): AuthRequestLike {
  const rpc = context.switchToRpc();
  const rpcContext = asRecord(rpc.getContext()) ?? asRecord(rpc.getData()) ?? {};
  const headers = headersFrom(
    typeof rpcContext.getHeaders === 'function'
      ? (rpcContext.getHeaders as () => unknown)()
      : (rpcContext.headers ?? asRecord(rpc.getData())?.headers),
  );
  return attachAuthShape(rpcContext, headers);
}

function fromGraphql(context: ExecutionContext): AuthRequestLike {
  const gql = asRecord(context.getArgByIndex(2)) ?? {};
  const req =
    asRecord(gql.req) ??
    asRecord(gql.request) ??
    asRecord(asRecord(gql.extra)?.request);
  const connectionAuth = bearerFrom(
    asRecord(gql.connectionParams)?.authorization ??
      asRecord(gql.connectionParams)?.Authorization,
  );
  if (req) {
    return attachAuthShape(
      req,
      withAuthorization(headersFrom(req.headers), connectionAuth),
      asRecord(req.cookies),
    );
  }
  return attachAuthShape(
    gql,
    withAuthorization(headersFrom(gql.headers), connectionAuth),
  );
}

export function getAuthRequest(context: ExecutionContext): AuthRequestLike {
  switch (context.getType<string>()) {
    case 'ws':
      return fromWs(context);
    case 'rpc':
      return fromRpc(context);
    case 'graphql':
      return fromGraphql(context);
    default:
      return fromHttp(context);
  }
}

export function getAuthUser(context: ExecutionContext): JwtPayload | undefined {
  return readUser(getAuthRequest(context));
}
