const fs = require('fs');
const Database = require('better-sqlite3');

const db = new Database('catalog.sqlite');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const products = db.prepare('SELECT id, code, package_code FROM master_products ORDER BY id').all();
const imageFiles = fs.readdirSync('images')
  .filter(name => /\.(jpe?g|png|webp|gif)$/i.test(name))
  .sort();

const beforeCount = db.prepare('SELECT COUNT(*) AS c FROM product_images').get().c;

console.log(`📦 جاري معالجة ${products.length} صنف أساسي و ${imageFiles.length} صورة...`);
console.log(`⚠️ سيتم تفريغ جدول ربط الصور وإعادة ربطه بدقة متناهية...`);

// تفريغ جدول الصور لإعادة الربط النظيف
db.prepare('DELETE FROM product_images').run();

const insertImg = db.prepare(`
  INSERT INTO product_images (product_id, image_path) VALUES (?, ?)
`);

let linkedImagesCount = 0;

const transaction = db.transaction(() => {
  for (const p of products) {
    const code = String(p.code || '').trim();
    if (!code) continue;

    // نمط بحث دقيق: يجب أن يبدأ اسم الملف برمز المادة بالضبط، متبوعاً إما بنقطة (للامتداد) أو شرطة/أندر سكور
    // مثال: 12.jpg أو 12_1.jpg أو 12-front.png
    // يمنع ربط 12 بصورة 123.jpg
    const regex = new RegExp('^' + escapeRegExp(code) + '([_\\-].*)?\\.(jpe?g|png|webp|gif)$', 'i');

    const matchedImgs = imageFiles.filter(img => regex.test(img));

    for (const img of matchedImgs) {
      insertImg.run(p.id, `images/${img}`);
      linkedImagesCount++;
    }
  }
});

transaction();

const afterCount = db.prepare('SELECT COUNT(*) AS c FROM product_images').get().c;

console.log(`🎉 اكتمل ربط الصور النظيف بنجاح!`);
console.log(`🔹 كانت الصور المرتبطة قبل التشغيل: ${beforeCount}`);
console.log(`🔹 أصبحت الصور المرتبطة بعد التشغيل: ${afterCount}`);
console.log(`🔹 تم ربط ${linkedImagesCount} صورة بالأصناف أوتوماتيكياً بناءً على الكود الدقيق فقط.`);