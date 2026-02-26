/**
 * User Registration API Tests
 *
 * Tests for the /api/register endpoint.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/register/route';
import { NextRequest } from 'next/server';

// Mock Prisma client (for better-auth account creation)
const mockPrismaAccountCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1 }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    account: {
      create: mockPrismaAccountCreate,
    },
  },
}));

// Mock dependencies
vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password_123'),
}));

vi.mock('@/lib/cache/client', () => ({
  createCacheClient: vi.fn().mockReturnValue({
    delete: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackBusinessEvent: vi.fn(),
    trackHttpRequest: vi.fn(),
    trackError: vi.fn(),
  },
  AnalyticsEventType: {
    USER_CREATED: 'user.created',
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    withMetadata: vi.fn().mockReturnThis(),
  },
  LoggerFactory: {
    getLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      http: vi.fn(),
      withMetadata: vi.fn().mockReturnThis(),
    }),
  },
}));

// Mock withRepositories - this is the key to proper error handling
const mockUsersRepo = {
  existsByEmail: vi.fn(),
  create: vi.fn(),
};

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api');
  const { errorResponse } =
    await vi.importActual<typeof import('@/lib/api/response')>('@/lib/api/response');

  return {
    ...actual,
    withRepositories: vi.fn(async (req, handler) => {
      try {
        return await handler({
          users: mockUsersRepo,
        });
      } catch (error) {
        // Properly handle errors and return error responses
        return errorResponse(error);
      }
    }),
  };
});

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful registration', () => {
    it('should register a new user with valid data', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockUsersRepo.existsByEmail.mockResolvedValue(false);
      mockUsersRepo.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        createdAt: now,
      });

      const request = createRequest({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        data: { email: string; name: string };
      };

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.email).toBe('test@example.com');
      expect(data.data.name).toBe('Test User');
    });

    it('should use email prefix as default name if name not provided', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockUsersRepo.existsByEmail.mockResolvedValue(false);
      mockUsersRepo.create.mockResolvedValue({
        id: 1,
        email: 'john.doe@example.com',
        name: 'john.doe',
        createdAt: now,
      });

      const request = createRequest({
        email: 'john.doe@example.com',
        password: 'password123',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        data: { name: string };
      };

      expect(response.status).toBe(201);
      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'john.doe',
        })
      );
    });

    it('should hash password before storing', async () => {
      const { hashPassword } = await import('@/lib/auth/password');
      const now = Math.floor(Date.now() / 1000);
      mockUsersRepo.existsByEmail.mockResolvedValue(false);
      mockUsersRepo.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        name: 'Test',
        createdAt: now,
      });

      const request = createRequest({
        email: 'test@example.com',
        password: 'mySecurePassword',
        name: 'Test',
      });

      await POST(request);

      expect(hashPassword).toHaveBeenCalledWith('mySecurePassword');
      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'hashed_password_123',
        })
      );
    });
  });

  describe('validation errors', () => {
    it('should return 400 for invalid email format', async () => {
      const request = createRequest({
        email: 'invalid-email',
        password: 'password123',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('email');
    });

    it('should return 400 for password too short', async () => {
      const request = createRequest({
        email: 'test@example.com',
        password: '123',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('8 characters');
    });

    it('should return 400 for missing email', async () => {
      const request = createRequest({
        password: 'password123',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for missing password', async () => {
      const request = createRequest({
        email: 'test@example.com',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('duplicate email handling', () => {
    it('should return 409 if email already exists', async () => {
      mockUsersRepo.existsByEmail.mockResolvedValue(true);

      const request = createRequest({
        email: 'existing@example.com',
        password: 'password123',
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('already exists');
    });
  });
});
