/**
 * Prisma Client Proxy for better-auth Date ↔ Unix Timestamp Compatibility
 *
 * Problem: better-auth internally uses Date objects for all date fields,
 * but our Prisma schema uses Int (Unix timestamps in seconds) for D1/SQLite.
 *
 * Solution: Proxy the PrismaClient to intercept ALL auth-model operations:
 * - Input: Recursively convert Date → Unix timestamp (seconds) in all args
 *   (data, where, update, create, etc.)
 * - Output: Convert Unix timestamp → Date for known date fields in results
 *
 * This avoids schema migrations and keeps the existing Int-based schema intact.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Auth model date fields (Prisma field names, not DB column names).
 * Only auth-related models need conversion — better-auth manages these.
 */
const AUTH_DATE_FIELDS: Record<string, string[]> = {
  user: ['emailVerified', 'createdAt', 'updatedAt'],
  account: ['expiresAt', 'createdAt', 'updatedAt'],
  session: ['expires', 'createdAt', 'updatedAt'],
  verificationToken: ['expires', 'createdAt', 'updatedAt'],
};

/** PascalCase aliases (better-auth config uses PascalCase modelName) */
const MODEL_ALIASES: Record<string, string> = {
  User: 'user',
  Account: 'account',
  Session: 'session',
  VerificationToken: 'verificationToken',
};

function dateToUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function unixToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Fields where better-auth may pass a boolean `true` but the schema expects
 * a Unix timestamp. Example: `emailVerified: true` → current timestamp.
 */
const BOOLEAN_TO_TIMESTAMP_FIELDS = new Set(['emailVerified']);

/**
 * Recursively convert incompatible types in the entire args tree:
 * - Date objects → Unix timestamps (seconds)
 * - Boolean `true` on known fields → current Unix timestamp
 *
 * Handles nested structures like `where: { expires: { lt: new Date() } }`.
 */
function deepConvertInputs(obj: unknown, parentKey?: string): unknown {
  if (obj instanceof Date) {
    return dateToUnix(obj);
  }
  // Convert boolean `true` to current timestamp for specific fields
  if (typeof obj === 'boolean' && parentKey && BOOLEAN_TO_TIMESTAMP_FIELDS.has(parentKey)) {
    return obj ? Math.floor(Date.now() / 1000) : null;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepConvertInputs(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = deepConvertInputs(value, key);
    }
    return result;
  }
  return obj;
}

/** Convert Unix timestamps back to Date objects for known date fields */
function convertOutputDates(
  data: Record<string, unknown> | null,
  modelKey: string
): Record<string, unknown> | null {
  if (!data) return data;
  const fields = AUTH_DATE_FIELDS[modelKey];
  if (!fields) return data;

  const result = { ...data };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'number' && value > 0) {
      result[field] = unixToDate(value);
    }
  }
  return result;
}

/** Resolve model accessor key (handles both 'user' and 'User' access patterns) */
function resolveModelKey(prop: string): string | null {
  if (AUTH_DATE_FIELDS[prop]) return prop;
  const alias = MODEL_ALIASES[prop];
  if (alias && AUTH_DATE_FIELDS[alias]) return alias;
  return null;
}

/** All Prisma operations that may contain Date values in args */
const ALL_OPS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'findFirst',
  'findUnique',
  'findMany',
  'count',
  'aggregate',
]);
const SINGLE_RESULT_OPS = new Set(['create', 'update', 'upsert', 'findFirst', 'findUnique']);
const MULTI_RESULT_OPS = new Set(['findMany']);

/**
 * Create a proxy around PrismaClient that converts Date ↔ Unix timestamp
 * for auth-related models. Non-auth models pass through unchanged.
 */
export function createAuthPrismaProxy<T>(prisma: T): T {
  return new Proxy(prisma as object, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Only proxy auth model accessors
      if (typeof prop !== 'string') return value;
      const modelKey = resolveModelKey(prop);
      if (!modelKey || !value || typeof value !== 'object') return value;

      return new Proxy(value as object, {
        get(modelTarget, methodName, modelReceiver) {
          const method = Reflect.get(modelTarget, methodName, modelReceiver);
          if (typeof method !== 'function') return method;

          const methodStr = methodName as string;

          // Only intercept known Prisma operations
          if (!ALL_OPS.has(methodStr)) {
            return method.bind(modelTarget);
          }

          return async function (this: unknown, ...args: any[]) {
            // Deep-convert all incompatible types in the entire args tree
            // Handles data, where, create, update, orderBy, etc.
            if (args[0] && typeof args[0] === 'object') {
              args[0] = deepConvertInputs(args[0]);
            }

            // Call original method
            const result = await method.apply(modelTarget, args);

            // Convert timestamps back to Dates in results
            if (SINGLE_RESULT_OPS.has(methodStr)) {
              return convertOutputDates(result as Record<string, unknown> | null, modelKey);
            }
            if (MULTI_RESULT_OPS.has(methodStr) && Array.isArray(result)) {
              return result.map(item =>
                convertOutputDates(item as Record<string, unknown>, modelKey)
              );
            }

            return result;
          };
        },
      });
    },
  }) as T;
}
