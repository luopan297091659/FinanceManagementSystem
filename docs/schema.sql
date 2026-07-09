CREATE TABLE IF NOT EXISTS management_company (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS building (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id),
  management_company_id TEXT REFERENCES management_company(id),
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS room (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES building(id),
  management_company_id TEXT REFERENCES management_company(id),
  room_number TEXT NOT NULL,
  area REAL,
  floor INTEGER,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'VACANT',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(building_id, room_number)
);

CREATE TABLE IF NOT EXISTS tenant (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_kana TEXT,
  nationality TEXT,
  phone TEXT,
  email TEXT,
  birth_date TEXT,
  occupation TEXT,
  annual_income REAL,
  address1 TEXT,
  address2 TEXT,
  address3 TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS owner (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL DEFAULT 'PERSON',
  name TEXT NOT NULL,
  name_kana TEXT,
  representative_name TEXT,
  company_phone TEXT,
  phone TEXT,
  email TEXT,
  address1 TEXT,
  address2 TEXT,
  address3 TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_tenant (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES room(id),
  tenant_id TEXT NOT NULL REFERENCES tenant(id),
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_owner (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES room(id),
  owner_id TEXT NOT NULL REFERENCES owner(id),
  start_date TEXT,
  end_date TEXT,
  ownership_ratio REAL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fee_item (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('income', 'expense', 'both')),
  value_type TEXT NOT NULL CHECK(value_type IN ('Money', 'Number', 'Text', 'Date')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS income (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES room(id),
  income_date TEXT NOT NULL,
  payer TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS income_detail (
  id TEXT PRIMARY KEY,
  income_id TEXT NOT NULL REFERENCES income(id) ON DELETE CASCADE,
  fee_item_id TEXT NOT NULL REFERENCES fee_item(id),
  value_money REAL,
  value_number REAL,
  value_text TEXT,
  value_date TEXT
);

CREATE TABLE IF NOT EXISTS expense (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES room(id),
  expense_date TEXT NOT NULL,
  payee TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_detail (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expense(id) ON DELETE CASCADE,
  fee_item_id TEXT NOT NULL REFERENCES fee_item(id),
  value_money REAL,
  value_number REAL,
  value_text TEXT,
  value_date TEXT
);

CREATE TABLE IF NOT EXISTS document (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES room(id),
  tenant_id TEXT REFERENCES tenant(id),
  owner_id TEXT REFERENCES owner(id),
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  ocr_text TEXT,
  extracted_json TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIRM',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_document (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES room(id),
  document_id TEXT REFERENCES document(id),
  title TEXT NOT NULL,
  content TEXT,
  source_type TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_room_building ON room(building_id);
CREATE INDEX IF NOT EXISTS idx_room_tenant_room ON room_tenant(room_id);
CREATE INDEX IF NOT EXISTS idx_room_owner_room ON room_owner(room_id);
CREATE INDEX IF NOT EXISTS idx_income_room_date ON income(room_id, income_date);
CREATE INDEX IF NOT EXISTS idx_expense_room_date ON expense(room_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_document_room ON document(room_id);
