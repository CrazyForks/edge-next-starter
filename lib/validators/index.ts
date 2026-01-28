/**
 * Shared Validation Utilities
 * Centralized validation functions to eliminate code duplication across API routes
 */

import { z } from 'zod';
import { ValidationError } from '@/lib/errors';
import { NextRequest } from 'next/server';

// =============================================================================
// Email Validation
// =============================================================================

/**
 * RFC 5322 compliant email regex pattern
 * More comprehensive than the basic pattern used previously
 */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validates email format
 * @param email - Email string to validate
 * @returns true if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

/**
 * Validates email and throws ValidationError if invalid
 * @param email - Email string to validate
 * @param fieldName - Optional field name for error message
 * @throws ValidationError if email is invalid
 */
export function validateEmail(email: unknown, fieldName = 'Email'): string {
  if (!email || typeof email !== 'string') {
    throw new ValidationError(`${fieldName} is required`);
  }

  const trimmedEmail = email.trim().toLowerCase();

  if (!isValidEmail(trimmedEmail)) {
    throw new ValidationError(`Invalid ${fieldName.toLowerCase()} format`);
  }

  return trimmedEmail;
}

// =============================================================================
// ID Parameter Validation
// =============================================================================

/**
 * Validates and parses an integer ID parameter
 * @param id - ID string to validate
 * @param fieldName - Optional field name for error message
 * @returns Parsed integer ID
 * @throws ValidationError if ID is invalid
 */
export function validateIntegerId(id: unknown, fieldName = 'ID'): number {
  if (id === undefined || id === null || id === '') {
    throw new ValidationError(`${fieldName} is required`);
  }

  const stringId = String(id);
  const parsedId = parseInt(stringId, 10);

  if (isNaN(parsedId) || parsedId < 1) {
    throw new ValidationError(`Invalid ${fieldName.toLowerCase()}`);
  }

  // Check for non-integer values like "123abc"
  if (String(parsedId) !== stringId) {
    throw new ValidationError(`Invalid ${fieldName.toLowerCase()}`);
  }

  return parsedId;
}

/**
 * Validates UUID format
 * @param uuid - UUID string to validate
 * @param fieldName - Optional field name for error message
 * @returns Validated UUID string
 * @throws ValidationError if UUID is invalid
 */
export function validateUuid(uuid: unknown, fieldName = 'ID'): string {
  if (!uuid || typeof uuid !== 'string') {
    throw new ValidationError(`${fieldName} is required`);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new ValidationError(`Invalid ${fieldName.toLowerCase()} format`);
  }

  return uuid.toLowerCase();
}

// =============================================================================
// Request Body Parsing
// =============================================================================

/**
 * Parses and validates JSON request body
 * @param request - NextRequest object
 * @returns Parsed JSON body
 * @throws ValidationError if body is not valid JSON
 */
export async function parseJsonBody<T = unknown>(request: NextRequest): Promise<T> {
  try {
    const body = await request.json();
    return body as T;
  } catch (error) {
    throw new ValidationError('Invalid JSON body', error);
  }
}

/**
 * Parses and validates JSON request body with Zod schema
 * @param request - NextRequest object
 * @param schema - Zod schema for validation
 * @returns Validated and typed body
 * @throws ValidationError if body is invalid
 */
export async function parseAndValidateBody<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  const body = await parseJsonBody(request);

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      throw new ValidationError(firstError?.message || 'Validation failed', error);
    }
    throw error;
  }
}

// =============================================================================
// Password Validation
// =============================================================================

/**
 * Password validation schema with comprehensive requirements
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(password => /[A-Z]/.test(password), 'Password must contain at least one uppercase letter')
  .refine(password => /[a-z]/.test(password), 'Password must contain at least one lowercase letter')
  .refine(password => /[0-9]/.test(password), 'Password must contain at least one number')
  .refine(
    password => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    'Password must contain at least one special character'
  );

/**
 * Simple password schema (minimum requirements only)
 * Used for backward compatibility
 */
export const simplePasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

/**
 * Validates password strength
 * @param password - Password to validate
 * @param strict - Use strict validation with all requirements
 * @returns Validated password
 * @throws ValidationError if password is invalid
 */
export function validatePassword(password: unknown, strict = false): string {
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required');
  }

  try {
    if (strict) {
      return passwordSchema.parse(password);
    }
    return simplePasswordSchema.parse(password);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      throw new ValidationError(firstError?.message || 'Invalid password', error);
    }
    throw error;
  }
}

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Email schema for Zod validation
 */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please provide a valid email address')
  .max(254, 'Email is too long')
  .transform(email => email.trim().toLowerCase());

/**
 * Name schema for Zod validation
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')
  .transform(name => name.trim());

/**
 * Optional name schema
 */
export const optionalNameSchema = z
  .string()
  .max(100, 'Name is too long')
  .transform(name => name.trim())
  .optional();

/**
 * User registration schema
 */
export const userRegistrationSchema = z.object({
  email: emailSchema,
  password: simplePasswordSchema, // Use simple for backward compatibility
  name: optionalNameSchema,
});

/**
 * User creation schema (for admin/API use)
 */
export const userCreateSchema = z.object({
  email: emailSchema,
  name: optionalNameSchema,
});

/**
 * User update schema
 */
export const userUpdateSchema = z
  .object({
    email: emailSchema.optional(),
    name: optionalNameSchema,
  })
  .refine(
    data => data.email !== undefined || data.name !== undefined,
    'At least one field must be provided for update'
  );

// =============================================================================
// Pagination Validation
// =============================================================================

/**
 * Pagination parameters schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * Validates pagination parameters from URL search params
 * @param searchParams - URL search params
 * @returns Validated pagination object
 */
export function validatePagination(searchParams: URLSearchParams): { page: number; limit: number } {
  const page = searchParams.get('page');
  const limit = searchParams.get('limit');

  try {
    return paginationSchema.parse({
      page: page || 1,
      limit: limit || 10,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      throw new ValidationError(firstError?.message || 'Invalid pagination parameters', error);
    }
    throw error;
  }
}

// =============================================================================
// String Validation Helpers
// =============================================================================

/**
 * Validates required string field
 * @param value - Value to validate
 * @param fieldName - Field name for error message
 * @returns Trimmed string value
 * @throws ValidationError if value is not a valid string
 */
export function validateRequiredString(value: unknown, fieldName: string): string {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`${fieldName} is required`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }

  return trimmed;
}

/**
 * Validates optional string field
 * @param value - Value to validate
 * @param maxLength - Maximum allowed length
 * @returns Trimmed string value or undefined
 */
export function validateOptionalString(value: unknown, maxLength = 255): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ValidationError('Invalid string value');
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`Value is too long (max ${maxLength} characters)`);
  }

  return trimmed || undefined;
}

// =============================================================================
// Export types
// =============================================================================

export type UserRegistrationInput = z.infer<typeof userRegistrationSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
