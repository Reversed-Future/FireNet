# 全球火灾检测与可视化平台 - 用户手册

## 目录

1. [系统概述](#1-系统概述)
2. [环境要求](#2-环境要求)
3. [安装与配置](#3-安装与配置)
4. [功能使用指南](#4-功能使用指南)
5. [API 接口文档](#5-api-接口文档)
6. [数据库架构](#6-数据库架构)
7. [故障排除](#7-故障排除)
8. [附录](#8-附录)

---

## 1. 系统概述

### 1.1 系统简介

**全球火灾检测与可视化平台**是一个基于 Web 的野火监测原型系统，用于实时监控、可视化展示、数据审核和风险区域管理。

### 1.2 技术架构

| 层级 | 技术栈 | 说明 |
|------|--------|------|
| 前端 | Next.js + React + Mapbox | 交互式地图可视化 |
| 后端 | Node.js + Express | RESTful API 服务 |
| 数据库 | PostgreSQL + PostGIS | 空间数据存储 |
| 数据源 | NASA FIRMS WFS | 卫星火灾检测数据 |
| 认证 | JWT | 无状态身份认证 |
| 实时通信 | WebSocket | 火灾事件实时通知 |

### 1.3 核心功能

- **实时火灾监控**：集成 NASA FIRMS 卫星数据，实时展示全球火灾点
- **交互式地图**：支持缩放、平移、筛选和详情查看
- **数据审核**：人工审核可疑火灾记录
- **风险区域管理**：自动/手动创建高风险区域
- **用户管理**：支持多角色用户注册和审批流程
- **数据备份**：支持数据导出和导入
- **质量统计**：提供数据导入质量和质量汇总

### 1.4 可用 CLI 命令

后端提供以下命令行工具（在 Backend 目录下执行）：

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（带热重载） |
| `npm run start` | 启动生产服务器 |
| `npm run build` | 编译 TypeScript 代码 |
| `npm run init-db` | 初始化数据库结构（首次部署） |
| `npm run migrate-db` | 增量数据库迁移（添加新字段） |
| `npm run migrate-passwords` | 迁移用户密码 |
| `npm run ingest-firms-wfs` | 从 NASA FIRMS WFS 导入单个区域/卫星数据 |
| `npm run bulk-ingest` | 批量导入所有区域/卫星数据 |
| `npm run preview-firms-wfs` | 预览 FIRMS WFS 数据（不写入数据库） |
| `npm run test` | 运行测试 |

---

## 2. 环境要求

### 2.1 硬件要求

| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 双核 2.0GHz | 四核 2.5GHz |
| 内存 | 4GB | 8GB |
| 存储 | 10GB 可用空间 | 20GB 可用空间 |

### 2.2 软件要求

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 18.x | 后端运行环境 |
| PostgreSQL | >= 15.x | 数据库服务 |
| PostGIS | >= 3.x | 空间扩展 |
| npm | >= 9.x | 包管理工具 |

### 2.3 外部依赖

| 服务 | 获取方式 | 用途 |
|------|----------|------|
| NASA FIRMS API Key | [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/) | 火灾数据获取 |
| Mapbox Access Token | [mapbox.com](https://www.mapbox.com/) | 地图渲染 |

---

## 3. 安装与配置

### 3.1 目录结构

```
GlobalFireFrontend/
├── Backend/                    # 后端服务
│   ├── src/                    # 源代码
│   │   ├── api/                # API 路由
│   │   ├── db/                 # 数据库相关
│   │   ├── ingestion/          # 数据导入
│   │   ├── repositories/       # 数据访问层
│   │   ├── services/           # 业务逻辑
│   │   ├── websocket/          # WebSocket 服务
│   │   ├── cli.ts              # CLI 入口
│   │   └── server.ts           # 服务器入口
│   ├── sql/                    # 数据库脚本
│   ├── .env.example            # 环境变量示例
│   └── package.json
├── Frontend/                   # 前端应用
│   ├── app/                    # Next.js 应用
│   ├── lib/                    # 工具函数
│   └── package.json
└── user_manual_zh.md           # 用户手册
```

### 3.2 后端安装

#### 3.2.1 安装依赖

```bash
cd Backend
npm install
```

#### 3.2.2 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```env
# 应用配置
APP_NAME=Firenet Data Backend
APP_ENV=development

# 数据库连接
DATABASE_URL=postgresql://firenet:firenet@localhost:5432/firenet

# CORS 配置（支持 JSON 数组或逗号分隔字符串）
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]

# NASA FIRMS WFS 配置（必需）
FIRMS_MAP_KEY=your-firms-api-key-here
FIRMS_WFS_REGION=SouthEast_Asia
FIRMS_WFS_TYPENAME=ms:fires_snpp_24hrs
FIRMS_WFS_BBOX=-90,-180,90,180
FIRMS_WFS_COUNT=1000

# 服务端口
PORT=8000

# JWT 配置（可选，有默认值）
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h

# 定时任务配置
SCHEDULER_ENABLED=false
SCHEDULER_INTERVAL_MINUTES=60
```

**配置说明**：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `APP_NAME` | 否 | Firenet Data Backend | 应用名称 |
| `APP_ENV` | 否 | development | 运行环境 |
| `DATABASE_URL` | 是 | - | PostgreSQL 连接字符串 |
| `CORS_ORIGINS` | 否 | localhost:3000,5173 | 允许的跨域来源 |
| `FIRMS_MAP_KEY` | 是 | - | NASA FIRMS API Key |
| `FIRMS_WFS_REGION` | 否 | SouthEast_Asia | 默认区域 |
| `FIRMS_WFS_TYPENAME` | 否 | ms:fires_snpp_24hrs | 默认数据类型 |
| `FIRMS_WFS_BBOX` | 否 | -90,-180,90,180 | 边界框 |
| `FIRMS_WFS_COUNT` | 否 | 1000 | 获取数量限制 |
| `PORT` | 否 | 8000 | 服务端口 |
| `JWT_SECRET` | 否 | global-fire-secret-key-change-in-production | JWT 密钥（生产环境必须修改） |
| `JWT_EXPIRES_IN` | 否 | 24h | Token 过期时间 |
| `SCHEDULER_ENABLED` | 否 | false | 是否启用定时任务 |
| `SCHEDULER_INTERVAL_MINUTES` | 否 | 60 | 定时任务间隔（分钟） |

#### 3.2.3 数据库初始化

**首次部署**（会清除现有数据）：

1. 创建数据库和用户：
```sql
CREATE USER firenet WITH PASSWORD 'firenet';
CREATE DATABASE firenet OWNER firenet;
```

2. 启用 PostGIS 扩展：
```sql
\c firenet
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

3. 初始化数据库结构：
```bash
npm run init-db
```

> **注意**：`init-db` 命令会执行 `sql/00_complete_schema.sql` 脚本，**会删除并重建所有表**。仅用于首次部署或完全重置。

**已有数据库升级**（保留数据，添加新字段）：

```bash
npm run migrate-db
```

> `migrate-db` 命令会添加新字段、索引，并更新现有数据。**不会删除任何数据**。

#### 3.2.4 启动后端服务

```bash
npm run dev
```

服务启动后访问：
- API 服务：`http://localhost:8000`
- 健康检查：`http://localhost:8000/health`
- Swagger 文档：`http://localhost:8000/docs`

### 3.3 前端安装

#### 3.3.1 安装依赖

```bash
cd Frontend
npm install
```

#### 3.3.2 配置环境变量

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 3.3.3 启动前端服务

```bash
npm run dev
```

前端服务启动后访问：`http://localhost:3000`

---

## 4. 功能使用指南

### 4.1 用户注册与登录

#### 4.1.1 创建账户

1. 访问 `http://localhost:3000/login`
2. 切换到「注册」标签
3. 输入用户名、密码和角色（`admin` 或 `user`）
4. 点击注册

#### 4.1.2 账户审批

新注册用户需要管理员审批后才能登录：

1. 使用管理员账户登录
2. 进入「管理」→「用户管理」
3. 查看待审批用户列表
4. 点击「批准」或「拒绝」

#### 4.1.3 登录系统

1. 访问登录页面
2. 输入用户名和密码
3. 点击登录

### 4.2 火灾数据查看

#### 4.2.1 地图视图

1. 点击「平台」菜单进入地图页面
2. 地图上显示火灾点标记（红色圆点）
3. 支持缩放、平移操作

#### 4.2.2 筛选功能

可通过以下条件筛选火灾数据：
- **时间窗口**：选择数据时间范围
- **卫星类型**：SNPP、NOAA20、NOAA21、MODIS
- **区域**：按地理区域筛选
- **置信度**：高/中/低
- **亮度**：温度范围

#### 4.2.3 查看详情

点击地图上的火灾标记，可查看：
- 坐标位置（纬度/经度）
- 区域名称
- 卫星类型
- 置信度等级
- 亮度值
- 探测时间

### 4.3 数据审核

#### 4.3.1 待审核列表

1. 进入「审核」→「待审批」页面
2. 查看待审核的火灾记录
3. 每条记录显示：ID、区域、卫星、坐标、置信度

#### 4.3.2 审核操作

- **批准**：标记记录为已审核并发布
- **拒绝**：标记记录为无效

#### 4.3.3 已审核记录

进入「审核」→「已发布」页面查看已批准的记录。

### 4.4 风险区域管理

#### 4.4.1 查看风险区域

1. 进入「管理」→「风险区域」页面
2. 查看所有已批准的风险区域
3. 地图上显示区域边界

#### 4.4.2 创建风险区域

1. 点击「创建区域」按钮
2. 填写区域信息：
   - 区域名称
   - 描述（可选）
   - 边界坐标（最小/最大经纬度）
   - 风险等级（高/中/低）
3. 点击提交

#### 4.4.3 区域审批

新创建的风险区域需要管理员审批后才能生效。

#### 4.4.4 自动计算风险区域

管理员可以使用自动计算功能根据历史火灾数据自动生成高风险区域。

### 4.5 数据备份与恢复

#### 4.5.1 导出数据

1. 进入「管理」→「数据管理」页面
2. 点击「导出数据」按钮
3. 系统自动下载 `fire-detection-backup-<timestamp>.json.gz` 文件

#### 4.5.2 导入数据

1. 进入「管理」→「数据管理」页面
2. 点击「选择文件」按钮
3. 选择导出的 JSON 或 JSON.GZ 文件
4. 点击「导入」按钮

---

## 5. API 接口文档

### 5.1 通用说明

- **基础 URL**：`http://localhost:8000`
- **认证方式**：JWT Token，通过 `Authorization: Bearer <token>` 头传递
- **响应格式**：所有接口返回 JSON，格式为 `{ code, message, data, ... }`
- **错误处理**：HTTP 状态码表示错误类别，`code` 字段为业务码

### 5.2 认证接口

#### 5.2.1 用户登录

- **路径**：`POST /api/auth/login`
- **请求体**：
```json
{
  "username": "string",
  "password": "string"
}
```
- **成功响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "jwt-token",
    "user": {
      "username": "admin",
      "role": "admin",
      "approvalStatus": "approved"
    }
  }
}
```

#### 5.2.2 获取日志列表

- **路径**：`GET /api/auth/logs`
- **说明**：获取系统操作日志（最近 1000 条）

#### 5.2.3 创建日志

- **路径**：`POST /api/auth/logs`
- **请求体**：
```json
{
  "username": "string",
  "action": "string",
  "targetType": "string",
  "targetId": "string",
  "targetDetails": {},
  "status": "string"
}
```

#### 5.2.4 获取管理员区域列表

- **路径**：`GET /api/auth/admin/regions`

### 5.3 火灾数据接口

#### 5.3.1 获取火灾列表

- **路径**：`GET /api/fires`
- **查询参数**：
  - `limit`: 每页数量（默认 100，最大 1000）
  - `offset`: 偏移量（默认 0）
  - `cursor`: 游标分页
  - `bbox`: 边界框（格式：minLon,minLat,maxLon,maxLat）
  - `sinceHours`: 最近小时数（1-720）
  - `reviewStatus`: 审核状态（pending/approved/dismissed/all）

- **成功响应**：
```json
{
  "code": 0,
  "message": "success",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "total": 1000,
  "limit": 100,
  "offset": 0,
  "cursor": null,
  "nextCursor": 100,
  "hasMore": true,
  "points": [...],
  "data": [...]
}
```

#### 5.3.2 获取火灾统计

- **路径**：`GET /api/fires/stats`
- **成功响应**：
```json
{
  "code": 0,
  "message": "success",
  "total": 1000,
  "latestId": 1000
}
```

#### 5.3.3 获取已批准风险区域

- **路径**：`GET /api/fires/zones`
- **说明**：仅返回 `approval_status = 'approved'` 的区域

#### 5.3.4 获取单个火灾详情

- **路径**：`GET /api/fires/{fireId}`
- **成功响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {...},
  "detectedSource": "firms_wfs",
  "nearbySources": [...]
}
```

#### 5.3.5 批量导入火灾数据

- **路径**：`POST /api/fires/bulk-ingest`
- **查询参数**：
  - `dryRun`: 是否模拟运行（默认 false）
  - `regions`: 区域列表（逗号分隔）
  - `satellites`: 卫星列表（逗号分隔）
- **注意**：需要配置 `FIRMS_MAP_KEY`

#### 5.3.6 审核火灾记录

- **路径**：`PATCH /api/fires/{fireId}/review`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **请求体**：
```json
{
  "reviewStatus": "approved",
  "published": true
}
```
- **成功响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 1,
    "reviewStatus": "approved",
    "published": true
  }
}
```

### 5.4 风险区域接口

#### 5.4.1 获取已批准风险区域（公开）

- **路径**：`GET /api/fires/zones`
- **说明**：仅返回已批准的区域，供地图展示使用

### 5.5 数据导入接口

#### 5.5.1 获取导入运行记录

- **路径**：`GET /api/ingestion/runs`
- **查询参数**：
  - `limit`: 数量限制（1-100，默认 20）

#### 5.5.2 从 FIRMS WFS 导入

- **路径**：`POST /api/ingestion/firms-wfs`
- **查询参数**：
  - `map_key`: FIRMS API Key（可选，默认使用环境变量）
  - `region`: 区域名称
  - `typename`: 数据类型
  - `bbox`: 边界框
  - `count`: 数量限制
  - `dry_run`: 是否模拟运行

- **成功响应**：
```json
{
  "id": 1,
  "source": "firms_wfs:SouthEast_Asia:ms:fires_snpp_24hrs",
  "status": "success",
  "startedAt": "2024-01-01T00:00:00.000Z",
  "finishedAt": "2024-01-01T00:00:05.000Z",
  "fetchedCount": 100,
  "insertedCount": 80,
  "updatedCount": 20,
  "rejectedCount": 0,
  "errorMessage": null,
  "notes": null
}
```

### 5.6 质量统计接口

#### 5.6.1 获取数据质量汇总

- **路径**：`GET /api/quality/summary`
- **说明**：返回 `fire_quality_summary` 视图数据及最近 5 次导入记录

### 5.7 管理接口

#### 5.7.1 用户管理

##### 用户注册

- **路径**：`POST /api/manage/users/register`
- **请求体**：
```json
{
  "username": "string",
  "password": "string",
  "role": "admin|user"
}
```

##### 获取所有用户

- **路径**：`GET /api/manage/users`
- **请求头**：`Authorization: Bearer <token>`

##### 获取待审批用户

- **路径**：`GET /api/manage/users/pending`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）

##### 批准用户

- **路径**：`POST /api/manage/users/{username}/approve`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **请求体**：
```json
{
  "comment": "string"
}
```

##### 拒绝用户

- **路径**：`POST /api/manage/users/{username}/reject`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **请求体**：
```json
{
  "comment": "string"
}
```

##### 删除用户

- **路径**：`DELETE /api/manage/users/{username}`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）

#### 5.7.2 区域管理

##### 获取所有区域

- **路径**：`GET /api/manage/zones`

##### 获取待审批区域

- **路径**：`GET /api/manage/zones/pending`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）

##### 创建区域

- **路径**：`POST /api/manage/zones`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **请求体**：
```json
{
  "zoneId": "string",
  "name": "string",
  "description": "string",
  "minLatitude": 0,
  "maxLatitude": 0,
  "minLongitude": 0,
  "maxLongitude": 0,
  "polygonCoords": "string",
  "riskLevel": "low|medium|high",
  "historicalIncidents": 0
}
```

##### 批准区域

- **路径**：`POST /api/manage/zones/{zoneId}/approve`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）

##### 拒绝区域

- **路径**：`POST /api/manage/zones/{zoneId}/reject`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）

##### 删除区域

- **路径**：`DELETE /api/manage/zones/{zoneId}`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）

#### 5.7.3 自动计算风险区域

##### 计算预览

- **路径**：`POST /api/manage/regions/auto-calculate`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **请求体**：
```json
{
  "sinceHours": 168
}
```
- **说明**：根据历史火灾数据计算高风险区域（不保存）

##### 同步到数据库

- **路径**：`POST /api/manage/regions/sync`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **请求体**：
```json
{
  "sinceHours": 168
}
```
- **说明**：将计算结果同步到数据库

#### 5.7.4 数据备份与恢复

##### 导出数据

- **路径**：`GET /api/manage/export`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **响应**：下载 JSON.GZ 文件
- **文件名格式**：`fire-detection-backup-<timestamp>.json.gz`

##### 导入数据

- **路径**：`POST /api/manage/import`
- **请求头**：`Authorization: Bearer <token>`（需要管理员权限）
- **请求体**：导出的备份数据（JSON 格式）

### 5.8 WebSocket 接口

#### 5.8.1 连接地址

```
ws://localhost:8000/ws
```

#### 5.8.2 事件类型

| 事件名 | 说明 | 数据格式 |
|--------|------|----------|
| `fireEventReviewed` | 火灾记录被审核 | `{ fireId: string }` |
| `fireEventApproved` | 火灾记录被批准 | `{ id, latitude, longitude, level, locationName }` |
| `fireEventsUpdated` | 火灾数据批量更新 | - |
| `zoneApproved` | 区域被批准 | `{ zoneId, name, ..., approvedBy, approvedAt }` |

### 5.9 错误码说明

| HTTP 状态码 | code | 说明 |
|-------------|------|------|
| 200 | 0 | 成功 |
| 400 | 400 | 请求参数错误 |
| 403 | 403 | 权限不足 |
| 404 | 404 | 资源不存在 |
| 409 | 409 | 资源冲突（如用户名已存在） |
| 422 | 422 | 参数验证失败 |
| 500 | 500 | 服务器内部错误 |

---

## 6. 数据库架构

### 6.1 核心数据表

#### 6.1.1 fire_events（火灾事件表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| source | VARCHAR(80) | 数据源 |
| source_event_id | VARCHAR(120) | 源事件ID |
| latitude | DOUBLE PRECISION | 纬度 |
| longitude | DOUBLE PRECISION | 经度 |
| geom | GEOMETRY(Point, 4326) | 空间几何对象 |
| level | VARCHAR(10) | 风险等级（HIGH/MEDIUM/LOW） |
| intensity_value | DOUBLE PRECISION | 强度数值 |
| intensity_text | VARCHAR(40) | 强度文本 |
| confidence | INTEGER | 置信度（0-100） |
| brightness | DOUBLE PRECISION | 亮度 |
| brightness_t31 | DOUBLE PRECISION | 温度亮度 |
| frp | DOUBLE PRECISION | 火灾辐射功率 |
| satellite_type | VARCHAR(100) | 卫星类型 |
| region | VARCHAR(100) | 区域 |
| acq_date | DATE | 获取日期 |
| acq_time | TIME | 获取时间 |
| acq_datetime | TIMESTAMPTZ | 获取时间戳 |
| unique_key | VARCHAR(200) | 唯一键（用于去重） |
| review_status | VARCHAR | 审核状态（pending/approved/dismissed） |
| published | BOOLEAN | 是否已发布 |
| approved_by | VARCHAR | 审批人 |
| approved_at | TIMESTAMP | 审批时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### 6.1.2 users（用户表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键 |
| username | VARCHAR | 用户名 |
| password_hash | VARCHAR | 密码哈希 |
| role | VARCHAR | 角色（admin/user） |
| approval_status | VARCHAR | 审批状态（pending/approved/rejected） |
| last_login_at | TIMESTAMP | 最后登录时间 |
| created_at | TIMESTAMP | 创建时间 |

#### 6.1.3 high_risk_zones（高风险区域表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| zone_id | VARCHAR | 区域ID |
| name | VARCHAR | 区域名称 |
| description | TEXT | 描述 |
| min_latitude | FLOAT | 最小纬度 |
| max_latitude | FLOAT | 最大纬度 |
| min_longitude | FLOAT | 最小经度 |
| max_longitude | FLOAT | 最大经度 |
| polygon_coords | TEXT | 多边形坐标 |
| center_latitude | FLOAT | 中心纬度 |
| center_longitude | FLOAT | 中心经度 |
| risk_level | VARCHAR | 风险等级 |
| historical_incidents | INTEGER | 历史事件数 |
| approval_status | VARCHAR | 审批状态 |
| is_active | BOOLEAN | 是否激活 |
| created_by | VARCHAR | 创建人 |
| last_seen_at | TIMESTAMP | 最后检测时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### 6.1.4 ingestion_runs（导入运行记录表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| source | VARCHAR(80) | 数据源 |
| status | VARCHAR(20) | 状态 |
| started_at | TIMESTAMPTZ | 开始时间 |
| finished_at | TIMESTAMPTZ | 结束时间 |
| fetched_count | INTEGER | 获取数量 |
| inserted_count | INTEGER | 插入数量 |
| updated_count | INTEGER | 更新数量 |
| rejected_count | INTEGER | 拒绝数量 |
| error_message | TEXT | 错误信息 |
| notes | JSONB | 备注 |

#### 6.1.5 system_logs（系统日志表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键 |
| log_type | VARCHAR | 日志类型（LOGIN/OPERATION） |
| operator | VARCHAR | 操作者 |
| action | VARCHAR | 操作 |
| status | VARCHAR | 状态 |
| target | VARCHAR | 目标 |
| details | JSONB | 详情 |
| created_at | TIMESTAMP | 创建时间 |

#### 6.1.6 user_tokens（用户令牌表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 用户ID |
| token | VARCHAR | Token |
| expires_at | TIMESTAMP | 过期时间 |
| created_at | TIMESTAMP | 创建时间 |

### 6.2 视图

#### 6.2.1 fire_quality_summary（火灾质量汇总视图）

提供数据质量统计信息，包括总数、按等级/区域/卫星分布等。

---

## 7. 故障排除

### 7.1 常见问题

#### 问题 1：数据库连接失败

**现象**：启动后端时显示数据库连接错误

**排查步骤**：
1. 确认 PostgreSQL 服务已启动
2. 检查 `.env` 中的 `DATABASE_URL` 是否正确
3. 确认数据库用户和密码正确
4. 确认数据库已创建并启用 PostGIS 扩展
5. 确认已执行 `npm run init-db` 初始化数据库结构

#### 问题 2：地图无法加载

**现象**：前端页面地图区域空白

**排查步骤**：
1. 确认 Mapbox Token 已正确配置（`NEXT_PUBLIC_MAPBOX_TOKEN`）
2. 检查浏览器控制台是否有错误
3. 确认网络连接正常

#### 问题 3：无法获取火灾数据

**现象**：API 返回空数据或错误

**排查步骤**：
1. 确认 `FIRMS_MAP_KEY` 已正确配置
2. 检查 API 调用是否返回错误
3. 确认已执行 `npm run ingest-firms-wfs` 或 `npm run bulk-ingest` 导入数据
4. 检查数据审核状态（默认只返回已批准的数据）

#### 问题 4：用户登录失败

**现象**：登录时提示"用户名或密码错误"

**排查步骤**：
1. 确认用户名和密码正确
2. 检查用户账户是否已被批准
3. 检查数据库中用户记录是否存在
4. 如果忘记密码，执行 `npm run migrate-passwords` 重置

#### 问题 5：JWT Token 过期

**现象**：API 返回 401 或 403 错误

**排查步骤**：
1. 重新登录获取新 Token
2. 检查 `JWT_EXPIRES_IN` 配置（默认 24h）
3. 生产环境必须修改 `JWT_SECRET` 为强密钥

### 7.2 日志查看

后端服务启动后，日志会输出到控制台：
- **访问日志**：记录所有 API 请求
- **错误日志**：记录异常信息
- **操作日志**：记录用户操作（存储在 `system_logs` 表）

### 7.3 数据库问题

#### 重新初始化数据库

```bash
npm run init-db
```

> 警告：此操作会删除所有现有数据！

#### 增量迁移数据库

```bash
npm run migrate-db
```

> 不会删除数据，仅添加新字段和索引。

---

## 8. 附录

### 8.1 支持的地理区域

| 区域代码 | 区域名称 |
|----------|----------|
| Africa | 非洲 |
| Alaska | 阿拉斯加 |
| Canada | 加拿大 |
| Central_America | 中美洲 |
| Europe | 欧洲 |
| Northern_and_Central_Africa | 北非和中非 |
| Russia_Asia | 俄罗斯亚洲部分 |
| South_America | 南美洲 |
| SouthEast_Asia | 东南亚 |
| South_Asia | 南亚 |
| USA_contiguous_and_Hawaii | 美国本土和夏威夷 |

### 8.2 支持的卫星数据类型

| 类型代码 | 说明 |
|----------|------|
| ms:fires_snpp_24hrs | Suomi NPP 卫星（24小时） |
| ms:fires_noaa20_24hrs | NOAA-20 卫星（24小时） |
| ms:fires_noaa21_24hrs | NOAA-21 卫星（24小时） |
| ms:fires_modis_24hrs | MODIS 卫星（24小时） |

### 8.3 术语表

| 术语 | 全称 | 说明 |
|------|------|------|
| FIRMS | Fire Information for Resource Management System | NASA 火灾信息管理系统 |
| WFS | Web Feature Service | 网络要素服务 |
| FRP | Fire Radiative Power | 火灾辐射功率 |
| JWT | JSON Web Token | 无状态认证令牌 |
| PostGIS | PostgreSQL GIS | PostgreSQL 空间扩展 |
| PostGIS Topology | PostGIS Topology | PostGIS 拓扑扩展 |
| CORS | Cross-Origin Resource Sharing | 跨域资源共享 |

### 8.4 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2024-01-01 | 初始版本 |
| 1.1.0 | 2026-06-08 | 补全 API 文档和数据库表结构，修正数据库初始化命令 |

---

**文档版本**: v1.1.0  
**最后更新**: 2026-06-08  
**适用系统**: Global Fire Detection & Visualization Platform