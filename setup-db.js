const Database = require('better-sqlite3');
const db = new Database('catalog.sqlite');

// إنشاء جدول المنتجات
db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    package_code TEXT,
    barcode TEXT,
    qty_pcs INTEGER DEFAULT 0,
    box_fill INTEGER DEFAULT 1,
    qty_boxes REAL DEFAULT 0,
    warehouse TEXT
  )
`).run();

// إنشاء جدول الصور المرتبطة بـ ID المنتج
db.prepare(`
  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )
`).run();

// إنشاء جدول الإشعارات
db.prepare(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

console.log('✅ تم إنشاء قاعدة البيانات catalog.sqlite والجدولين بنجاح!');