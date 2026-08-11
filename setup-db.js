const Database = require('better-sqlite3');
const db = new Database('catalog.sqlite');

// 1. إنشاء جدول الكتالوج الموحد (البيانات الثابتة للمنتج والطرد)
db.prepare(`
  CREATE TABLE IF NOT EXISTS master_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    package_code TEXT DEFAULT '',
    name TEXT NOT NULL,
    barcode TEXT,
    box_fill INTEGER DEFAULT 1,
    CONSTRAINT uq_product UNIQUE (code, package_code)
  )
`).run();

// 2. إنشاء جدول الصور (منفصل تماماً عن حركة المخزون)
db.prepare(`
  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES master_products(id) ON DELETE CASCADE
  )
`).run();

// 3. إنشاء جدول حركة مخزون المستودعات (Warehouse Stock)
db.prepare(`
  CREATE TABLE IF NOT EXISTS warehouse_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    warehouse_name TEXT NOT NULL,
    qty_pcs INTEGER DEFAULT 0,
    qty_boxes REAL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES master_products(id) ON DELETE CASCADE,
    CONSTRAINT uq_warehouse_stock UNIQUE (product_id, warehouse_name)
  )
`).run();

console.log('✅ تم إنشاء وتهيئة قاعدة البيانات catalog.sqlite والهيكلة الجديدة بنجاح!');