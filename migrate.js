const fs = require('fs');
const Database = require('better-sqlite3');

const db = new Database('catalog.sqlite');

const products = db.prepare('SELECT id, code, package_code FROM products ORDER BY id').all();
const imageFiles = fs.readdirSync('images')
  .filter(name => /\.(jpe?g|png|webp|gif)$/i.test(name))
  .sort();

const beforeCount = db.prepare('SELECT COUNT(*) AS c FROM product_images').get().c;

console.log(`📦 جاري معالجة ${products.length} صنف و ${imageFiles.length} صورة...`);

const insertImg = db.prepare(`
  INSERT INTO product_images (product_id, image_path) VALUES (?, ?)
`);

let linkedImagesCount = 0;

const transaction = db.transaction(() => {
  for (const p of products) {
    const code = String(p.code || '').trim();
    if (!code) continue;

    const lowerCode = code.toLowerCase();
    const matchedImgs = imageFiles.filter(img => {
      const lowerImg = img.toLowerCase();
      return lowerImg.includes(lowerCode);
    });

    for (const img of matchedImgs) {
      insertImg.run(p.id, `images/${img}`);
      linkedImagesCount++;
    }
  }
});

transaction();

const afterCount = db.prepare('SELECT COUNT(*) AS c FROM product_images').get().c;

console.log(`🎉 اكتمل ربط الصور بنجاح!`);
console.log(`🔹 كانت الصور المرتبطة قبل التشغيل: ${beforeCount}`);
console.log(`🔹 أصبحت الصور المرتبطة بعد التشغيل: ${afterCount}`);
console.log(`🔹 تم ربط ${linkedImagesCount} صورة بالأصناف أوتوماتيكياً بناءً على الكود فقط.`);