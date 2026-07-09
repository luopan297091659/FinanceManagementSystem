# TypeScript 后端架构设计

## 技术选型

- 前端：React + TypeScript，后续可复用 `shared` 类型定义。
- 后端：NestJS + TypeScript，采用模块化单体架构。
- 数据库：PostgreSQL + PostGIS，用于房产经纬度、区域查询、热力图聚合。
- ORM：Prisma，金额字段统一使用 `Decimal` / `NUMERIC(18, 2)`。
- 缓存：Redis，用于统计看板、地图聚合、对账任务状态。
- 文件：S3 / MinIO，用于合同、证件、OCR 原始文件。
- 部署：Docker + Nginx，第一阶段不拆微服务。

## 模块边界

| 模块 | 责任 |
| --- | --- |
| auth | 登录、JWT、权限控制 |
| users | 用户、角色、公司成员 |
| companies | 房产管理公司资料 |
| properties | 项目、建筑物、地址、GIS 坐标 |
| rooms | 房间、状态、租客/业主绑定 |
| tenants | 租客档案 |
| contracts | 租赁合同、租期、租金、押金 |
| transactions | 入金、出金、动态费用明细 |
| bank-transactions | 银行流水导入、银行账号、原始流水 |
| reconciliation | 入金核销、流水匹配、人工确认 |
| anomalies | 滞纳、重复入金、金额异常、合同异常 |
| gis | 地图点位、附近查询、热力图数据 |
| statistics | 饼图、曲线图、月度/年度统计 |
| files | 文件上传、对象存储 |
| ocr | OCR 识别、结构化提取 |
| audit | 操作审计日志 |

## 数据模型要点

- `Property` 对应建筑物/房产，保留 `projectId`，兼容当前原型中的 Project + Building。
- `Room` 保留 `legacyTenantId`、`legacyMonthlyRent`、`legacyContractStartDate`、`legacyContractEndDate`，用于旧数据迁移和后向兼容。
- `Transaction` 统一承载入金与出金，通过 `type` 区分，避免 Income / Expense 两套逻辑重复。
- `TransactionDetail` 支持 Money / Number / Text / Date 动态费用项。
- `BankTransaction` 保存银行原始流水，`ReconciliationMatch` 保存系统交易与银行流水的匹配关系。
- `Property.location` 使用 PostGIS `geography(Point, 4326)`，Prisma 中同时保留 `latitude` / `longitude` 便于 API 返回；GIST 索引可在正式 migration 中追加。
- 所有金额使用 `Decimal @db.Decimal(18, 2)`，禁止用 JavaScript 浮点数直接累加财务金额。

## API 清单

统一前缀：`/api/v1`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /auth/login | 登录 |
| GET | /users | 用户列表 |
| GET | /companies/:id | 管理公司详情 |
| GET | /properties | 房产/建筑物列表 |
| POST | /properties | 新增房产/建筑物 |
| GET | /rooms | 房间列表 |
| POST | /rooms | 新增房间 |
| POST | /rooms/:id/tenants | 绑定租客 |
| POST | /rooms/:id/owners | 绑定业主 |
| GET | /tenants | 租客列表 |
| POST | /tenants | 新增租客 |
| GET | /contracts | 合同列表 |
| POST | /contracts | 新增合同 |
| GET | /transactions | 入金/出金列表 |
| POST | /transactions | 新增入金/出金 |
| GET | /bank-transactions | 银行流水列表 |
| POST | /bank-transactions/import | 导入银行流水 |
| POST | /reconciliation/run | 自动核销 |
| POST | /reconciliation/:id/confirm | 人工确认匹配 |
| GET | /anomalies | 异常列表 |
| POST | /anomalies/scan | 运行异常检测 |
| GET | /gis/properties | 地图房产点位 |
| GET | /gis/heatmap | 热力图数据 |
| GET | /statistics/overview | 首页统计 |
| GET | /statistics/cashflow | 入金出金曲线 |
| POST | /files | 文件上传 |
| POST | /ocr/documents/:id/run | OCR 识别 |
| GET | /audit | 操作日志 |

## 对账与异常检测流程

1. 导入银行流水到 `BankTransaction`。
2. 系统按金额、日期、房间、租客姓名、备注关键字生成候选匹配。
3. 高置信度匹配自动写入 `ReconciliationMatch`，低置信度进入人工确认。
4. 异常检测扫描合同应收、实际入金、重复流水、金额偏差、超期未收。
5. 统计模块读取已核销数据，生成月度收入、支出、滞纳、空置率和热力图指标。

## GIS 设计

- 房产保存大阪地址、区、市、经纬度和 PostGIS 点位。
- 地图接口返回 GeoJSON，前端可直接接入 Mapbox GL / MapTiler / GSI。
- 热力图可以按 `ward`、网格或地图视窗范围聚合。
- 附近查询使用 PostGIS `ST_DWithin`，例如查询 1 公里内房产。

## 迁移策略

当前仓库的 Python + SQLite 原型继续保留；正式后端放在 `backend/`。迁移时：

1. 将 `project` + `building` 合并映射到 `Project` + `Property`。
2. 将 `income` / `expense` 合并到 `Transaction`。
3. 将 `income_detail` / `expense_detail` 合并到 `TransactionDetail`。
4. 将 `REAL` 金额转为 `NUMERIC(18, 2)`。
5. 旧房间上的租客、租金、合同日期进入 `Room.legacy*` 字段，后续再补合同数据。
