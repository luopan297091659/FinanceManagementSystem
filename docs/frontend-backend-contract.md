# 前后端数据契约

当前前端原型默认调用 `/api/*`，Python 演示服务继续保持这个路径。正式 NestJS 后端使用 `/api/v1/*`，前端可通过 `window.API_BASE = "/api/v1"` 切换。

## Bootstrap

`GET /api/bootstrap` 或 `GET /api/v1/bootstrap`

返回页面一次性渲染需要的聚合数据：

```ts
interface Bootstrap {
  projects: Project[];
  buildings: Building[];
  rooms: Room[];
  tenants: Tenant[];
  owners: Owner[];
  roomTenants: RoomTenant[];
  roomOwners: RoomOwner[];
  feeItems: FeeItem[];
  transactions: Transaction[];
  documents: Document[];
  knowledgeDocuments: KnowledgeDocument[];
}
```

## 字段映射

| 前端字段 | 正式后端/Prisma 字段 | 说明 |
| --- | --- | --- |
| `building.id` | `Property.id` | 前端仍称 building，后端统一为 property |
| `building.latitude` | `Property.latitude` | 建筑物默认纬度 |
| `building.longitude` | `Property.longitude` | 建筑物默认经度 |
| `room.buildingId` | `Room.propertyId` | 兼容旧 UI |
| `room.number` | `Room.roomNumber` | 兼容旧 UI |
| `room.latitude` | `Room.latitude` | 房间自定义纬度，可为空 |
| `room.longitude` | `Room.longitude` | 房间自定义经度，可为空 |
| `room.effectiveLatitude` | `Room.latitude ?? Property.latitude` | GIS 使用的实际纬度 |
| `room.effectiveLongitude` | `Room.longitude ?? Property.longitude` | GIS 使用的实际经度 |
| `room.coordinateSource` | 派生字段 | `room` 表示房间自定义，`building` 表示继承建筑物，`none` 表示无坐标 |
| `tenant.kana` | `Tenant.nameKana` | 日文假名 |
| `tenant.address` | `Tenant.address1` | 一期只展示主地址 |
| `tenant.attachments` | `Tenant.note` | 原型里的附件备注 |
| `owner.kana` | `Owner.nameKana` | 日文假名 |
| `owner.address` | `Owner.address1` | 一期只展示主地址 |
| `owner.attachments` | `Owner.note` | 原型里的附件备注 |
| `transaction.type` | `Transaction.type` | 前端小写 `income/expense`，数据库大写 enum |
| `feeItem.category` | `FeeItem.category` | 前端小写 `income/expense/both`，数据库大写 enum |
| `feeItem.valueType` | `FeeItem.valueType` | 前端 `Money/Number/Text/Date`，数据库大写 enum |
| `document.extractedText` | `Document.ocrText` | OCR 文本 |

## 金额规则

- 前端可以继续用字符串传金额，例如 `"75000"`。
- 后端写入 PostgreSQL 时统一转为 `Decimal` / `NUMERIC(18, 2)`。
- 聚合金额不使用 JavaScript 浮点数累加。
- API 返回金额时用字符串，避免精度在 JSON 中丢失。

## GIS 坐标规则

- Building/Property 可保存默认坐标：`buildingLatitude`、`buildingLongitude`。
- Room 可保存覆盖坐标：`roomLatitude`、`roomLongitude`。
- 如果 Room 没有覆盖坐标，则 API 返回的 `effectiveLatitude/effectiveLongitude` 自动使用 Building 坐标。
- 首页 GIS 房屋状态图建议使用 `rooms[].effectiveLatitude`、`rooms[].effectiveLongitude` 和 `rooms[].status`。

## 已覆盖的兼容接口

| 方法 | Python 演示 | NestJS 正式后端 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/bootstrap` | `/api/v1/bootstrap` | 聚合数据 |
| POST | `/api/rooms` | `/api/v1/rooms` | 新增房间，并自动创建项目/建筑物 |
| POST | `/api/customers` | `/api/v1/customers` | 新增租客或业主 |
| POST | `/api/bindings` | `/api/v1/bindings` | 房间绑定租客/业主 |
| POST | `/api/transactions` | `/api/v1/transactions` | 新增入金/出金 |
| POST | `/api/documents` | `/api/v1/documents` | 新增 OCR 文件和知识文档 |
| POST | `/api/fee-items` | `/api/v1/fee-items` | 新增动态费用项 |
| POST | `/api/reset` | `/api/v1/reset` | 清空正式后端数据 |

## 前端切换正式后端

在加载 `src/app.js` 前设置：

```html
<script>
  window.API_BASE = "/api/v1";
</script>
```

如果前端和 NestJS 分开部署，则把 `API_BASE` 设置为完整地址，例如：

```html
<script>
  window.API_BASE = "http://127.0.0.1:3000/api/v1";
</script>
```
