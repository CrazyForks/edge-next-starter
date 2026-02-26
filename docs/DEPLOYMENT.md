# Deployment Guide

This guide describes how to deploy to Cloudflare Workers test and production environments.

## 📋 Prerequisites

### 1. Cloudflare Account and API Token

1. Sign up for a [Cloudflare account](https://cloudflare.com)
2. Get the Account ID (right side of dashboard)
3. Visit [API Tokens](https://dash.cloudflare.com/profile/api-tokens) to create a token
4. Choose the "Edit Cloudflare Workers" template

### 2. Configure secrets

Secrets, env vars naming, and bindings are maintained in [Environment Config](./ENVIRONMENTS.md). Verify before deploying.

## ☁️ Create Cloudflare resources

### 🚨 Important: Ensure Resources Are Created Before First Deployment

Before using CI/CD automatic deployment or manual deployment, **you must first create Cloudflare resources (D1, R2, KV)**, otherwise deployment will fail.

Worker projects are automatically created on first `wrangler deploy` — no manual project creation is needed.

#### Verify Worker Deployment Status

```bash
# List all deployments
npx wrangler deployments list --config wrangler.test.toml
npx wrangler deployments list --config wrangler.prod.toml
```

### Other Cloudflare Resources

Commands, parameters, and `wrangler.*.toml` mapping for other resources (D1 database, R2 buckets, KV namespaces) are in [Quick Start](./QUICKSTART.md).

## 🗄️ Database migrations

```bash
# Test
pnpm run db:migrate:test

# Prod
pnpm run db:migrate:prod
```

## 🚀 Deployment

### Automatic (recommended)

**Test**: push to `develop` for auto deploy

```bash
git checkout develop
git add .
git commit -m "feat: your feature"
git push origin develop
```

**Prod**: push to `main` for auto deploy

```bash
git checkout main
git merge develop
git push origin main
```

### Manual

```bash
pnpm deploy              # Deploy to Cloudflare Workers
pnpm deploy:preview      # Deploy preview build
```

## 🔄 CI/CD

### Continuous Integration (all branches)

On push: tests → ESLint → type‑check → format check → build

### Auto‑deploy

- **Test**: `develop` or `preview` → test → migrate → deploy
- **Prod**: `main` → test → migrate → deploy → report

## 🌐 Custom Domains

1. Cloudflare Dashboard → Workers & Pages → select Worker → Settings → Domains & Routes
2. Add domain and configure DNS as prompted
3. SSL/TLS certificate is provided automatically

## 📊 Environment Variables

Use `wrangler secret put <KEY> --config wrangler.test.toml` for secret variables, or add non-sensitive variables in the `[vars]` section of `wrangler.*.toml`.

## 🔍 Monitoring & Logs

```bash
# List deployments
wrangler deployments list --config wrangler.test.toml

# Live logs
wrangler tail --config wrangler.test.toml
```

Analytics: Cloudflare Dashboard → Workers & Pages → select Worker → Analytics

## 🔙 Rollback

**Dashboard**: Workers & Pages → select Worker → Deployments → select previous version → Rollback

**CLI**:

```bash
wrangler deployments list --config wrangler.test.toml
wrangler rollback --config wrangler.test.toml
```

## 🐛 Troubleshooting

### Worker Deployment Failure

**Error message**: `Worker not found` or similar errors

**Cause**: Cloudflare resources (D1, R2, KV) not created or IDs misconfigured

**Solution**:

1. Ensure D1 databases, R2 buckets, and KV namespaces have been created
2. Ensure binding IDs in `wrangler.*.toml` match actual resources
3. Worker projects are auto-created on first deploy — no manual creation needed

### Analytics Engine Dataset Error

**Error message**: `Invalid dataset name: prod_analytics_dataset [code: 8000022]`

**Cause**: Analytics Engine is configured but the dataset hasn't been created yet

**Solution (choose one)**:

**Option 1: Use KV Fallback (Recommended, Quick Fix)**

Edit `wrangler.prod.toml`:

```toml
[vars]
ANALYTICS_SINK = "kv"  # Use KV storage for analytics data

# Comment out Analytics Engine binding
# [[analytics_engine_datasets]]
# binding = "ANALYTICS"
# dataset = "prod_analytics_dataset"
```

**Option 2: Create Analytics Engine Dataset**

```bash
# Create the dataset
npx wrangler analytics-engine create prod_analytics_dataset

# Verify
npx wrangler analytics-engine list
```

Then keep `ANALYTICS_SINK = "engine"` in `wrangler.prod.toml`.

### Build failures

Check CI logs and run locally:

```bash
pnpm test && pnpm run type-check && pnpm lint
```

### Database connection failures

Confirm:

1. Correct `database_id` in `wrangler.toml`
2. DB exists and migrations applied

### R2 storage issues

**Error: `Please enable R2 through the Cloudflare Dashboard`**

R2 must be manually enabled in Cloudflare Dashboard:

1. Visit [Cloudflare Dashboard](https://dash.cloudflare.com/) → Select account → R2
2. Click `Enable R2` or `Purchase R2` (10GB free tier available)
3. After enabling: `pnpm run r2:create:test` / `pnpm run r2:create:prod`

**Other issues**

Confirm bucket name, created status, and binding config are correct

### 404 after deployment

Confirm `main` in `wrangler.*.toml` points to the correct build output (`dist/server/index.js`) and `[assets]` has `directory = "dist/client"`

## ⚡ Performance

**Edge cache**: set `Cache-Control`
**KV cache**: use `withCache()`
**DB**: indexes, pagination, batch ops

See [Development Guide](./DEVELOPMENT.md) for details.

## 💰 Cost Management

### Free quotas

- D1: 5GB storage + 5M reads/day
- R2: 10GB storage (no egress fees)
- Workers: 100K free requests/day
- KV: 100K reads + 1K writes/day

Monitor usage in Cloudflare Dashboard

## 📝 Deployment Checklist

- [ ] Cloudflare Pages projects created (test/production environments)
- [ ] D1 databases created and configured in wrangler.toml
- [ ] R2 buckets created (requires R2 service enabled first)
- [ ] KV namespaces created and configured in wrangler.toml
- [ ] All tests pass
- [ ] Type‑check passes
- [ ] Env vars configured
- [ ] DB migrated
- [ ] GitHub secrets set (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)

## 🆘 FAQs

**How to switch environments?**
Push different branches: `develop` → test, `main` → prod

**How to trigger deployment manually?**
GitHub Actions → select workflow → Run workflow

**How to debug failed deployments?**
Review Actions logs; run the same build locally

**How to update DB schema?**
Create a new migration and commit; CI/CD runs it.

## 📚 References

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

**Deployed successfully!** 🎉
