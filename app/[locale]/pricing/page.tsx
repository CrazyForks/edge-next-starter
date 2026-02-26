/**
 * Pricing Page
 * Display subscription plans and one-time products
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getSubscriptionPlans, formatPrice, type PlanConfig } from '@/lib/stripe/config';
import { CheckoutButton } from './checkout-button';

export default async function PricingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const plans = getSubscriptionPlans();

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that works best for you. All plans include a 14-day free trial.
          </p>
        </div>

        {/* Pricing Grid */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 mb-12">
          {plans.map(plan => (
            <PricingCard key={plan.id} plan={plan} isAuthenticated={!!session?.user} />
          ))}
        </div>

        {/* FAQ or Additional Info */}
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
          <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto text-left">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I cancel anytime?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes! You can cancel your subscription at any time. You&apos;ll continue to have
                  access until the end of your billing period.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What payment methods do you accept?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  We accept all major credit cards including Visa, Mastercard, and American Express
                  through our secure payment provider Stripe.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Back to home */}
        <div className="text-center mt-12">
          <Button variant="outline" asChild>
            <Link href="/">← Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PricingCard({ plan, isAuthenticated }: { plan: PlanConfig; isAuthenticated: boolean }) {
  const isPopular = plan.id === 'pro';
  const monthlyPrice = plan.monthly;
  const yearlyPrice = plan.yearly;

  return (
    <Card className={`relative ${isPopular ? 'border-primary shadow-lg' : ''}`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      )}
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Price */}
        <div className="text-center">
          {plan.isFree ? (
            <div className="text-4xl font-bold">Free</div>
          ) : monthlyPrice ? (
            <div>
              <span className="text-4xl font-bold">
                {formatPrice(monthlyPrice.amount, monthlyPrice.currency)}
              </span>
              <span className="text-muted-foreground">/month</span>
              {yearlyPrice && (
                <p className="text-sm text-muted-foreground mt-1">
                  or {formatPrice(yearlyPrice.amount, yearlyPrice.currency)}/year (save 2 months)
                </p>
              )}
            </div>
          ) : (
            <div className="text-4xl font-bold">Contact Us</div>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-2">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-green-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <div className="pt-4">
          {plan.isFree ? (
            <Button variant="outline" className="w-full" asChild>
              <Link href={isAuthenticated ? '/dashboard' : '/register'}>
                {isAuthenticated ? 'Current Plan' : 'Get Started'}
              </Link>
            </Button>
          ) : isAuthenticated && monthlyPrice ? (
            <CheckoutButton
              priceId={monthlyPrice.priceId}
              planName={plan.name}
              className="w-full"
            />
          ) : (
            <Button className="w-full" asChild>
              <Link href="/login?redirect=/pricing">Sign in to Subscribe</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
