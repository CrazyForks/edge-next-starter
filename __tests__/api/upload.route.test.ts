/**
 * Upload API Tests
 *
 * Tests for the /api/upload endpoint (POST for upload, GET for download).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Use vi.hoisted to ensure mock functions are available before vi.mock is executed
const mockGetSession = vi.hoisted(() => vi.fn());
const mockUploadFile = vi.hoisted(() => vi.fn());
const mockDownloadFile = vi.hoisted(() => vi.fn());
const mockCheckUploadRateLimit = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockCreateSignedDownloadUrl = vi.hoisted(() => vi.fn());
const mockVerifySignedUrl = vi.hoisted(() => vi.fn());
const mockGetClientIdentifier = vi.hoisted(() => vi.fn().mockResolvedValue('test-client-id'));
const mockGetAdjustedRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue({ limit: 30, isStrict: false })
);

// Mock auth (better-auth)
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

// Mock R2 client
vi.mock('@/lib/r2/client', () => ({
  uploadFile: mockUploadFile,
  downloadFile: mockDownloadFile,
}));

// Mock rate limiter
vi.mock('@/lib/rate-limiter', () => ({
  checkUploadRateLimit: mockCheckUploadRateLimit,
  checkRateLimit: mockCheckRateLimit,
}));

// Mock signed URL
vi.mock('@/lib/signed-url', () => ({
  createSignedDownloadUrl: mockCreateSignedDownloadUrl,
  verifySignedUrl: mockVerifySignedUrl,
}));

// Mock client identifier
vi.mock('@/lib/utils/client-identifier', () => ({
  getClientIdentifier: mockGetClientIdentifier,
  getAdjustedRateLimit: mockGetAdjustedRateLimit,
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

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackHttpRequest: vi.fn(),
    trackError: vi.fn(),
  },
}));

// Mock @/lib/api - need to properly handle errors and return errorResponse
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api');
  const { errorResponse } =
    await vi.importActual<typeof import('@/lib/api/response')>('@/lib/api/response');

  return {
    ...actual,
    // Override withMiddleware to properly catch errors and return errorResponse
    withMiddleware: vi.fn(async (_req: NextRequest, handler: () => Promise<NextResponse>) => {
      try {
        return await handler();
      } catch (error) {
        return errorResponse(error);
      }
    }),
    // Override withApiHandler to properly catch errors
    withApiHandler: vi.fn(async <T>(handler: () => Promise<T>) => {
      const { successResponse, errorResponse: errResp } =
        await vi.importActual<typeof import('@/lib/api/response')>('@/lib/api/response');
      try {
        const data = await handler();
        return successResponse(data);
      } catch (error) {
        return errResp(error);
      }
    }),
  };
});

// Import after mocks are set up
import { POST, GET } from '@/app/api/upload/route';

/**
 * Helper function to create a mock File object
 */
function createMockFile(
  content: string | ArrayBuffer,
  name: string,
  type: string = 'text/plain'
): File {
  const blob =
    typeof content === 'string' ? new Blob([content], { type }) : new Blob([content], { type });
  return new File([blob], name, { type });
}

/**
 * Helper function to create a request with mocked formData
 */
function createUploadRequest(
  fileOrNull: File | null,
  url: string = 'http://localhost:3000/api/upload'
): NextRequest {
  const request = new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary',
    },
  });

  // Override formData method to return our mock data
  const mockFormData = new Map<string, File | null>();
  if (fileOrNull) {
    mockFormData.set('file', fileOrNull);
  }

  request.formData = vi.fn().mockResolvedValue({
    get: (key: string) => mockFormData.get(key) || null,
  });

  return request;
}

describe('Upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/upload', () => {
    it('should reject unauthenticated requests', async () => {
      mockGetSession.mockResolvedValue(null);

      const file = createMockFile('test content', 'test.txt');
      const request = createUploadRequest(file);

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('login');
    });

    it('should reject requests exceeding rate limit', async () => {
      mockGetSession.mockResolvedValue({ user: { id: '1' } });
      mockCheckUploadRateLimit.mockResolvedValue({
        allowed: false,
        limit: 10,
        current: 10,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      const file = createMockFile('test content', 'test.txt');
      const request = createUploadRequest(file);

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error.message.toLowerCase()).toContain('rate limit');
    });

    it('should reject requests without file', async () => {
      mockGetSession.mockResolvedValue({ user: { id: '1' } });
      mockCheckUploadRateLimit.mockResolvedValue({
        allowed: true,
        limit: 10,
        current: 1,
        remaining: 9,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      // No file in request
      const request = createUploadRequest(null);

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message.toLowerCase()).toContain('file');
    });

    it('should reject files exceeding max size', async () => {
      mockGetSession.mockResolvedValue({ user: { id: '1' } });
      mockCheckUploadRateLimit.mockResolvedValue({
        allowed: true,
        limit: 10,
        current: 1,
        remaining: 9,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      // Create a file larger than 10MB
      const largeContent = new ArrayBuffer(11 * 1024 * 1024);
      const file = createMockFile(largeContent, 'large.bin', 'application/octet-stream');
      const request = createUploadRequest(file);

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      // FileSizeExceededError returns HTTP 413 (Payload Too Large)
      expect(response.status).toBe(413);
      expect(data.success).toBe(false);
      expect(data.error.message.toLowerCase()).toContain('size');
    });

    it('should upload file successfully', async () => {
      mockGetSession.mockResolvedValue({ user: { id: '1' } });
      mockCheckUploadRateLimit.mockResolvedValue({
        allowed: true,
        limit: 10,
        current: 1,
        remaining: 9,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });
      mockUploadFile.mockResolvedValue({
        key: 'uploads/123-test.txt',
        size: 12,
        etag: '"abc123"',
        uploaded: true,
      });
      mockCreateSignedDownloadUrl.mockResolvedValue(
        'http://localhost:3000/api/upload?key=uploads/123-test.txt&signature=xxx&expires=123'
      );

      const file = createMockFile('test content', 'test.txt');
      const request = createUploadRequest(file);

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        data: { key: string; url: string };
      };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.key).toContain('uploads/');
      expect(data.data.url).toContain('signature=');
    });

    it('should handle R2 storage unavailable', async () => {
      mockGetSession.mockResolvedValue({ user: { id: '1' } });
      mockCheckUploadRateLimit.mockResolvedValue({
        allowed: true,
        limit: 10,
        current: 1,
        remaining: 9,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });
      mockUploadFile.mockResolvedValue(null);

      const file = createMockFile('test content', 'test.txt');
      const request = createUploadRequest(file);

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('R2');
    });
  });

  describe('GET /api/upload', () => {
    it('should reject requests without key parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/upload');

      const response = await GET(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message.toLowerCase()).toContain('key');
    });

    it('should reject requests without signature', async () => {
      const request = new NextRequest('http://localhost:3000/api/upload?key=test.txt');

      const response = await GET(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message.toLowerCase()).toContain('signature');
    });

    it('should reject requests without expires parameter', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/upload?key=test.txt&signature=abc123'
      );

      const response = await GET(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject invalid expires parameter', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/upload?key=test.txt&signature=abc123&expires=invalid'
      );

      const response = await GET(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message.toLowerCase()).toContain('expiration');
    });

    it('should reject expired or invalid signature', async () => {
      mockVerifySignedUrl.mockResolvedValue({
        valid: false,
        reason: 'URL has expired',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/upload?key=test.txt&signature=invalid&expires=123'
      );

      const response = await GET(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('expired');
    });

    it('should reject requests exceeding download rate limit', async () => {
      mockVerifySignedUrl.mockResolvedValue({
        valid: true,
      });
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        limit: 30,
        current: 30,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/upload?key=test.txt&signature=valid&expires=9999999999'
      );

      const response = await GET(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error.message.toLowerCase()).toContain('rate limit');
    });

    it('should return 404 when file not found', async () => {
      mockVerifySignedUrl.mockResolvedValue({
        valid: true,
      });
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        limit: 30,
        current: 1,
        remaining: 29,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });
      mockDownloadFile.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/upload?key=nonexistent.txt&signature=valid&expires=9999999999'
      );

      const response = await GET(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should download file successfully', async () => {
      mockVerifySignedUrl.mockResolvedValue({
        valid: true,
      });
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        limit: 30,
        current: 1,
        remaining: 29,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      // Create a mock Blob with proper arrayBuffer method
      const mockContent = new Uint8Array([116, 101, 115, 116]).buffer; // "test" in bytes
      const mockBlob = {
        type: 'text/plain',
        arrayBuffer: vi.fn().mockResolvedValue(mockContent),
      };
      mockDownloadFile.mockResolvedValue(mockBlob);

      const request = new NextRequest(
        'http://localhost:3000/api/upload?key=test.txt&signature=valid&expires=9999999999'
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    });
  });
});
