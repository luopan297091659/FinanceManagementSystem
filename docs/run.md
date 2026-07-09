# 运行说明

本项目一期最小集不需要安装第三方依赖，使用 Python 标准库启动后端与静态前端，数据库使用 SQLite。

## 启动

```powershell
python server.py
```

浏览器访问：

```text
http://127.0.0.1:8000/
```

也可以指定端口：

```powershell
python server.py 9000
```

## 数据库

首次启动会自动创建：

```text
data/app.db
```

数据库结构定义在：

```text
docs/schema.sql
```

页面右上角“重置演示数据”会清空并重新初始化 SQLite 演示数据。

## 当前最小集能力

- 房源管理：Project / Building / Room
- 客户管理：Tenant / Owner
- 房间绑定：room_tenant / room_owner，保留起止日期
- 财务管理：Income / Expense + 动态费用明细
- 费用项配置：FeeItem 支持 Money / Number / Text / Date
- OCR中心：保存文件识别文本，并同步进入知识库
- AI知识库：一期使用本地规则查询，后续可接向量库和大模型
