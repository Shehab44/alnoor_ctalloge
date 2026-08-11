const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const WAREHOUSE_FILES = [
  { name: 'مستودع 1', baseName: 'warehouse1' },
  { name: 'مستودع 2', baseName: 'warehouse2' },
  { name: 'مستودع 3', baseName: 'warehouse3' }
];

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

  // صف صريح بكمية صفر أو سالبة
  if (qtyBoxes <= 0 || qtyPcs <= 0) {
    return { skipped: false, isZero: true, code, package_code: packageCode, warehouse: warehouseName };
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
    perWarehouse: {},
    details: { added: [], deleted: [] }
  };

  const transaction = db.transaction(() => {
    
    // Statements for UPSERT
    const insertMasterStmt = db.prepare(`
      INSERT INTO master_products (code, package_code, name, barcode, box_fill)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(code, package_code) DO UPDATE SET
        name = excluded.name,
        barcode = excluded.barcode,
        box_fill = excluded.box_fill
      RETURNING id
    `);

    const insertStockStmt = db.prepare(`
      INSERT INTO warehouse_stock (product_id, warehouse_name, qty_pcs, qty_boxes, last_updated)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, warehouse_name) DO UPDATE SET
        qty_pcs = excluded.qty_pcs,
        qty_boxes = excluded.qty_boxes,
        last_updated = CURRENT_TIMESTAMP
    `);

    const getMasterStmt = db.prepare(`SELECT id FROM master_products WHERE code = ? AND package_code = ?`);
    const deleteStockStmt = db.prepare(`DELETE FROM warehouse_stock WHERE product_id = ? AND warehouse_name = ?`);

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

      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const normalized = normalizeWarehouseRow(row, warehouse.name);
        if (normalized.skipped) {
          perWarehouseSummary.skippedRows += 1;
          summary.total.skippedRows += 1;
          continue;
        }

        if (normalized.isZero) {
          // حذف المخزون فقط من المستودع (ولا نحذف المنتج الأساسي أو صوره أبداً)
          const master = getMasterStmt.get(normalized.code, normalized.package_code);
          if (master) {
            const info = deleteStockStmt.run(master.id, warehouse.name);
            if (info.changes > 0) {
              perWarehouseSummary.deleted += 1;
              summary.total.deleted += 1;
              summary.details.deleted.push({ code: normalized.code, warehouse: warehouse.name });
            }
          }
          continue;
        }

        // إدراج أو تحديث الصنف الأساسي
        const masterInfo = insertMasterStmt.get(
          normalized.code, 
          normalized.package_code, 
          normalized.name, 
          normalized.barcode, 
          normalized.box_fill
        );
        
        const productId = masterInfo.id;

        // إدراج أو تحديث مخزون المستودع
        const stockInfo = insertStockStmt.run(
          productId,
          warehouse.name,
          normalized.qty_pcs,
          normalized.qty_boxes
        );

        if (stockInfo.changes > 0) {
          perWarehouseSummary.updated += 1;
          summary.total.updated += 1;
        }
      }

      summary.perWarehouse[warehouse.name] = perWarehouseSummary;
    }
  });

  transaction();
  return { success: true, summary };
}

module.exports = {
  syncWarehouses,
  normalizeWarehouseRow,
  WAREHOUSE_FILES
};
