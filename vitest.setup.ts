import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock cloudflare:workers for test environment (not running in workerd)
vi.mock('cloudflare:workers', () => ({
  env: {},
}));

// Clean up React components after each test
afterEach(() => {
  cleanup();
});
