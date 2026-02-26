# 部署指南

本指南介绍如何将应用部署到 Cloudflare Workers 的测试和生产环境。

## 📋 前置准备

### 1. Cloudflare 账户和 API Token

1. 注册 [Cloudflare 账户](https://cloudflare.com)
2. 获取 Account ID（仪表板右侧）
3. 访问 [API Tokens](https://dash.cloudflare.com/profile/api-tokens) 创建 Token
4. 选择 "Edit Cloudflare Workers" 模板

### 2. 配置密钥

Actions 所需的 Secrets、环境变量命名与绑定说明统一维护在 [环境配置说明](./ENVIRONMENTS-zh.md)，部署前请逐项核对。

## ☁️ 创建 Cloudflare 资源

### 🚨 重要：首次部署前确保资源已创建

在使用 CI/CD 自动部署或手动部署前，**必须先创建 Cloudflare 资源（D1、R2、KV）**，否则部署会失败。

Worker 项目会在首次 `wrangler deploy` 时自动创建，无需手动创建。

#### 验证 Worker 部署状态

```bash
# 列出所有 Workers
npx wrangler deployments list --config wrangler.test.toml
npx wrangler deployments list --config wrangler.prod.toml
```

### 其他 Cloudflare 资源

其他资源（D1 数据库、R2 存储桶、KV 命名空间）的创建命令、参数示例与 `wrangler.*.toml` 配置映射已集中在 [快速开始指南](../QUICKSTART-zh.md)。如需回顾脚本或环境差异，请以该文档为准。

## 🗄️ 数据库迁移

```bash
# 测试环境
pnpm run db:migrate:test

# 生产环境
pnpm run db:migrate:prod
```

## 🚀 部署方式

### 自动部署（推荐）

**测试环境**：推送到 `develop` 分支自动部署

```bash
git checkout develop
git add .
git commit -m "feat: your feature"
git push origin develop
```

**生产环境**：推送到 `main` 分支自动部署

```bash
git checkout main
git merge develop
git push origin main
```

### 手动部署

```bash
pnpm deploy              # 部署到 Cloudflare Workers
pnpm deploy:preview      # 部署预览版本
```

## 🔄 持续集成/部署

### 持续集成（所有分支）

每次 push 触发：测试 → ESLint → 类型检查 → 格式检查 → 构建

### 自动部署

- **测试环境**：`develop` 或 `preview` 分支 → 测试 → 迁移 → 部署
- **生产环境**：`main` 分支 → 测试 → 迁移 → 部署 → 报告

## 🌐 自定义域名

1. Cloudflare Dashboard → Workers & Pages → 选择 Worker → Settings → Domains & Routes
2. 添加自定义域名并按提示配置 DNS
3. SSL/TLS 证书自动提供

## 📊 环境变量

通过 `wrangler secret put <KEY> --config wrangler.test.toml` 设置密钥变量，或在 `wrangler.*.toml` 的 `[vars]` 中设置非敏感变量。

## 🔍 监控和日志

```bash
# 列出部署记录
wrangler deployments list --config wrangler.test.toml

# 实时日志
wrangler tail --config wrangler.test.toml
```

查看 Analytics：Cloudflare Dashboard → Workers & Pages → 选择 Worker → Analytics

## 🔙 回滚部署

**Dashboard 方式**：Workers & Pages → 选择 Worker → Deployments → 选择之前的版本 → Rollback

**命令行方式**：

```bash
wrangler deployments list --config wrangler.test.toml
wrangler rollback --config wrangler.test.toml
```

## 🐛 故障排查

### Worker 部署失败

**错误信息**：`Worker not found` 或类似错误

**原因**：Cloudflare 资源（D1、R2、KV）未创建或 ID 配置不正确

**解决方案**：

1. 确保 D1 数据库、R2 存储桶、KV 命名空间已创建
2. 确保 `wrangler.*.toml` 中的绑定 ID 与实际资源匹配
3. 首次部署时 Worker 会自动创建，无需手动创建 Worker 项目

### Analytics Engine Dataset 错误

**错误信息**：`Invalid dataset name: prod_analytics_dataset [code: 8000022]`

**原因**：配置文件中启用了 Analytics Engine，但对应的 dataset 还未创建

**解决方案（选择其一）**：

**方案一：使用 KV 替代（推荐，快速解决）**

编辑 `wrangler.prod.toml`：

```toml
[vars]
ANALYTICS_SINK = "kv"  # 使用 KV 存储分析数据

# 注释掉 Analytics Engine binding
# [[analytics_engine_datasets]]
# binding = "ANALYTICS"
# dataset = "prod_analytics_dataset"
```

**方案二：创建 Analytics Engine Dataset**

```bash
# 创建 dataset
npx wrangler analytics-engine create prod_analytics_dataset

# 验证
npx wrangler analytics-engine list
```

然后在 `wrangler.prod.toml` 中保持 `ANALYTICS_SINK = "engine"` 配置。

### 构建失败

检查 CI 日志并运行本地检查：

```bash
pnpm test && pnpm run type-check && pnpm lint
```

### 数据库连接失败

确认：

1. `wrangler.toml` 中 database_id 正确
2. 数据库已创建并执行迁移

### R2 存储问题

**错误：`Please enable R2 through the Cloudflare Dashboard`**

R2 服务需要在 Cloudflare Dashboard 中手动启用：

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 选择账户 → R2
2. 点击 `Enable R2` 或 `Purchase R2`（有 10GB 免费额度）
3. 启用后执行：`pnpm run r2:create:test` / `pnpm run r2:create:prod`

**其他问题**

确认 Bucket 名称、创建状态和绑定配置是否正确

### 部署后 404

确认 `wrangler.*.toml` 中 `main` 指向正确的构建产物 (`dist/server/index.js`)，且 `[assets]` 配置了 `directory = "dist/client"`

## ⚡ 性能优化

**Edge 缓存**：设置 `Cache-Control` 头
**KV 缓存**：使用 `withCache()` 包装器
**数据库优化**：添加索引、分页、批量操作

详细优化方法请查看 [开发指南](./DEVELOPMENT-zh.md)

## 💰 成本管理

### 免费额度

- D1：5GB 存储 + 500 万次读/天
- R2：10GB 存储（无出站费用）
- Workers：每日 10 万次免费请求
- KV：100K 次读 + 1K 次写/天

在 Cloudflare Dashboard 监控用量

## 📝 部署检查清单

- [ ] D1 数据库已创建并配置到 wrangler.\*.toml
- [ ] R2 存储桶已创建（需先启用 R2 服务）
- [ ] KV 命名空间已创建并配置到 wrangler.\*.toml
- [ ] 所有测试通过
- [ ] 类型检查通过
- [ ] 环境变量已配置
- [ ] 数据库已迁移
- [ ] GitHub 密钥已设置（CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID）

## 🆘 常见问题

**如何切换环境？**
通过不同分支触发：`develop` → 测试环境，`main` → 生产环境

**如何手动触发部署？**
GitHub Actions 页面 → 选择 workflow → Run workflow

**部署失败如何调试？**
查看 GitHub Actions 日志，本地运行相同的构建命令

**如何更新数据库 schema？**
创建新迁移文件并提交，CI/CD 会自动执行

## 📚 相关文档

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

**部署成功！** 🎉
