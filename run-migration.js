const Database = require('better-sqlite3');

const db = new Database('catalog.sqlite');

try {
  console.log('🔄 بدء عملية تهجير البيانات...');

  db.transaction(() => {
    // 1. إنشاء الجداول الجديدة
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

    db.prepare(`
      CREATE TABLE IF NOT EXISTS new_product_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        FOREIGN KEY (product_id) REFERENCES master_products(id) ON DELETE CASCADE
      )
    `).run();

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

    // 2. جلب البيانات القديمة
    const oldProducts = db.prepare('SELECT * FROM products').all();
    const oldImages = db.prepare('SELECT * FROM product_images').all();

    console.log(`📦 جاري معالجة ${oldProducts.length} صنف قديم و ${oldImages.length} صورة مرتبطة...`);

    const insertMaster = db.prepare(`
      INSERT INTO master_products (code, package_code, name, barcode, box_fill)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const getMaster = db.prepare(`
      SELECT id FROM master_products WHERE code = ? AND package_code = ?
    `);

    const insertStock = db.prepare(`
      INSERT INTO warehouse_stock (product_id, warehouse_name, qty_pcs, qty_boxes)
      VALUES (?, ?, ?, ?)
    `);

    const insertNewImage = db.prepare(`
      INSERT INTO new_product_images (product_id, image_path)
      VALUES (?, ?)
    `);

    // خريطة لربط معرف الصنف القديم بالمعرف الجديد
    const oldIdToMasterId = new Map();

    // 3. تهجير المنتجات والمخزون
    for (const p of oldProducts) {
      const code = p.code || '';
      const packageCode = p.package_code || '';
      
      let masterId;
      const existingMaster = getMaster.get(code, packageCode);
      
      if (existingMaster) {
        masterId = existingMaster.id;
      } else {
        const info = insertMaster.run(code, packageCode, p.name || '', p.barcode || '', p.box_fill || 1);
        masterId = info.lastInsertRowid;
      }
      
      oldIdToMasterId.set(p.id, masterId);

      // إضافة المخزون (تجنب التكرار في حال وجود خطأ في البيانات القديمة)
      try {
        if (p.warehouse) {
          insertStock.run(masterId, p.warehouse, p.qty_pcs || 0, p.qty_boxes || 0);
        }
      } catch (err) {
        if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
          throw err;
        }
      }
    }

    // 4. تهجير الصور (مع منع التكرار لنفس المنتج المجمع)
    const insertedImages = new Set(); // لتتبع الصور المدخلة: "masterId_imagePath"
    let migratedImagesCount = 0;

    for (const img of oldImages) {
      const masterId = oldIdToMasterId.get(img.product_id);
      if (masterId) {
        const uniqueKey = `${masterId}_${img.image_path}`;
        if (!insertedImages.has(uniqueKey)) {
          insertNewImage.run(masterId, img.image_path);
          insertedImages.add(uniqueKey);
          migratedImagesCount++;
        }
      }
    }

    // 5. إعادة تسمية الجداول (القديمة للاحتياط، والجديدة للاعتماد)
    db.prepare('ALTER TABLE products RENAME TO legacy_products').run();
    db.prepare('ALTER TABLE product_images RENAME TO legacy_product_images').run();
    db.prepare('ALTER TABLE new_product_images RENAME TO product_images').run();

    console.log('✅ تم تهجير البيانات بنجاح!');
    console.log(`🔹 الأصناف الأساسية (بدون تكرار): ${new Set(oldIdToMasterId.values()).size}`);
    console.log(`🔹 سجلات المخزون الموزعة: ${oldProducts.length}`);
    console.log(`🔹 الصور المرتبطة بعد إزالة التكرار: ${migratedImagesCount}`);

  })();
} catch (err) {
  console.error('❌ حدث خطأ أثناء التهجير:', err);
}
