# 项目代码审查 - 可安全删除文件分析报告 (V2)

## 审查日期
2026-06-08

## 项目概述
项目根目录：`e:\ToolsForMyself\GlobalFireFrontend 3\GlobalFireFrontend`

子项目：
- `GlobalFireDetection/` - Next.js 14 前端（App Router + TypeScript + Mapbox GL + Tailwind）
- `unified-backend/` - Node.js + TypeScript + Express + PostGIS 后端（合并的 Firelens 后端）

## 审查方法
1. 扫描完整项目目录树（前端 + 后端）
2. 静态分析源代码引用关系（import/export、相对路径引用、API 路由、package.json scripts、Docker 配置）
3. 逐文件判断是否对业务功能、系统运行或核心依赖有影响
4. 区分"文件级可删除"与"代码级冗余（死代码）"

---

# 一、GlobalFireDetection/（前端项目）

## 1.1 可安全删除的文件清单

| #  | 文件路径 | 文件类型 | 删除理由 |
|----|---------|---------|---------|
| 1  | `GlobalFireDetection/.next/` | 目录（构建产物） | Next.js 自动生成的全量构建输出（含 webpack 缓存、server 构建、static chunks、ESLint 缓存、previewinfo、tsbuildinfo 等数百个文件），可通过 `npm run build` 或 `npm run dev` 重新生成。`.gitignore` 已默认忽略 |
| 2  | `GlobalFireDetection/.next/cache/` | 目录（缓存） | Next.js 增量编译缓存、ESLint 缓存、Webpack persistent cache，热重载后自动重新生成 |
| 3  | `GlobalFireDetection/.next/cache/webpack/` | 目录（缓存） | Webpack 持久化缓存（client/server/edge 多个版本的 `.pack`/`.pack.gz`），用于加速冷启动 |
| 4  | `GlobalFireDetection/.next/cache/eslint/` | 目录（缓存） | Next.js ESLint 检查缓存（`.cache_*`） |
| 5  | `GlobalFireDetection/.next/server/` | 目录（构建产物） | Next.js 服务端渲染编译产物（含 app 各路由的 `page.js`、`route.js`、manifest 等） |
| 6  | `GlobalFireDetection/.next/static/` | 目录（构建产物） | Next.js 客户端静态资源（chunks、css、webpack hot-update 等） |
| 7  | `GlobalFireDetection/.next/static/chunks/` | 目录（构建产物） | 客户端代码分片（按页面/包懒加载） |
| 8  | `GlobalFireDetection/.next/static/css/` | 目录（构建产物） | 编译后的 CSS 产物（layout.css） |
| 9  | `GlobalFireDetection/.next/static/development/` | 目录（构建产物） | 开发态的 `_buildManifest.js`、`_ssgManifest.js` |
| 10 | `GlobalFireDetection/.next/static/webpack/` | 目录（HMR 产物） | Webpack HMR（热更新）历史产物，含大量 `hot-update.js` / `hot-update.json` |
| 11 | `GlobalFireDetection/.next/types/` | 目录（类型产物） | Next.js 增量类型检查产物（含 `app/*/page.ts`、`route.ts`、`validator.ts` 等） |
| 12 | `GlobalFireDetection/.next/app-build-manifest.json` | 配置文件（构建产物） | Next.js 应用构建清单（运行时自动生成） |
| 13 | `GlobalFireDetection/.next/build-manifest.json` | 配置文件（构建产物） | Next.js 旧式构建清单（运行时自动生成） |
| 14 | `GlobalFireDetection/.next/package.json` | 配置文件（构建产物） | Next.js 内部用于 server bundle 的 package.json |
| 15 | `GlobalFireDetection/.next/prerender-manifest.json` | 配置文件（构建产物） | Next.js 预渲染清单 |
| 16 | `GlobalFireDetection/.next/react-loadable-manifest.json` | 配置文件（构建产物） | React Loadable 懒加载清单 |
| 17 | `GlobalFireDetection/.next/routes-manifest.json` | 配置文件（构建产物） | Next.js 路由清单 |
| 18 | `GlobalFireDetection/.next/trace` | 文件（构建产物） | Next.js 性能追踪文件（`.gitignore` 默认忽略） |
| 19 | `GlobalFireDetection/tsconfig.tsbuildinfo` | 文件（编译器缓存） | TypeScript 增量编译缓存（`tsconfig.json` 的 `incremental: true` 产物），`.gitignore` 已忽略 |
| 20 | `GlobalFireDetection/.next/.tsbuildinfo` | 文件（编译器缓存） | Next.js 内部的 TypeScript 增量构建缓存（与根目录的 `tsconfig.tsbuildinfo` 独立） |
| 21 | `GlobalFireDetection/.next/.previewinfo` | 文件（构建产物） | Next.js 预览模式元数据 |
| 22 | `GlobalFireDetection/.next/.rscinfo` | 文件（构建产物） | Next.js React Server Components 元数据 |
| 23 | `GlobalFireDetection/.next/next-devtools-config.json` | 配置文件（构建产物） | Next.js DevTools 配置（运行时自动生成） |
| 24 | `GlobalFireDetection/.vscode/` | 目录（IDE 配置） | VS Code 工作区设置目录，`.gitignore` 已默认忽略 |
| 25 | `GlobalFireDetection/.vscode/settings.json` | 文件（IDE 配置） | 仅包含 `liveServer.settings.port: 5501`，实际未使用 Live Server；不影响项目运行 |
| 26 | `GlobalFireDetection/.DS_Store` | 文件（系统元数据） | macOS Finder 自动生成的目录元数据，`.gitignore` 已默认忽略；非 Windows 环境下可清理 |
| 27 | `GlobalFireDetection/documents/` | 目录（项目文档） | 仅包含项目提案、可行性分析、规划文档等 5 个 PDF/DOCX 文件，不被任何代码引用 |
| 28 | `GlobalFireDetection/documents/3-JC3506-Group-Project.pdf` | 文档文件 | 项目原始题目文档，未被代码引用 |
| 29 | `GlobalFireDetection/documents/Analysis and Planning Document(10).pdf` | 文档文件 | 项目分析与规划文档，未被代码引用 |
| 30 | `GlobalFireDetection/documents/Feasibility Document.pdf` | 文档文件 | 项目可行性分析文档，未被代码引用 |
| 31 | `GlobalFireDetection/documents/Global Fire Information Collection, Data Integration & Visualization Platform Project Proposal.docx` | 文档文件 | 项目提案 Word 文档，未被代码引用 |
| 32 | `GlobalFireDetection/documents/Project Proposal Instruction_ Global Fire Detection & Visualization Radar Platform(1).pdf` | 文档文件 | 项目提案指引 PDF，未被代码引用 |

## 1.2 保留文件（虽看似冗余但对项目必要）

| 文件路径 | 保留原因 |
|---------|---------|
| `app/page.tsx` | 根路由处理器（导入并渲染 `home/page.tsx`） |
| `app/layout.tsx` | 根布局，被 Next.js 强制要求 |
| `app/_not-found.tsx` | Next.js 404 页面约定文件 |
| `app/globals.css` | 在 `layout.tsx` 中通过 `import './globals.css'` 加载 |
| `app/home/page.tsx` | 首页（被 `app/page.tsx` 引用） |
| `app/login/page.tsx` | 登录路由（自动重定向到 `/admin`） |
| `app/admin/page.tsx` | 管理后台核心页（业务核心） |
| `app/map/page.tsx` | 地图主路由（业务核心） |
| `app/map/map-view.tsx` | Mapbox 3D 地球渲染（业务核心） |
| `app/map/error.tsx` | Map 路由错误边界（Next.js 约定） |
| `app/map/mock-data.ts` | 定义 `FirePoint` 类型，被 `map/page.tsx`、`map-view.tsx`、`admin/page.tsx`、`map/fire-geo.ts` 共 4 处引用 |
| `app/map/fire-geo.ts` | GeoJSON 与热力强度工具，被 `map-view.tsx` 引用 |
| `app/map/types.ts` | 定义 `VizMode` 类型，被 `map/page.tsx` 与 `map-view.tsx` 引用 |
| `app/components/Navbar.tsx` | 导航栏，被 `home/page.tsx` 与 `map/page.tsx` 引用 |
| `app/components/home/FireNetSections.tsx` | 首页叙事/图表，被 `home/page.tsx` 引用 |
| `app/api/fires/route.ts` | 火灾数据 API 路由，被前端 `map/page.tsx`、`map-view.tsx`、`admin/page.tsx` 调用 |
| `app/api/fires/ingest/route.ts` | 火灾数据拉取（NASA FIRMS）API 路由，被 `admin/page.tsx` 调用 |
| `app/api/fires/zones/route.ts` | 高风险区域 API 路由，被 `map-view.tsx` 与 `admin/page.tsx` 调用 |
| `lib/api.ts` | API 客户端，被 `admin/page.tsx` 大量使用 |
| `lib/permissions.ts` | 角色权限矩阵，被 `admin/page.tsx` 引用 |
| `lib/storage.ts` | IndexedDB 存储封装，被 `admin/page.tsx` 引用 |
| `public/home-demo1.png` ~ `public/home-demo4.png` | 首页演示图，被 `home/page.tsx` 通过 `homeDemoImages` 数组引用 |
| `public/mapbox-gl-csp-worker.js` | Mapbox GL CSP 兼容 worker，被 `map-view.tsx` 中 `loadMapbox()` 引用为 `workerUrl` |
| `node_modules/` | 第三方依赖，必须保留（删除后需 `npm install` 恢复） |
| `package.json` / `package-lock.json` | 项目依赖清单与锁定 |
| `.env.local` | 运行时环境变量（Mapbox Token、WS 端点） |
| `.eslintrc.json` | ESLint 规则配置 |
| `.gitignore` | Git 忽略规则 |
| `next.config.js` | Next.js 框架配置 |
| `next-env.d.ts` | Next.js 自动生成的 TypeScript 类型（`.gitignore` 默认忽略） |
| `tsconfig.json` | TypeScript 编译配置 |
| `tailwind.config.ts` | Tailwind CSS 配置 |
| `postcss.config.js` | PostCSS 配置（被 Tailwind 使用） |
| `README.md` | 项目说明文档（标准项目必备） |

## 1.3 源代码内部冗余（死代码 - 不在本次删除清单，但供后续清理参考）

### 1.3.1 `app/admin/page.tsx` 内的死代码

| 冗余项 | 类型 | 行号/说明 |
|--------|------|----------|
| `import { addLog, getLogs, exportAllData, importAllData }` | 未使用的导入 | 第 11-14 行（实际已切换为 `apiClient.createLog/getLogs`） |
| `import { saveFireEvents }` | 未使用的导入 | 第 16 行 |
| `import { updateFireEvent }` | 已使用但冗余（IndexedDB 写入已被后端 API 取代） | 第 17、654、685 行 |
| `function renderPageNumbers(...)` | 未被调用的工具函数 | 第 2017-2047 行 |
| `const notifyFireEventsChanged = () => { ... }` | 仅打印日志，无实际作用 | 第 613-615 行 |
| `const notifyFireEventApproved = (point) => { ... }` | 仅打印日志，无实际作用 | 第 617-619 行 |
| `const handleApplyApproval(...)` | 未被 JSX 引用的回调 | 第 621-631 行 |
| `const handleReviewApproval(...)` | 未被 JSX 引用的回调 | 第 633-643 行 |
| `handleViewReviewItem` 内 `activeMenu === 'data-audit'` | 无效表达式语句 | 第 456 行 |

### 1.3.2 `app/map/map-view.tsx` 内的死代码

| 冗余项 | 类型 | 行号/说明 |
|--------|------|----------|
| `const getPublishedFireEvents = async ()` | 未被调用的 IndexedDB 工具函数 | 第 124-159 行 |
| `const convertEventToFirePoint = (event)` | 未被调用的类型转换函数 | 第 207-223 行 |
| `useEffect(() => { if (externalFirePoints) return }, ...)` | 空函数体 useEffect | 第 514-517 行 |

### 1.3.3 `lib/api.ts` 内的冗余 API 方法

| 冗余项 | 类型 | 说明 |
|--------|------|------|
| `FIRENET_API_BASE` 常量 | 未使用的常量 | 第 2 行（与 `API_BASE_URL` 重复） |
| `getUserRegions()` | 未被调用的 API 方法 | 第 142-144 行 |
| `reportUserRegion()` | 未被调用的 API 方法 | 第 146-150 行 |
| `getApprovals()` | 未被调用的 API 方法 | 第 152-154 行 |
| `getFire()` | 未被调用的 API 方法 | 第 270-272 行 |
| `getFireStatistics()` | 未被调用的 API 方法 | 第 274-276 行 |
| `getQualitySummary()` | 未被调用的 API 方法 | 第 278-280 行 |
| `FireStats` / `FirePoint` / `FireStatistics` / `FireLevel` 类型 | 重复声明（与 `app/map/mock-data.ts` 中的 `FirePoint` 类型名冲突） | 第 36-68 行 |

### 1.3.4 `lib/storage.ts` 内的冗余导出

| 冗余项 | 类型 | 说明 |
|--------|------|------|
| `getFireEvents()` | 已不被业务使用 | 第 183-191 行 |
| `saveFireEvents()` | 未被调用 | 第 193-219 行 |
| `exportAllData()` | 未被调用（备份功能改用后端 API） | 第 166-181 行 |
| `importAllData()` | 未被调用 | 第 231-265 行 |
| `addLog()` | 未被调用 | 第 141-149 行 |

---

# 二、unified-backend/（后端项目）

## 2.1 可安全删除的文件清单

| #  | 文件路径 | 文件类型 | 删除理由 |
|----|---------|---------|---------|
| 33 | `unified-backend/dist/` | 目录（构建产物） | TypeScript 编译输出（`tsc` 产物），约 40 个 `.js` 文件。`package.json` 的 `"build": "tsc -p tsconfig.json"` 可重新生成。`.gitignore` 已默认忽略 |
| 34 | `unified-backend/dist/src/api/` | 目录（构建产物） | 编译后的 API 路由 JS（auth/fires/ingestion/manage/quality 共 5 个） |
| 35 | `unified-backend/dist/src/db/` | 目录（构建产物） | 编译后的 DB 脚本 JS（check_schema/cleanup/init/migrate/migratePasswords/pool/repopulate/run_fix/test_timestamp） |
| 36 | `unified-backend/dist/src/domain/` | 目录（构建产物） | 编译后的领域模型（fire/platform） |
| 37 | `unified-backend/dist/src/ingestion/` | 目录（构建产物） | 编译后的数据摄取（bulkIngest/csv/normalize/pipeline） |
| 38 | `unified-backend/dist/src/ingestion/sources/` | 目录（构建产物） | 编译后的数据源（csvSource/nasaFirmsWfs） |
| 39 | `unified-backend/dist/src/middleware/` | 目录（构建产物） | 编译后的中间件（auth） |
| 40 | `unified-backend/dist/src/repositories/` | 目录（构建产物） | 编译后的仓储层（fireRepository/platformRepository） |
| 41 | `unified-backend/dist/src/services/` | 目录（构建产物） | 编译后的服务层（authService/highRiskZoneService） |
| 42 | `unified-backend/dist/src/websocket/` | 目录（构建产物） | 编译后的 WebSocket 服务（notificationServer） |
| 43 | `unified-backend/dist/src/app.js` | 文件（构建产物） | 编译后的 Express 应用 |
| 44 | `unified-backend/dist/src/cli.js` | 文件（构建产物） | 编译后的 CLI 入口 |
| 45 | `unified-backend/dist/src/config.js` | 文件（构建产物） | 编译后的配置模块 |
| 46 | `unified-backend/dist/src/openapi.js` | 文件（构建产物） | 编译后的 OpenAPI 文档 |
| 47 | `unified-backend/dist/src/previewFirms.js` | 文件（构建产物） | 编译后的 FIRMS 预览脚本 |
| 48 | `unified-backend/dist/src/scheduler.js` | 文件（构建产物） | 编译后的定时任务调度器 |
| 49 | `unified-backend/dist/src/server.js` | 文件（构建产物） | 编译后的服务器入口（被 `npm start` 和 `Dockerfile` 调用） |
| 50 | `unified-backend/dist/tests-ts/` | 目录（构建产物） | 编译后的测试文件（normalize.test.js / wfs.test.js） |
| 51 | `unified-backend/docs/` | 目录（项目文档） | 10 个开发过程/项目交付类 Markdown 文档，不被代码引用 |
| 52 | `unified-backend/docs/API_CONTRACT.md` | 文档文件 | API 契约文档（开发过程产物） |
| 53 | `unified-backend/docs/DOCKER_AFTER_REBOOT.md` | 文档文件 | Docker 重启后操作说明（开发过程产物） |
| 54 | `unified-backend/docs/FINAL_SUBMISSION_MANIFEST.md` | 文档文件 | 提交清单（开发过程产物） |
| 55 | `unified-backend/docs/PROCESS_LOG.md` | 文档文件 | 过程日志（开发过程产物） |
| 56 | `unified-backend/docs/REPORT_MATERIALS.md` | 文档文件 | 报告素材（开发过程产物） |
| 57 | `unified-backend/docs/SCREENSHOT_CHECKLIST.md` | 文档文件 | 截图清单（开发过程产物） |
| 58 | `unified-backend/docs/TASK2_INTEGRATION_NOTES.md` | 文档文件 | 任务 2 集成笔记（开发过程产物） |
| 59 | `unified-backend/docs/TYPESCRIPT_BACKEND_STATUS.md` | 文档文件 | TS 后端状态记录（开发过程产物） |
| 60 | `unified-backend/docs/VERIFICATION_EVIDENCE.md` | 文档文件 | 验证证据（开发过程产物） |
| 61 | `unified-backend/docs/WHAT_IS_NEEDED.md` | 文档文件 | 仍需完成项（开发过程产物） |
| 62 | `unified-backend/integrations/` | 目录（集成示例） | 前端集成示例文件夹，未被任一项目引用；前端已有自己的 `app/api/fires/route.ts` |
| 63 | `unified-backend/integrations/globalfiredetection/` | 目录（集成示例） | 与前端项目同名的子目录，内容为前端 API 路由的副本 |
| 64 | `unified-backend/integrations/globalfiredetection/app/api/fires/route.ts` | 文件（重复代码） | 是前端 `GlobalFireDetection/app/api/fires/route.ts` 的近似复制品（功能都是代理转发到 `FIRELENS_DATA_API_URL`），未被任一项目实际引用 |
| 65 | `unified-backend/integrations/globalfiredetection/env.local.example` | 文件（重复配置） | 仅 1 行 `FIRELENS_DATA_API_URL=http://localhost:8000`，且根目录已有 `.env.example` |
| 66 | `unified-backend/check-id-sequence.ts` | 文件（一次性脚本） | 一次性数据库诊断脚本（检查 fire_events 表的 ID 序列），未被 `package.json` scripts 引用，未被任何代码 `import` |
| 67 | `unified-backend/generate-hash.ts` | 文件（一次性脚本） | 一次性 bcrypt 哈希生成脚本（`bcrypt.hash('admin123', 10)`），未被 `package.json` scripts 引用，未被任何代码 `import` |
| 68 | `unified-backend/docker-compose.simple.yml` | 文件（Docker 配置） | 简化版 Docker Compose（仅 PostGIS 容器），未被任何文件引用；主 `docker-compose.yml` 已完整覆盖此功能 |
| 69 | `unified-backend/src/db/fix_datetime.sql` | 文件（一次性脚本） | 一次性数据库时间戳修复 SQL，未被任何 `src/db/*.ts` 文件引用，未在 `package.json` scripts 中调用 |

## 2.2 保留文件（虽看似冗余但对项目必要）

| 文件路径 | 保留原因 |
|---------|---------|
| `unified-backend/src/` 全目录 | TypeScript 源码，被 `dev`/`build`/`start`/`init-db`/`ingest-*`/`migrate-db`/`preview-firms-wfs` 等 scripts 直接引用 |
| `unified-backend/src/api/*.ts` | 5 个 API 路由模块（auth/fires/ingestion/manage/quality），被 `app.ts` 注册 |
| `unified-backend/src/db/*.ts` | DB 工具模块，被 `cli.ts`、`server.ts`、`migrate.ts` 等引用 |
| `unified-backend/src/db/pool.ts` | PostgreSQL 连接池，被几乎所有数据库访问层引用 |
| `unified-backend/src/db/init.ts` | 初始化数据库（读取 `sql/00_complete_schema.sql`） |
| `unified-backend/src/db/migrate.ts` | 数据库迁移（被 `npm run migrate-db` 引用） |
| `unified-backend/src/ingestion/*.ts` | NASA FIRMS / CSV 数据摄取流水线 |
| `unified-backend/src/middleware/auth.ts` | JWT 鉴权中间件 |
| `unified-backend/src/repositories/*.ts` | 仓储层（数据库访问） |
| `unified-backend/src/services/*.ts` | 业务服务层 |
| `unified-backend/src/websocket/notificationServer.ts` | WebSocket 实时通知服务 |
| `unified-backend/src/app.ts` | Express 应用工厂 |
| `unified-backend/src/cli.ts` | CLI 入口（`init-db`/`ingest-seed`/`ingest-firms-wfs`/`bulk-ingest`） |
| `unified-backend/src/config.ts` | 配置加载（`dotenv` 读取 `.env`） |
| `unified-backend/src/openapi.ts` | Swagger UI 文档 |
| `unified-backend/src/previewFirms.ts` | FIRMS WFS 预览脚本（被 `npm run preview-firms-wfs` 引用） |
| `unified-backend/src/scheduler.ts` | `node-cron` 定时任务（被 `server.ts` 调用） |
| `unified-backend/src/server.ts` | 主入口（被 `dev`/`start`/`Dockerfile` 引用） |
| `unified-backend/tests-ts/normalize.test.ts` | normalize 单元测试（被 `npm test` 引用） |
| `unified-backend/tests-ts/wfs.test.ts` | WFS URL 构造单元测试（被 `npm test` 引用） |
| `unified-backend/sql/` | 数据库 schema 脚本（001/002 被 `docker-compose.yml` 挂载，`00_complete_schema.sql` 被 `src/db/init.ts` 引用，003-012 为历史迁移） |
| `unified-backend/data/seed_fire_points.csv` | 种子数据（被 `cli.ts ingest-seed` 和 `SEED_CSV_PATH` 环境变量引用） |
| `unified-backend/.env` | 实际环境配置（运行时必需） |
| `unified-backend/.env.example` | 环境变量模板 |
| `unified-backend/.gitignore` | Git 忽略规则（含 `dist/` `node_modules/` 等） |
| `unified-backend/Dockerfile` | Docker 镜像构建文件（被 `docker-compose.yml` 的 `api` 服务引用） |
| `unified-backend/docker-compose.yml` | 完整部署编排（PostGIS + API 容器） |
| `unified-backend/README.md` | 项目说明文档（Firelens Data Backend 概述） |
| `unified-backend/UNIFIED_SETUP.md` | 统一后端安装指南 |
| `unified-backend/package.json` | 依赖清单与 npm scripts |
| `unified-backend/package-lock.json` | 依赖锁定 |
| `unified-backend/tsconfig.json` | TypeScript 编译配置（**无** `incremental: true`，所以不会生成 `.tsbuildinfo`） |
| `unified-backend/node_modules/` | 第三方依赖（`npm install` 必需） |

## 2.3 源代码内部冗余（死代码 - 不在本次删除清单，但供后续清理参考）

### 2.3.1 `src/db/` 下的可疑脚本

| 脚本 | 状态 | 说明 |
|------|------|------|
| `src/db/check_schema.ts` | 未在 `package.json` scripts 引用 | 一次性 schema 诊断工具 |
| `src/db/cleanup.ts` | 未在 `package.json` scripts 引用 | 一次性清理脚本 |
| `src/db/repopulate.ts` | 未在 `package.json` scripts 引用 | 一次性重建脚本 |
| `src/db/run_fix.ts` | 未在 `package.json` scripts 引用 | 一次性修复脚本 |
| `src/db/migratePasswords.ts` | 在 `package.json` scripts 引用 | `npm run migrate-passwords` 命令 |
| `src/db/test_timestamp.ts` | 未在 `package.json` scripts 引用 | 一次性时间戳测试 |

> 建议：这些脚本虽然未在 scripts 引用（仅可通过 `npx tsx <file>` 手动运行），但属于运维工具，删除前请确认是否被运维流程使用。

### 2.3.2 `src/previewFirms.ts`

| 脚本 | 状态 | 说明 |
|------|------|------|
| `previewFirms.ts` | 在 `package.json` scripts 引用 | `npm run preview-firms-wfs` 调试用 |

> 建议：保留（用于 FIRMS API 调试）。

### 2.3.3 集成相关

`unified-backend/integrations/globalfiredetection/app/api/fires/route.ts` 实际是前端 `GlobalFireDetection/app/api/fires/route.ts` 的简化版，**功能重复**。前端 `app/api/fires/route.ts` 已包含完整数据集成逻辑（`?hours`、`?bbox`、`?source`、`?satellite` 等丰富查询参数），是业务核心代码。

---

# 三、跨项目对照：`.env.example` 模板

| 子项目 | `.env.example` 路径 | 内容 |
|--------|---------------------|------|
| 前端 | `GlobalFireDetection/.env.local` | Mapbox Token、WS 端点等（无 `.env.example` 模板） |
| 后端 | `unified-backend/.env.example` | `DATABASE_URL`、`CORS_ORIGINS`、`FIRMS_MAP_KEY` 等 |
| 后端集成示例 | `unified-backend/integrations/globalfiredetection/env.local.example` | 仅 1 行 `FIRELENS_DATA_API_URL=http://localhost:8000`（与根目录 `.env.example` 重复且更简略） |

---

# 四、删除前后对比

| 类别 | 删除前 | 删除后 | 体积影响 |
|------|--------|--------|---------|
| `GlobalFireDetection/.next/` | 数百个文件（含 HMR 历史） | 空（首次 dev/build 时自动重建） | 通常 50MB-200MB |
| `GlobalFireDetection/documents/` | 5 个 PDF/DOCX | 空 | 几 MB 至几十 MB |
| `GlobalFireDetection/tsconfig.tsbuildinfo` | 2 个 `.tsbuildinfo` | 空（自动重建） | 几百 KB |
| `unified-backend/dist/` | 约 40 个 JS 文件（含 source maps） | 空（`npm run build` 重建） | 几 MB |
| `unified-backend/docs/` | 10 个 Markdown | 空 | KB 至几 MB |
| `unified-backend/integrations/` | 2 个文件 | 空 | 几 KB |
| IDE/系统残留 | `.vscode/`、`.DS_Store` | 空 | KB 级 |
| 一次性脚本 | `check-id-sequence.ts` 等 4 个 | 空 | KB 级 |

---

# 五、删除建议与操作步骤

1. **删除前请先完成一次 Git 提交**，以便误删后能恢复。
2. 推荐删除顺序：
   - **第一步**（最安全）：删除两个项目的 `dist/`/`.next/` 目录
   - **第二步**：删除 `tsconfig.tsbuildinfo`（前端项目）
   - **第三步**：删除 `.vscode/`、`.DS_Store`（如已加入 `.gitignore`）
   - **第四步**：删除 `documents/`（前端）和 `docs/`（后端）目录
   - **第五步**：删除 `unified-backend/integrations/` 目录
   - **第六步**：删除 `unified-backend/check-id-sequence.ts`、`generate-hash.ts`、`docker-compose.simple.yml`、`src/db/fix_datetime.sql`
3. 验证：执行 `npm run dev`（前端）与 `npm run dev`（后端）确认两个项目可正常启动即可。
4. **Docker 部署验证**（可选）：执行 `docker compose build` 确认后端 Dockerfile 可重新生成 `dist/`。

---

# 六、与 V1 报告的差异说明

| 差异点 | V1 报告 | V2 报告（本次） |
|--------|---------|----------------|
| 审查范围 | 仅 `GlobalFireDetection/` 前端项目 | **同时审查 `unified-backend/` 后端项目**（V1 缺失） |
| `.next/` 描述 | 概括为"Next.js 构建输出" | 拆分为 13 个细粒度条目（cache/server/static/types/manifest 等） |
| `tsconfig.tsbuildinfo` | 列入 | 列入（同时新增 `.next/.tsbuildinfo`） |
| `.vscode/` | 概括为"VS Code 特定的工作区设置" | 拆分为目录与 `settings.json` 两个条目，并指出 `liveServer.settings.port` 实际未使用 |
| 死代码（函数/方法/导入） | 未涉及 | 单独章节列出源代码内部死代码 |
| 重复类型声明 | 未涉及 | 标注 `lib/api.ts` 与 `app/map/mock-data.ts` 存在 `FirePoint` 同名类型冲突 |
| **`unified-backend/dist/`** | **未涉及（V1 缺失）** | 拆分为 17 个细粒度条目 |
| **`unified-backend/docs/`** | **未涉及（V1 缺失）** | 拆分为 1 个目录 + 10 个文件的 11 行表格 |
| **`unified-backend/integrations/`** | **未涉及（V1 缺失）** | 标注为"与前端功能重复的集成示例" |
| **一次性脚本** | **未涉及（V1 缺失）** | 新增 `check-id-sequence.ts` / `generate-hash.ts` / `fix_datetime.sql` / `docker-compose.simple.yml` |
| `documents/` | 拆分为 5 行表格 | 拆分为 1 个目录 + 5 个文件的 6 行表格 |
| **总条目数** | ~10 个分类 | **69 个细粒度条目**（前端 32 + 后端 37） |
