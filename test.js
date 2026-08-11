const Database = require('better-sqlite3');
const db = new Database('catalog.sqlite');

const products = db.prepare("SELECT * FROM legacy_products WHERE package_code COLLATE NOCASE IN ('m-408', 'm-404', 'm-416', 'm-374', 'm-402')").all();
const getImages = db.prepare('SELECT * FROM legacy_product_images WHERE product_id = ?');

const result = products.map(prod => {
  const imgs = getImages.all(prod.id);
  return {
    package_code: prod.package_code,
    name: prod.name,
    images: imgs.map(i => i.image_path)
  };
});

console.log(JSON.stringify(result, null, 2));
