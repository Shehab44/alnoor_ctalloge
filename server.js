const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { syncWarehouses } = require('./warehouse-sync');

const app = express();
const db = new Database('catalog.sqlite');

// تفعيل foreign keys لضمان الكاسكيد (Cascade Delete)
db.pragma('foreign_keys = ON');

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

function adminOnly(req, res, next) {
  const providedKey = req.headers['x-admin-key'];
  const correctKey = process.env.ADMIN_PASSWORD || '81473454';
  if (providedKey !== correctKey) {
    return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية' });
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

// API 1: جلب جميع الأصناف مع صورها والمخزون
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare(`
      SELECT m.*, 
             (SELECT COUNT(*) FROM product_images WHERE product_id = m.id) as img_count
      FROM master_products m 
      ORDER BY img_count DESC, id DESC
    `).all();
    const getImages = db.prepare('SELECT id, image_path FROM product_images WHERE product_id = ?');
    const getStock = db.prepare('SELECT warehouse_name, qty_pcs, qty_boxes, last_updated FROM warehouse_stock WHERE product_id = ?');

    const result = products.map(prod => {
      const imgs = getImages.all(prod.id);
      const stock = getStock.all(prod.id);
      
      // التوافقية المؤقتة للواجهة القديمة (لحين تعديل index.html)
      // سنقوم بإرجاع الحقول بشكل مجمع ليسهل التعامل معها في الواجهة
      return {
        ...prod,
        images: imgs.map(i => i.image_path),
        image_ids: imgs.map(i => i.id),
        stock: stock,
        // إرجاع أول مستودع وكمياته كقيم افتراضية لعدم كسر الواجهة القديمة تماماً
        warehouse: stock.length > 0 ? stock.map(s => s.warehouse_name).join(', ') : 'بدون مستودع',
        qty_pcs: stock.reduce((sum, s) => sum + (s.qty_pcs || 0), 0),
        qty_boxes: stock.reduce((sum, s) => sum + (s.qty_boxes || 0), 0)
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// API 2: إضافة صنف جديد يدوياً
app.post('/api/products', adminOnly, (req, res) => {
  try {
    const { name, code, package_code, barcode, box_fill } = req.body;
    const stmt = db.prepare(`
      INSERT INTO master_products (name, code, package_code, barcode, box_fill)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, code, package_code || '', barcode || '', box_fill || 1);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'رمز المادة ورمز الطرد موجودان مسبقاً.' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// API 3: رفع صورة جديدة لصنف بـ ID
app.post('/api/products/:id/upload', adminOnly, upload.single('image'), (req, res) => {
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
app.put('/api/products/:id', adminOnly, (req, res) => {
  try {
    const { name, code, package_code, barcode, box_fill } = req.body;
    db.prepare(`
      UPDATE master_products
      SET name=?, code=?, package_code=?, barcode=?, box_fill=?
      WHERE id=?
    `).run(name, code, package_code || '', barcode || '', box_fill || 1, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 5: حذف صورة واحدة
app.delete('/api/products/:productId/images/:imageId', adminOnly, (req, res) => {
  try {
    const img = db.prepare('SELECT * FROM product_images WHERE id=? AND product_id=?').get(req.params.imageId, req.params.productId);
    if (!img) return res.status(404).json({ error: 'الصورة غير موجودة' });

    db.prepare('DELETE FROM product_images WHERE id=?').run(req.params.imageId);

    const filePath = path.join(__dirname, img.image_path);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 6: حذف صنف (سيتم مسح المخزون والصور من قاعدة البيانات تلقائياً عبر CASCADE)
app.delete('/api/products/:id', adminOnly, (req, res) => {
  try {
    // جلب مسارات الصور لمسحها من القرص
    const images = db.prepare('SELECT image_path FROM product_images WHERE product_id = ?').all(req.params.id);
    
    db.prepare('DELETE FROM master_products WHERE id = ?').run(req.params.id);
    
    for (const img of images) {
        const filePath = path.join(__dirname, img.image_path);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) { console.error('فشل حذف الصورة', e); }
        }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 7: مزامنة المستودعات من ملفات XLSX
app.post('/api/sync-warehouses', adminOnly, (req, res) => {
  try {
    const result = syncWarehouses(db, { rootDir: __dirname });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل الآن بنجاح على الرابط: http://localhost:${PORT}`);
});