const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

// 1. Categories Logic
const jsOldRegex = /\/\/ Categories Logic[\s\S]*?const WHATSAPP_NUMBER/m;
const jsNew = `// Categories Logic
const CATEGORY_MAP = {
  '0101': 'طاقة ومستلزمات كهربائية', '0102': 'طاقة ومستلزمات كهربائية',
  '0103': 'المنزل والمطبخ',
  '0104': 'عدة وأدوات صناعية',
  '0105': 'ملابس',
  '0106': 'ألعاب وترفيه',
  '0107': 'عناية ومستحضرات',
  '0108': 'إكسسوارات',
  '0109': 'قرطاسية'
};

function getProductCategory(p) {
  const codeStr = String(p.code || '').trim();
  const prefix = codeStr.substring(0, 4);
  return CATEGORY_MAP[prefix] || 'أخرى';
}

let currentCategory = 'all';

function openSidebar() { document.getElementById('sidebarOverlay').classList.add('open'); document.getElementById('sidebar').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebarOverlay').classList.remove('open'); document.getElementById('sidebar').classList.remove('open'); }

function setCategory(cat) {
  currentCategory = cat;
  closeSidebar();
  
  const items = document.querySelectorAll('.cat-item');
  items.forEach(el => el.classList.remove('active'));
  const target = Array.from(items).find(el => el.textContent.includes(cat) || (cat === 'all' && el.textContent === 'الكل') || (cat === 'has_img' && el.textContent.includes('متوفر بصورة')) || (cat === 'no_img' && el.textContent.includes('بدون صورة')));
  if (target) target.classList.add('active');

  const url = new URL(window.location);
  if (cat === 'all') url.searchParams.delete('category');
  else url.searchParams.set('category', cat);
  window.history.pushState({}, '', url);

  run();
}

function renderCategoriesMenu() {
  const cats = new Set();
  DATA.forEach(p => {
    const c = getProductCategory(p);
    if (c !== 'أخرى') cats.add(c);
  });
  const sortedCats = Array.from(cats).sort();
  sortedCats.push('أخرى');
  
  const list = document.getElementById('categoriesList');
  if(!list) return;
  const base = \`<div class="cat-item \${currentCategory === 'all' ? 'active' : ''}" onclick="setCategory('all')">الكل</div><div class="cat-item \${currentCategory === 'has_img' ? 'active' : ''}" onclick="setCategory('has_img')">متوفر بصورة 🖼️</div><div class="cat-item \${currentCategory === 'no_img' ? 'active' : ''}" onclick="setCategory('no_img')">بدون صورة ❌</div>\`;
  const catsHtml = sortedCats.map(c => \`<div class="cat-item \${currentCategory === c ? 'active' : ''}" onclick="setCategory('\${c}')">\${c}</div>\`).join('');
  list.innerHTML = base + catsHtml;
}

window.addEventListener('DOMContentLoaded', () => {
  const url = new URL(window.location);
  const catParam = url.searchParams.get('category');
  if (catParam) currentCategory = catParam;
});

const WHATSAPP_NUMBER`;
c = c.replace(jsOldRegex, jsNew);

// 2. WhatsApp Number Update
c = c.replace(/const WHATSAPP_NUMBER = '00963000000000';/, "const WHATSAPP_NUMBER = '0096181473454';");

// 3. WhatsApp Message Format
const waOld = /let msg = "📦 \*طلب جديد من الكتالوج\*\\n\\n";[\s\S]*?const encoded = encodeURIComponent\(msg\);/m;
const waNew = `let msg = "📋 *طلبية جديدة*\\n";
  msg += "---------------------------\\n";
  msg += "👤 *العميل:* (الرجاء كتابة الاسم)\\n";
  
  let today = new Date();
  let dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
  msg += "📅 *التاريخ:* " + dateStr + "\\n\\n";
  msg += "🛍️ *المنتجات المطلوبة:*\\n";
  
  CART.forEach((item, index) => {
    msg += (index + 1) + "️⃣ *" + item.name + "*\\n";
    msg += "   🔖 كود: " + item.code + "\\n";
    msg += "   📦 الكمية: " + item.qty + " صندوق\\n\\n";
  });
  
  msg += "---------------------------\\n";
  msg += "📝 *ملاحظات إضافية:* \\n";
  
  const encoded = encodeURIComponent(msg);`;
c = c.replace(waOld, waNew);

// 4. Modal HTML
const modalOld = `<button class="mcl" onclick="clsM()">✕</button>
    <img class="mimg" id="mi" src="" alt="">
    <div class="mcode" id="mc"></div>
    <div class="mname" id="mn"></div>
    <div class="mqty" id="mq"></div>
    <div class="mdetails" id="md"></div>
    <div id="mCartControls" style="display:flex;align-items:center;gap:12px;margin-top:16px;">
      <div class="cart-qty-ctrl" style="background:rgba(0,0,0,0.2);border-radius:8px;padding:4px;border:1px solid rgba(255,255,255,0.1)">
        <button id="mQtyPlus" onclick="changeMQty(1)">+</button>
        <input type="text" id="mQtyVal" value="1" readonly style="width:50px;font-size:16px;font-weight:bold;color:var(--text);">
        <button id="mQtyMinus" onclick="changeMQty(-1)">-</button>
      </div>
      <button class="add-to-cart-btn" id="mAddToCart" onclick="addCurrentToCart()" style="margin-top:0;flex:1;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
        إضافة للطلب
      </button>
    </div>`;

const modalNew = `<button class="mcl" onclick="clsM()">✕</button>
    <div class="modal-body">
      <div class="mimg-wrapper">
        <img class="mimg" id="mi" src="" alt="">
      </div>
      <div class="m-content">
        <div class="mcode" id="mc"></div>
        <div class="mname" id="mn"></div>
        <div class="mqty" id="mq"></div>
        <div class="mdetails" id="md"></div>
        <div id="mCartControls" style="display:flex;align-items:center;gap:12px;margin-top:16px;">
          <div class="cart-qty-ctrl" style="background:rgba(0,0,0,0.2);border-radius:8px;padding:4px;border:1px solid rgba(255,255,255,0.1)">
            <button id="mQtyPlus" onclick="changeMQty(1)">+</button>
            <input type="text" id="mQtyVal" value="1" readonly style="width:50px;font-size:16px;font-weight:bold;color:var(--text);">
            <button id="mQtyMinus" onclick="changeMQty(-1)">-</button>
          </div>
          <button class="add-to-cart-btn" id="mAddToCart" onclick="addCurrentToCart()" style="margin-top:0;flex:1;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            إضافة للطلب
          </button>
        </div>
      </div>
    </div>`;
c = c.replace(modalOld, modalNew);

// 5. Modal CSS Update
const cssOld = `.modal{background:var(--card);border:1px solid var(--border);border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;padding:20px;transform:translateY(20px) scale(0.97);opacity:0;transition:transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease}
.overlay.on .modal{transform:translateY(0) scale(1);opacity:1}
.mcl{float:left;background:rgba(255,255,255,.08);border:none;color:var(--muted);font-size:20px;cursor:pointer;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.mimg{width:100%;aspect-ratio:1;object-fit:contain;background:rgba(0,0,0,.2);border-radius:12px;margin:12px 0;display:none}`;

const cssNew = `.modal{background:var(--card);border:1px solid var(--border);border-radius:20px;width:100%;max-width:850px;max-height:90vh;overflow-y:auto;padding:24px;transform:translateY(20px) scale(0.97);opacity:0;transition:transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease}
.overlay.on .modal{transform:translateY(0) scale(1);opacity:1}
.mcl{float:left;background:rgba(255,255,255,.08);border:none;color:var(--muted);font-size:20px;cursor:pointer;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:10;position:relative;}

.modal-body { display: flex; flex-direction: column; gap: 24px; clear: both; margin-top: 12px; }
.mimg-wrapper { flex: 1; display: flex; align-items: flex-start; justify-content: center; background: rgba(0,0,0,0.2); border-radius: 12px; padding: 12px; }
.mimg { max-width: 100%; max-height: 40vh; object-fit: contain; display: none; border-radius: 8px; }
.m-content { flex: 1.2; display: flex; flex-direction: column; }

@media (min-width: 768px) {
  .modal-body { flex-direction: row; align-items: flex-start; }
  .mimg-wrapper { position: sticky; top: 0; }
  .mimg { max-height: 60vh; }
}`;
c = c.replace(cssOld, cssNew);

fs.writeFileSync('index.html', c);
console.log("Applied all 3 fixes successfully!");
