const fs = require('fs');
const Database = require('better-sqlite3');

const db = new Database('catalog.sqlite');

// 1. قراءة ملف index.html واستخراج الأصناف
const htmlContent = fs.readFileSync('index.html', 'utf8');
const match = htmlContent.match(/const PRODUCTS\s*=\s*(\[[\s\S]*?\]);/);

if (!match) {
  console.error('❌ لم يتم العثور على مصفوفة PRODUCTS داخل index.html');
  process.exit(1);
}

const products = JSON.parse(match[1]);
const imageFiles = fs.readdirSync('images');

console.log(`📦 جاري معالجة ${products.length} صنف و ${imageFiles.length} صورة...`);

const insertProd = db.prepare(`
  INSERT INTO products (name, code, package_code, barcode, qty_pcs, box_fill, qty_boxes, warehouse)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertImg = db.prepare(`
  INSERT INTO product_images (product_id, image_path) VALUES (?, ?)
`);

let importedCount = 0;
let linkedImagesCount = 0;

const transaction = db.transaction(() => {
  for (const p of products) {
    const info = insertProd.run(
      p.name,
      p.code || '',
      p.package_code || '',
      p.barcode || '',
      p.qty_pcs || 0,
      p.box_fill || 1,
      p.qty_boxes || 0,
      p.warehouse || ''
    );
    const productId = info.lastInsertRowid;
    importedCount++;

    // مطابقة الصور بمجلد images تلقائياً مع كود المادة أو رمز الطرد
    const matchedImgs = imageFiles.filter(img => {
      const lowerImg = img.toLowerCase();
      const codeMatch = p.code && lowerImg.includes(p.code.toLowerCase());
      const pkgMatch = p.package_code && lowerImg.includes(p.package_code.toLowerCase());
      return codeMatch || pkgMatch;
    });

    for (const img of matchedImgs) {
      insertImg.run(productId, `images/${img}`);
      linkedImagesCount++;
    }
  }
});

transaction();

console.log(`🎉 اكتمل النقل بنجاح!`);
console.log(`🔹 تم إدخال ${importedCount} صنف إلى SQLite.`);
console.log(`🔹 تم ربط ${linkedImagesCount} صورة بالأصناف أوتوماتيكياً.`);