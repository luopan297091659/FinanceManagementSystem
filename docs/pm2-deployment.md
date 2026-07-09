# PM2 一体化部署

正式部署可以把前端和后端放在同一个 NestJS 服务里：

- 前端入口：`http://server:3000/`
- 静态资源：`http://server:3000/src/app.js`
- 后端 API：`http://server:3000/api/v1/*`
- PM2 进程：`finance-management`

## 启动流程

```powershell
npm --prefix backend install
npm run backend:prisma:generate
npm run backend:build
pm2 start ecosystem.config.cjs
pm2 save
```

## 常用维护命令

```powershell
pm2 status
pm2 logs finance-management
pm2 restart finance-management
pm2 stop finance-management
```

## 环境变量

生产环境至少需要配置：

```text
PORT=3000
DATABASE_URL=postgresql://finance:finance@localhost:5432/finance_management?schema=public
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=replace-with-production-secret
```

可以在服务器上复制 `backend/.env.example` 为 `backend/.env`，或直接通过 PM2/系统环境变量注入。

## 数据库迁移

首次部署或 schema 变更后执行：

```powershell
npm --prefix backend run prisma:migrate
npm --prefix backend run prisma:generate
npm --prefix backend run build
pm2 restart finance-management
```

## Nginx 可选

第一阶段可以直接访问 `:3000`。如果后续需要 HTTPS 或域名，再用 Nginx 反向代理到 `127.0.0.1:3000`。
