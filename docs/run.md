# 运行说明

本项目正式后端为 NestJS + PostgreSQL/PostGIS。Python `server.py` 仅保留为早期 SQLite 演示脚本，不再作为默认启动入口。

## 本地启动

1. 启动 PostgreSQL/PostGIS：

```powershell
docker compose -f backend/docker-compose.yml up -d postgres
```

2. 设置数据库连接：

```powershell
$env:DATABASE_URL="postgresql://finance:finance@localhost:5432/finance_management?schema=public"
```

3. 执行数据库迁移并生成 Prisma Client：

```powershell
npm.cmd run backend:prisma:deploy
npm.cmd run backend:prisma:generate
```

4. 启动 Nest 后端：

```powershell
npm.cmd run dev
```

浏览器访问：

```text
http://127.0.0.1:8006/
```

API 前缀：

```text
/api/v1
```

## 线上更新

```powershell
cd D:\PROJECT\FinanceManagementSystem
$env:DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public"
npm.cmd run backend:prisma:deploy
npm.cmd run backend:prisma:generate
npm.cmd run backend:build
pm2 restart finance-management --update-env
```

## 数据库检查

迁移后可执行：

```powershell
npm.cmd run backend:db:check
```

或访问：

```text
http://127.0.0.1:8006/api/v1/diagnostics
```

如果 `diagnostics.build` 不是 `customer-house-code-2026-07-10`，说明当前运行的服务仍是旧进程或旧部署目录。
