import { PrismaClient } from '@prisma/client';
import { UserRepository } from './user.repository';
import { PostRepository } from './post.repository';
import { CustomerRepository } from './customer.repository';
import { PaymentRepository } from './payment.repository';
import { SubscriptionRepository } from './subscription.repository';
import { InvoiceRepository } from './invoice.repository';
import { WebhookEventRepository } from './webhook-event.repository';

/**
 * Repository Factory
 * Create and manage all repository instances
 */
export class RepositoryFactory {
  private userRepo?: UserRepository;
  private postRepo?: PostRepository;
  private customerRepo?: CustomerRepository;
  private paymentRepo?: PaymentRepository;
  private subscriptionRepo?: SubscriptionRepository;
  private invoiceRepo?: InvoiceRepository;
  private webhookEventRepo?: WebhookEventRepository;

  constructor(private prisma: PrismaClient) {}

  /**
   * Get User Repository
   */
  get users(): UserRepository {
    if (!this.userRepo) {
      this.userRepo = new UserRepository(this.prisma);
    }
    return this.userRepo;
  }

  /**
   * Get Post Repository
   */
  get posts(): PostRepository {
    if (!this.postRepo) {
      this.postRepo = new PostRepository(this.prisma);
    }
    return this.postRepo;
  }

  /**
   * Get Customer Repository (Stripe)
   */
  get customers(): CustomerRepository {
    if (!this.customerRepo) {
      this.customerRepo = new CustomerRepository(this.prisma);
    }
    return this.customerRepo;
  }

  /**
   * Get Payment Repository (Stripe)
   */
  get payments(): PaymentRepository {
    if (!this.paymentRepo) {
      this.paymentRepo = new PaymentRepository(this.prisma);
    }
    return this.paymentRepo;
  }

  /**
   * Get Subscription Repository (Stripe)
   */
  get subscriptions(): SubscriptionRepository {
    if (!this.subscriptionRepo) {
      this.subscriptionRepo = new SubscriptionRepository(this.prisma);
    }
    return this.subscriptionRepo;
  }

  /**
   * Get Invoice Repository (Stripe)
   */
  get invoices(): InvoiceRepository {
    if (!this.invoiceRepo) {
      this.invoiceRepo = new InvoiceRepository(this.prisma);
    }
    return this.invoiceRepo;
  }

  /**
   * Get Webhook Event Repository (Stripe)
   */
  get webhookEvents(): WebhookEventRepository {
    if (!this.webhookEventRepo) {
      this.webhookEventRepo = new WebhookEventRepository(this.prisma);
    }
    return this.webhookEventRepo;
  }
}

/**
 * Create Repository Factory instance
 */
export function createRepositories(prisma: PrismaClient): RepositoryFactory {
  return new RepositoryFactory(prisma);
}

// Export all repositories
export { UserRepository } from './user.repository';
export { PostRepository } from './post.repository';
export type { PostWithUser, PostWithoutUser } from './post.repository';
export { CustomerRepository } from './customer.repository';
export { PaymentRepository } from './payment.repository';
export { SubscriptionRepository } from './subscription.repository';
export { InvoiceRepository } from './invoice.repository';
export { WebhookEventRepository } from './webhook-event.repository';
