const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const WAREHOUSE_FILES = [
  { name: 'مستودع 1', baseName: 'warehouse1' },
  { name: 'مستودع 2', baseName: 'warehouse2' },
  { name: 'مستودع 3', baseName: 'warehouse3' }
];

function ensureSchema(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
}

function isExcelErrorValue(value) {
  return typeof value === 'string' && value.trim().includes('#');
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('#')) return NaN;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseQtyBoxes(value) {
  const parsed = parseNumber(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function parseBoxFill(value) {
  const parsed = parseNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.round(parsed);
}

function normalizeWarehouseRow(row, warehouseName) {
  const code = String(row?.[3] ?? '').trim();
  if (!code) {
    return { skipped: true, reason: 'empty-code' };
  }

  const qtyPcs = parseNumber(row?.[8]);
  if (!Number.isFinite(qtyPcs) || isExcelErrorValue(row?.[8])) {
    return { skipped: true, reason: 'invalid-qty-pcs' };
  }

  const boxFill = parseBoxFill(row?.[11]);
  const qtyBoxes = parseQtyBoxes(row?.[12]);
  const barcodeValue = row?.[1];
  const barcode = typeof barcodeValue === 'string' && barcodeValue.startsWith('#') ? '' : String(barcodeValue ?? '');
  const packageCode = String(row?.[10] ?? '');
  const name = String(row?.[4] ?? '');

  // صف صريح بكمية صفر أو سالبة = إشارة حذف (مش تجاهل) — يُعالج لحاله بالحلقة الرئيسية
  if (qtyBoxes <= 0 || qtyPcs <= 0) {
    return { skipped: false, isZero: true, code, warehouse: warehouseName };
  }

  return {
    skipped: false,
    isZero: false,
    code,
    name,
    package_code: packageCode,
    barcode,
    qty_pcs: qtyPcs,
    box_fill: boxFill,
    qty_boxes: qtyBoxes,
    warehouse: warehouseName
  };
}

function buildWarehousePath(rootDir, baseName) {
  const candidates = [
    path.join(rootDir, 'warehouse-updates', `${baseName}.xlsx`),
    path.join(rootDir, 'warehouse-updates', `${baseName}.xls`),
    path.join(rootDir, 'warehouse-updates', baseName),
    path.join(rootDir, `${baseName}.xlsx`),
    path.join(rootDir, `${baseName}.xls`),
    path.join(rootDir, baseName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function syncWarehouses(db, options = {}) {
  const rootDir = options.rootDir || __dirname;
  const summary = {
    total: { updated: 0, added: 0, deleted: 0, skippedRows: 0 },
    perWarehouse: {}
  };
  const notifications = [];

  const transaction = db.transaction(() => {
    ensureSchema(db);

    for (const warehouse of WAREHOUSE_FILES) {
      const filePath = buildWarehousePath(rootDir, warehouse.baseName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`الملف غير موجود: ${warehouse.baseName}`);
      }

      const workbook = XLSX.readFile(filePath);
      if (!workbook.SheetNames.includes('القائمة الرئيسية')) {
        throw new Error(`الشيت "القائمة الرئيسية" غير موجود في الملف: ${warehouse.fileName}`);
      }

      const sheet = workbook.Sheets['القائمة الرئيسية'];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 });
      const perWarehouseSummary = { updated: 0, added: 0, deleted: 0, skippedRows: 0 };

      // دالة تحذف صنف صريح الصفر (إذا كان موجود أصلاً) — بدون أي مقارنة مع باقي أصناف المستودع
      function deleteIfExists(code, warehouseName) {
        const existing = db.prepare('SELECT id FROM products WHERE code = ? AND warehouse = ?').get(code, warehouseName);
        if (!existing) return false;
        const images = db.prepare('SELECT image_path FROM product_images WHERE product_id = ?').all(existing.id);
        for (const image of images) {
          const imagePath = path.join(rootDir, image.image_path);
          try { fs.unlinkSync(imagePath); } catch (err) {
            if (err && err.code !== 'ENOENT') throw err;
          }
        }
        db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
        return true;
      }

      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const normalized = normalizeWarehouseRow(row, warehouse.name);
        if (normalized.skipped) {
          perWarehouseSummary.skippedRows += 1;
          summary.total.skippedRows += 1;
          continue;
        }

        // صف بكمية صفر/سالبة صراحة → احذف الصنف المطابق إذا كان موجود، وبس. لا يُضاف أبداً.
        if (normalized.isZero) {
          if (deleteIfExists(normalized.code, warehouse.name)) {
            perWarehouseSummary.deleted += 1;
            summary.total.deleted += 1;
          }
          continue;
        }

        const existing = db.prepare('SELECT id FROM products WHERE code = ? AND warehouse = ?').get(normalized.code, warehouse.name);

        if (existing) {
          db.prepare(`
            UPDATE products
            SET name = ?, package_code = ?, barcode = ?, qty_pcs = ?, box_fill = ?, qty_boxes = ?
            WHERE id = ?
          `).run(normalized.name, normalized.package_code, normalized.barcode, normalized.qty_pcs, normalized.box_fill, normalized.qty_boxes, existing.id);
          perWarehouseSummary.updated += 1;
          summary.total.updated += 1;
        } else {
          db.prepare(`
            INSERT INTO products (name, code, package_code, barcode, qty_pcs, box_fill, qty_boxes, warehouse)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(normalized.name, normalized.code, normalized.package_code, normalized.barcode, normalized.qty_pcs, normalized.box_fill, normalized.qty_boxes, warehouse.name);
          perWarehouseSummary.added += 1;
          summary.total.added += 1;
          notifications.push({ type: 'new-product', message: `صنف جديد بالكتالوج: ${normalized.name}` });
        }
      }

      // ملاحظة مهمة: لا يوجد هون أي حذف بسبب الغياب عن الملف — الحذف فقط للأصناف الصفرية الصريحة فوق.
      summary.perWarehouse[warehouse.name] = perWarehouseSummary;
    }

    const lowQtyProducts = db.prepare('SELECT name, warehouse, qty_boxes FROM products WHERE qty_boxes > 0 AND qty_boxes < 2').all();
    for (const product of lowQtyProducts) {
      notifications.push({
        type: 'low-stock',
        message: `كمية منخفضة: ${product.name} (${product.qty_boxes} صندوق متبقي - ${product.warehouse})`
      });
    }

    notifications.unshift({
      type: 'sync',
      message: `مزامنة المستودعات: ${summary.total.updated} تحديث، ${summary.total.added} إضافة، ${summary.total.deleted} حذف`
    });

    for (const notification of notifications) {
      db.prepare('INSERT INTO notifications (type, message, created_at) VALUES (?, ?, ?)').run(
        notification.type,
        notification.message,
        new Date().toISOString()
      );
    }
  });

  transaction();
  return { success: true, summary };
}

module.exports = {
  ensureSchema,
  syncWarehouses,
  normalizeWarehouseRow,
  WAREHOUSE_FILES
};
