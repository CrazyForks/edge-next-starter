/**
 * Stripe Subscription Checkout API Tests
 *
 * Tests for the /api/stripe/checkout/subscription endpoint.
 * These tests focus on the subscription checkout flow including:
 * - Authentication
 * - New customer creation
 * - Existing customer handling
 * - Active subscription validation
 * - Trial period handling
 * - Custom URLs and metadata
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Hoist all mocks to ensure they're available before module imports
const mockGetSession = vi.hoisted(() => vi.fn());
const mockStripeCustomersCreate = vi.hoisted(() => vi.fn());
const mockStripeCheckoutSessionsCreate = vi.hoisted(() => vi.fn());
const mockCustomersRepo = vi.hoisted(() => ({
  findByUserId: vi.fn(),
  create: vi.fn(),
}));
const mockSubscriptionsRepo = vi.hoisted(() => ({
  findActiveByCustomerId: vi.fn(),
  findByCustomerId: vi.fn(),
}));

// Mock auth (better-auth)
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

// Mock Stripe client
vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(() => ({
    customers: {
      create: mockStripeCustomersCreate,
    },
    checkout: {
      sessions: {
        create: mockStripeCheckoutSessionsCreate,
      },
    },
  })),
  CHECKOUT_URLS: {
    successUrl: '/checkout/success',
    cancelUrl: '/checkout/cancel',
  },
  getPlanByPriceId: vi.fn().mockReturnValue({
    id: 'pro',
    name: 'Pro Plan',
    monthly: { priceId: 'price_monthly', trialDays: 7 },
    yearly: { priceId: 'price_yearly', trialDays: 14 },
  }),
  createStripeErrorFromSDK: vi.fn(error => error),
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackBusinessEvent: vi.fn(),
  },
  AnalyticsEventType: {
    CHECKOUT_STARTED: 'checkout.started',
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

// Mock API wrappers with proper error handling
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api');
  const { errorResponse } =
    await vi.importActual<typeof import('@/lib/api/response')>('@/lib/api/response');

  return {
    ...actual,
    withRepositories: vi.fn(async (req, handler) => {
      try {
        return await handler({
          customers: mockCustomersRepo,
          subscriptions: mockSubscriptionsRepo,
        });
      } catch (error) {
        return errorResponse(error);
      }
    }),
    withRateLimit: vi.fn(async (req, handler) => {
      try {
        return await handler();
      } catch (error) {
        return errorResponse(error);
      }
    }),
  };
});

// Import after mocks
import { POST } from '@/app/api/stripe/checkout/subscription/route';

function createRequest(body: unknown, origin = 'http://localhost:3000'): NextRequest {
  return new NextRequest('http://localhost:3000/api/stripe/checkout/subscription', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe('Stripe Subscription Checkout API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    mockStripeCustomersCreate.mockReset();
    mockStripeCheckoutSessionsCreate.mockReset();
    mockCustomersRepo.findByUserId.mockReset();
    mockCustomersRepo.create.mockReset();
    mockSubscriptionsRepo.findActiveByCustomerId.mockReset();
    mockSubscriptionsRepo.findByCustomerId.mockReset();
  });

  describe('POST /api/stripe/checkout/subscription', () => {
    describe('Authentication', () => {
      it('should reject unauthenticated requests', async () => {
        mockGetSession.mockResolvedValue(null);

        const request = createRequest({ priceId: 'price_123' });
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
          error: { message: string };
        };

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.error.message).toContain('Authentication');
      });

      it('should reject session without email', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', name: 'Test User' },
        });

        const request = createRequest({ priceId: 'price_123' });
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
          error: { message: string };
        };

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
      });
    });

    describe('Validation', () => {
      it('should reject requests without priceId', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue(null);

        const request = createRequest({});
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
          error: { message: string };
        };

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error.message).toContain('priceId');
      });

      it('should reject invalid JSON body', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });

        const request = new NextRequest('http://localhost:3000/api/stripe/checkout/subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3000',
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

    describe('Active subscription check', () => {
      it('should reject if user already has active subscription', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue({
          id: 1,
          userId: 1,
          stripeCustomerId: 'cus_existing',
        });
        mockSubscriptionsRepo.findActiveByCustomerId.mockResolvedValue({
          id: 10,
          stripeSubscriptionId: 'sub_active',
          status: 'active',
        });

        const request = createRequest({ priceId: 'price_123' });
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
          error: { message: string };
        };

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error.message).toContain('active subscription');
      });
    });

    describe('New customer creation', () => {
      it('should create checkout session for new customer', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com', name: 'Test User' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue(null);
        mockStripeCustomersCreate.mockResolvedValue({
          id: 'cus_new123',
        });
        mockCustomersRepo.create.mockResolvedValue({
          id: 1,
          userId: 1,
          stripeCustomerId: 'cus_new123',
        });
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_sub123',
          url: 'https://checkout.stripe.com/cs_test_sub123',
        });

        const request = createRequest({ priceId: 'price_monthly' });
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
          data: { sessionId: string; url: string };
        };

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.sessionId).toBe('cs_test_sub123');
        expect(data.data.url).toContain('checkout.stripe.com');

        // Verify Stripe customer was created
        expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'test@example.com',
            name: 'Test User',
            metadata: { userId: '1' },
          })
        );

        // Verify checkout session is subscription mode
        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            customer: 'cus_new123',
            mode: 'subscription',
          })
        );
      });

      it('should include trial days for new customers', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue(null);
        mockStripeCustomersCreate.mockResolvedValue({
          id: 'cus_new123',
        });
        mockCustomersRepo.create.mockResolvedValue({
          id: 1,
          userId: 1,
          stripeCustomerId: 'cus_new123',
        });
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_trial',
          url: 'https://checkout.stripe.com/cs_test_trial',
        });

        const request = createRequest({ priceId: 'price_monthly' });
        await POST(request);

        // Verify trial days are included in subscription_data
        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            subscription_data: expect.objectContaining({
              trial_period_days: 7,
            }),
          })
        );
      });

      it('should not include trial for returning customers', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue(null);
        mockStripeCustomersCreate.mockResolvedValue({
          id: 'cus_new123',
        });
        mockCustomersRepo.create.mockResolvedValue({
          id: 1,
          userId: 1,
          stripeCustomerId: 'cus_new123',
        });
        // Returning customer has previous subscriptions
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([{ id: 5, status: 'canceled' }]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_notrial',
          url: 'https://checkout.stripe.com/cs_test_notrial',
        });

        const request = createRequest({ priceId: 'price_monthly' });
        await POST(request);

        // Verify trial_period_days is NOT in subscription_data
        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            subscription_data: expect.not.objectContaining({
              trial_period_days: expect.anything(),
            }),
          })
        );
      });
    });

    describe('Existing customer handling', () => {
      it('should use existing customer for checkout', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue({
          id: 1,
          userId: 1,
          stripeCustomerId: 'cus_existing123',
        });
        mockSubscriptionsRepo.findActiveByCustomerId.mockResolvedValue(null);
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_existing',
          url: 'https://checkout.stripe.com/cs_test_existing',
        });

        const request = createRequest({ priceId: 'price_123' });
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
        };

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Should NOT create new Stripe customer
        expect(mockStripeCustomersCreate).not.toHaveBeenCalled();

        // Should use existing customer ID
        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            customer: 'cus_existing123',
            mode: 'subscription',
          })
        );
      });
    });

    describe('Custom URLs and metadata', () => {
      it('should use custom success and cancel URLs', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue({
          id: 1,
          stripeCustomerId: 'cus_123',
        });
        mockSubscriptionsRepo.findActiveByCustomerId.mockResolvedValue(null);
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_urls',
          url: 'https://checkout.stripe.com/cs_test_urls',
        });

        const request = createRequest({
          priceId: 'price_123',
          successUrl: 'https://myapp.com/success',
          cancelUrl: 'https://myapp.com/cancel',
        });

        await POST(request);

        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            success_url: 'https://myapp.com/success',
            cancel_url: 'https://myapp.com/cancel',
          })
        );
      });

      it('should pass metadata to checkout session', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue({
          id: 1,
          stripeCustomerId: 'cus_123',
        });
        mockSubscriptionsRepo.findActiveByCustomerId.mockResolvedValue(null);
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_meta',
          url: 'https://checkout.stripe.com/cs_test_meta',
        });

        const request = createRequest({
          priceId: 'price_123',
          metadata: { campaign: 'summer_sale', referrer: 'homepage' },
        });

        await POST(request);

        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              campaign: 'summer_sale',
              referrer: 'homepage',
            }),
          })
        );
      });

      it('should use custom trial days when provided', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue(null);
        mockStripeCustomersCreate.mockResolvedValue({
          id: 'cus_new',
        });
        mockCustomersRepo.create.mockResolvedValue({
          id: 1,
          userId: 1,
          stripeCustomerId: 'cus_new',
        });
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_custom_trial',
          url: 'https://checkout.stripe.com/cs_test_custom_trial',
        });

        const request = createRequest({
          priceId: 'price_123',
          trialDays: 30,
        });

        await POST(request);

        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            subscription_data: expect.objectContaining({
              trial_period_days: 30,
            }),
          })
        );
      });

      it('should disable promotion codes when allowPromotionCodes is false', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue({
          id: 1,
          stripeCustomerId: 'cus_123',
        });
        mockSubscriptionsRepo.findActiveByCustomerId.mockResolvedValue(null);
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockResolvedValue({
          id: 'cs_test_nopromo',
          url: 'https://checkout.stripe.com/cs_test_nopromo',
        });

        const request = createRequest({
          priceId: 'price_123',
          allowPromotionCodes: false,
        });

        await POST(request);

        expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            allow_promotion_codes: false,
          })
        );
      });
    });

    describe('Stripe API errors', () => {
      it('should handle Stripe customer creation error', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue(null);
        mockStripeCustomersCreate.mockRejectedValue(new Error('Stripe API error'));

        const request = createRequest({ priceId: 'price_123' });
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
          error: { message: string };
        };

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
      });

      it('should handle Stripe checkout session creation error', async () => {
        mockGetSession.mockResolvedValue({
          user: { id: '1', email: 'test@example.com' },
        });
        mockCustomersRepo.findByUserId.mockResolvedValue({
          id: 1,
          stripeCustomerId: 'cus_123',
        });
        mockSubscriptionsRepo.findActiveByCustomerId.mockResolvedValue(null);
        mockSubscriptionsRepo.findByCustomerId.mockResolvedValue([]);
        mockStripeCheckoutSessionsCreate.mockRejectedValue(new Error('Invalid price'));

        const request = createRequest({ priceId: 'price_invalid' });
        const response = await POST(request);
        const data = (await response.json()) as {
          success: boolean;
          error: { message: string };
        };

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
      });
    });
  });
});
