const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { syncWarehouses } = require('./warehouse-sync');

const app = express();
const db = new Database('catalog.sqlite');

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

function localOnly(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip.includes('::ffff:127.0.0.1');
  if (!isLocal) {
    return res.status(403).json({ error: 'التعديل مسموح فقط من الجهاز المحلي' });
  }
  next();
}

// إعداد رفع الصور الجديدة
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync('images')) {
      fs.mkdirSync('images');
    }
    cb(null, 'images/');
  },
  filename: (req, file, cb) => {
    cb(null, 'img_' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// API 1: جلب جميع الأصناف مع صورها
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products').all();
    const getImages = db.prepare('SELECT id, image_path FROM product_images WHERE product_id = ?');

    const result = products.map(prod => {
      const imgs = getImages.all(prod.id);
      return {
        ...prod,
        images: imgs.map(i => i.image_path),
        image_ids: imgs.map(i => i.id)
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 2: إضافة صنف جديد
app.post('/api/products', localOnly, (req, res) => {
  try {
    const { name, code, package_code, barcode, qty_pcs, box_fill, qty_boxes, warehouse } = req.body;
    const stmt = db.prepare(`
      INSERT INTO products (name, code, package_code, barcode, qty_pcs, box_fill, qty_boxes, warehouse)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, code, package_code, barcode, qty_pcs || 0, box_fill || 1, qty_boxes || 0, warehouse || 'مستودع 1');
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 3: رفع صورة جديدة لصنف بـ ID
app.post('/api/products/:id/upload', localOnly, upload.single('image'), (req, res) => {
  try {
    const productId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة' });

    const imagePath = 'images/' + req.file.filename;
    const info = db.prepare('INSERT INTO product_images (product_id, image_path) VALUES (?, ?)').run(productId, imagePath);

    res.json({ success: true, image_id: info.lastInsertRowid, image_path: imagePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 4: تعديل صنف
app.put('/api/products/:id', localOnly, (req, res) => {
  try {
    const { name, code, package_code, barcode, qty_pcs, box_fill, qty_boxes, warehouse } = req.body;
    db.prepare(`
      UPDATE products
      SET name=?, code=?, package_code=?, barcode=?, qty_pcs=?, box_fill=?, qty_boxes=?, warehouse=?
      WHERE id=?
    `).run(name, code, package_code, barcode, qty_pcs || 0, box_fill || 1, qty_boxes || 0, warehouse || '', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 5: حذف صورة واحدة
app.delete('/api/products/:productId/images/:imageId', localOnly, (req, res) => {
  try {
    const img = db.prepare('SELECT * FROM product_images WHERE id=? AND product_id=?').get(req.params.imageId, req.params.productId);
    if (!img) return res.status(404).json({ error: 'الصورة غير موجودة' });

    db.prepare('DELETE FROM product_images WHERE id=?').run(req.params.imageId);

    const filePath = path.join(__dirname, img.image_path);
    fs.unlink(filePath, () => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 6: حذف صنف
app.delete('/api/products/:id', localOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 7: مزامنة المستودعات من ملفات XLSX
app.post('/api/sync-warehouses', localOnly, (req, res) => {
  try {
    const result = syncWarehouses(db, { rootDir: __dirname });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل الآن بنجاح على الرابط: http://localhost:${PORT}`);
});