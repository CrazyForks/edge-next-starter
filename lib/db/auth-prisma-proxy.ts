/**
 * Prisma Client Proxy for better-auth Date ↔ Unix Timestamp Compatibility
 *
 * Problem: better-auth internally uses Date objects for all date fields,
 * but our Prisma schema uses Int (Unix timestamps in seconds) for D1/SQLite.
 *
 * Solution: Proxy the PrismaClient to intercept auth-model operations:
 * - Write operations: Convert Date → Unix timestamp (seconds)
 * - Read operations: Convert Unix timestamp → Date (for known date fields)
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

/** Convert Date objects in data to Unix timestamps (seconds) */
function convertInputDates(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (value instanceof Date) {
      result[key] = dateToUnix(value);
    }
  }
  return result;
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

const WRITE_OPS = new Set(['create', 'update', 'updateMany', 'upsert', 'createMany']);
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

          // Only intercept operations that need date conversion
          if (
            !WRITE_OPS.has(methodStr) &&
            !SINGLE_RESULT_OPS.has(methodStr) &&
            !MULTI_RESULT_OPS.has(methodStr)
          ) {
            return method.bind(modelTarget);
          }

          return async function (this: unknown, ...args: any[]) {
            const firstArg = args[0] as Record<string, any> | undefined;

            // Convert Dates in write data
            if (WRITE_OPS.has(methodStr) && firstArg) {
              if (firstArg.data && typeof firstArg.data === 'object') {
                firstArg.data = convertInputDates(firstArg.data as Record<string, unknown>);
              }
              if (firstArg.update && typeof firstArg.update === 'object') {
                firstArg.update = convertInputDates(firstArg.update as Record<string, unknown>);
              }
              if (firstArg.create && typeof firstArg.create === 'object') {
                firstArg.create = convertInputDates(firstArg.create as Record<string, unknown>);
              }
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
