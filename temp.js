
// ملاحظة أمنية: هذا الملف يعمل كـ HTML محلي بدون auth أو صلاحيات منفصلة.
// أي شخص يفتح الملف في المتصفح لديه صلاحية كاملة للتعديل/الحذف/التصدير/إضافة أصناف.
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
let PRODUCTS = [];

const IMAGES={};

let DATA = [];
let filtered=[], curF='all', curQ='', sortByBoxes=false, page=0;
const PAGE=50;
let curCode=null;
let curItemKey=null;

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `
    <div class="t-icon">${icon}</div>
    <div class="t-content">
      <div class="t-title">${esc(title)}</div>
      <div class="t-msg">${esc(message)}</div>
    </div>
  `;
  container.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after 4s
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function showSyncReport(summary) {
  document.getElementById('r-added').textContent = summary.total.added;
  document.getElementById('r-updated').textContent = summary.total.updated;
  document.getElementById('r-deleted').textContent = summary.total.deleted;

  const addedList = document.getElementById('r-added-list');
  const deletedList = document.getElementById('r-deleted-list');
  
  if (summary.details.added && summary.details.added.length > 0) {
    addedList.innerHTML = summary.details.added.map(a => `
      <div class="r-item">
        <div><span class="c-name">${esc(a.name || 'بدون اسم')}</span> <span class="c-wh">(${esc(a.code)})</span></div>
        <div class="c-wh">${esc(a.warehouse)} - ${esc(a.qty_boxes)} صندوق</div>
      </div>
    `).join('');
    document.getElementById('r-added-section').style.display = 'block';
  } else {
    document.getElementById('r-added-section').style.display = 'none';
  }

  if (summary.details.deleted && summary.details.deleted.length > 0) {
    deletedList.innerHTML = summary.details.deleted.map(d => `
      <div class="r-item">
        <div><span class="c-name">${esc(d.name || 'بدون اسم')}</span> <span class="c-wh">(${esc(d.code)})</span></div>
        <div class="c-wh" style="color:var(--red)">شطب من ${esc(d.warehouse)}</div>
      </div>
    `).join('');
    document.getElementById('r-deleted-section').style.display = 'block';
  } else {
    document.getElementById('r-deleted-section').style.display = 'none';
  }

  document.getElementById('ovReport').classList.add('on');
}

let isFirstLoad = true;
async function loadProductsFromDB(){
  try{
    const response=await fetch('/api/products');
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    PRODUCTS = Array.isArray(data) ? data : [];
    DATA = PRODUCTS.map(p=>({...p}));
    run();
    updateStats();
    if(isFirstLoad && window.location.hash){
      const key = decodeURIComponent(window.location.hash.substring(1));
      const p = findByKey(key);
      if(p) setTimeout(()=>opnM(p), 150);
      isFirstLoad = false;
    }
  }catch(err){
    console.error('فشل تحميل الأصناف من قاعدة البيانات', err);
    PRODUCTS = [];
    DATA = [];
    run();
    updateStats();
  }
}

document.addEventListener('DOMContentLoaded', loadProductsFromDB);

function normalizeKeyPart(v){return String(v||'').trim().toLowerCase();}
function buildItemKey(p){
  return [p.warehouse, p.code, p.package_code, p.barcode]
    .map(normalizeKeyPart)
    .join('|');
}
function safeImageNamePart(v){
  return String(v||'').trim().replace(/[^a-z0-9\-_]+/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').toLowerCase();
}
function isValidImageSource(src){
  if(!src) return false;
  const s=String(src).trim();
  if(s.startsWith('data:image/')){
    return /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(s);
  }
  return true;
}
function buildImageFileName(p){
  const code=safeImageNamePart(p.code);
  const pkg=safeImageNamePart(p.package_code);
  if(pkg) return `${pkg}_${code}`;
  return code;
}
function getImageCandidates(p){
  const code=safeImageNamePart(p.code);
  const pkg=safeImageNamePart(p.package_code);
  const exts=['jpg','jpeg','png','webp','gif'];
  const stems=new Set();

  if(code && pkg){
    stems.add(`${pkg}_${code}`);
    stems.add(`${code}_${pkg}`);
    stems.add(`${pkg}-${code}`);
    stems.add(`${code}-${pkg}`);
  }

  if(code && !pkg){
    stems.add(code);
  }

  const candidates=[];
  for(const stem of stems){
    for(const ext of exts){ candidates.push(`images/${stem}.${ext}`); }
  }

  return candidates;
}
function findByKey(key){
  if(!key) return null;
  return DATA.find(d=>buildItemKey(d)===key);
}
function findByCode(code, packageCode='', warehouse='', barcode=''){
  if(!code) return null;
  const matches=DATA.filter(d=>String(d.code||'').trim()===String(code).trim());
  if(!matches.length) return null;

  const pkg=String(packageCode||'').trim();
  const wh=String(warehouse||'').trim();
  const br=String(barcode||'').trim();
  const exact=matches.find(d =>
    (!pkg || String(d.package_code||'').trim()===pkg) &&
    (!wh || String(d.warehouse||'').trim()===wh) &&
    (!br || String(d.barcode||'').trim()===br)
  );
  if(exact) return exact;

  if(pkg){
    const pkgMatches=matches.filter(d=>{
      const itemPkg=String(d.package_code||'').trim();
      return itemPkg && itemPkg!=='-' && itemPkg.toLowerCase()!=='null' && itemPkg===pkg;
    });
    return pkgMatches.length===1 ? pkgMatches[0] : null;
  }

  const noPackageMatches=matches.filter(d=>{
    const itemPkg=String(d.package_code||'').trim();
    return !itemPkg || itemPkg==='-' || itemPkg.toLowerCase()==='null';
  });
  if(noPackageMatches.length===1) return noPackageMatches[0];
  return null;
}

function getImg(p){
  const firstImage = Array.isArray(p.images) && p.images.length ? p.images[0] : '';
  if(firstImage && isValidImageSource(firstImage)) return firstImage;
  if(p.image_url && isValidImageSource(p.image_url)) return p.image_url;

  const candidates=getImageCandidates(p);
  for(const candidate of candidates){
    if(IMAGES[candidate]) return IMAGES[candidate];
  }

  const folderMatches=candidates
    .map(c=>c.replace(/^images\//,''))
    .find(name=>folderImageFiles.has(name.toLowerCase()));
  if(folderMatches){ return `images/${folderMatches}`; }

  const codeKey=safeImageNamePart(p.code);
  if(codeKey && IMAGES[codeKey]) return IMAGES[codeKey];
  return null;
}

function hasImage(p){
  const firstImage = Array.isArray(p.images) && p.images.length ? p.images[0] : '';
  if(firstImage && isValidImageSource(firstImage)) return true;
  if(p.image_url && isValidImageSource(p.image_url)) return true;
  const candidates=getImageCandidates(p);
  for(const candidate of candidates){
    if(IMAGES[candidate]) return true;
  }
  return candidates.some(c=>folderImageFiles.has(c.replace(/^images\//,'').toLowerCase()));
}

function validateProductDuplication(p){
  const code=String(p.code||'').trim();
  const wh=String(p.warehouse||'').trim();
  if(!code || !wh) return null;
  const dup=DATA.find(d=>String(d.code||'').trim()===code && String(d.warehouse||'').trim()===wh && String(d.package_code||'').trim()!==String(p.package_code||'').trim());
  return dup ? `تنبيه: يوجد صنف آخر بنفس الكود (${code}) في نفس المستودع لكن برمز طرد مختلف` : null;
}

function run(){
  const q=curQ.toLowerCase().trim();
  filtered=DATA.filter(p=>{
    if(q){
      const s=[p.name,p.code,p.package_code,p.barcode].join(' ').toLowerCase();
      if(!s.includes(q)) return false;
    }
    const hasW1 = p.stock && p.stock.some(s => s.warehouse_name === 'مستودع 1');
    const hasW2 = p.stock && p.stock.some(s => s.warehouse_name === 'مستودع 2');
    const hasW3 = p.stock && p.stock.some(s => s.warehouse_name === 'مستودع 3');

    if(curF==='w1') return hasW1;
    if(curF==='w2') return hasW2;
    if(curF==='w3') return hasW3;
    if(curF==='img') return hasImage(p);
    if(curF==='noimg') return !hasImage(p);
    if(curF==='b10') return p.qty_boxes>=10;
    if(curF==='an') return (p.package_code||'').toUpperCase().startsWith('AN');
    if(curF==='b') return /^B[-\s]/i.test(p.package_code||'');
    if(curF==='m') return /^M[-\s]/i.test(p.package_code||'');
    if(curF==='r') return /^R[-\s]/i.test(p.package_code||'');
    if(curF==='x') return /^X[-\s]/i.test(p.package_code||'');
    return true;
  });
  if(sortByBoxes) filtered.sort((a,b)=>b.qty_boxes-a.qty_boxes);
  page=0;
  document.getElementById('rc').innerHTML=`<strong>${esc(filtered.length)}</strong> صنف`;
  render();
  updateStats();
}

function render(){
  const end=(page+1)*PAGE;
  const slice=filtered.slice(0,end);
  if(!slice.length){
    document.getElementById('grid').innerHTML='<div class="empty"><div style="font-size:48px;margin-bottom:12px"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div><p>لا توجد نتائج</p></div>';
    return;
  }
  let h='';
  for(const p of slice){
    const img=getImg(p);
    const hasImg=!!img;
    
    const whTags = p.stock ? p.stock.map(s => {
      const w = s.warehouse_name;
      const c = w==='مستودع 1'?'w1b':w==='مستودع 2'?'w2b':'w3b';
      const l = w==='مستودع 1'?'م1':w==='مستودع 2'?'م2':'م3';
      return `<span class="wb ${c}" style="position:relative;display:inline-block;top:auto;right:auto;margin:2px">${esc(l)}</span>`;
    }).join('') : '';
    const whContainer = `<div style="position:absolute;top:4px;right:4px;display:flex;flex-direction:column;align-items:flex-end;">${whTags}</div>`;

    const imgHtml=hasImg?`<img class="ci" src="${esc(img)}" loading="lazy" alt="" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`:'' ;
    const noImg=`<div class="ni" style="${hasImg?'display:none':''}"><svg width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='var(--gold)' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'><path d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'></path><polyline points='3.27 6.96 12 12.01 20.73 6.96'></polyline><line x1='12' y1='22.08' x2='12' y2='12'></line></svg></div>`;
    const pickerKey=encodeURIComponent(buildItemKey(p));
    const addImgBtn=hasImg?'':`<button class="addimg-btn admin-only" onclick="event.stopPropagation();openImgPicker('${esc(pickerKey)}')"><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='vertical-align:middle;margin-left:4px;'><path d='M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'></path><circle cx='12' cy='13' r='4'></circle></svg>إضافة صورة</button>`;

    const bc=p.qty_boxes>=10?'var(--green)':p.qty_boxes>=1?'var(--yellow)':'var(--red)';
    const boxes=p.qty_boxes%1===0?p.qty_boxes:p.qty_boxes.toFixed(1);

    h+=`<div class="card${hasImg?' hi':''}" data-key="${esc(pickerKey)}">
      <div class="iw">${imgHtml}${noImg}${addImgBtn}${whContainer}</div>
      <div class="cb">
        ${p.package_code&&p.package_code!=='-'?`<span class="pkg">${esc(p.package_code)}</span>`:''}
        <div class="cn">${esc(p.name)}</div>
        <div class="qty-row">
          <div class="qty-box">
            <span class="qty-label">عدد الصناديق</span>
            <span class="qty-val" style="color:${bc}">${esc(boxes)}</span>
          </div>
          <div class="qty-box">
            <span class="qty-label">تعبئة الصندوق</span>
            <span class="qty-val" style="color:var(--blue)">${esc(p.box_fill)}<span class="qty-unit"> ق</span></span>
          </div>
          <div class="qty-box">
            <span class="qty-label">إجمالي القطع</span>
            <span class="qty-val" style="color:var(--muted);font-size:12px">${esc(p.qty_pcs)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }
  if(end<filtered.length){
    h+=`<div class="lmw" id="load-more-sentinel"><span style="color:var(--muted);font-size:12px">تحميل المزيد…</span></div>`;
  }
  document.getElementById('grid').innerHTML=h;
  setupInfiniteScroll();
}

let loadObserver=null;
function setupInfiniteScroll(){
  const sentinel=document.getElementById('load-more-sentinel');
  if(!sentinel) return;
  if(loadObserver){ loadObserver.disconnect(); loadObserver=null; }
  if('IntersectionObserver' in window){
    loadObserver=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)) more();
    },{rootMargin:'400px',threshold:0});
    loadObserver.observe(sentinel);
  } else {
    sentinel.innerHTML='<button class="lmb" onclick="more()">تحميل المزيد</button>';
  }
}

function bindGridEvents(){
  document.getElementById('grid').addEventListener('click', e=>{
    const card=e.target.closest('.card[data-key]');
    if(!card) return;
    const p=findByKey(decodeURIComponent(card.dataset.key));
    if(p) opnM(p);
  });
}

function more(){page++;render();}

function opnM(p){
  curCode=p.code;
  curItemKey=buildItemKey(p);
  const img=getImg(p);
  const mi=document.getElementById('mi');
  if(img){mi.src=img;mi.style.display='block';}else{mi.style.display='none';}
  const delBtn=document.getElementById('delImgBtn');
  if(delBtn) delBtn.style.display = img ? 'inline-block' : 'none';
  document.getElementById('mc').textContent=p.package_code||p.code||'—';
  document.getElementById('mn').textContent=p.name;

  let stockHtml = '';
  if (p.stock && p.stock.length > 0) {
    p.stock.forEach(s => {
      const bc = s.qty_boxes>=10?'var(--green)':s.qty_boxes>=1?'var(--yellow)':'var(--red)';
      const boxes = s.qty_boxes%1===0?s.qty_boxes:s.qty_boxes.toFixed(1);
      stockHtml += `
      <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.1)">
        <div style="color:var(--gold);font-size:14px;font-weight:700;margin-bottom:6px">${esc(s.warehouse_name)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="mqty-sub" style="border:none;background:rgba(0,0,0,0.2)">
             <div class="num" style="color:${bc}">${esc(boxes)}</div>
             <div class="lbl">صندوق</div>
          </div>
          <div class="mqty-sub" style="border:none;background:rgba(0,0,0,0.2)">
             <div class="num">${esc(s.qty_pcs)}</div>
             <div class="lbl">قطعة</div>
          </div>
        </div>
      </div>
      `;
    });
  } else {
    stockHtml = '<div style="color:var(--muted);text-align:center;padding:15px;background:rgba(0,0,0,0.2);border-radius:10px;">غير متوفر في أي مستودع حالياً</div>';
  }

  document.getElementById('mq').innerHTML = stockHtml;
  document.getElementById('mq').style.display = 'block';

  document.getElementById('md').innerHTML=`
    <div class="mi2"><div class="ml">رمز الطرد</div><div class="mv">${esc(p.package_code||'—')}</div></div>
    <div class="mi2"><div class="ml">كود المادة</div><div class="mv" style="font-size:12px">${esc(p.code||'—')}</div></div>
    <div class="mi2"><div class="ml">تعبئة الصندوق</div><div class="mv" style="font-size:13px">${esc(p.box_fill)} قطعة</div></div>`;

  document.getElementById('ov').classList.add('on');
  window.location.hash = '#' + encodeURIComponent(p.key || buildItemKey(p));
}

function clsM(e){
  if(!e||e.target===document.getElementById('ov')||(e.target.classList && e.target.classList.contains('mcl'))){
    document.getElementById('ov').classList.remove('on');
    history.replaceState(null, null, ' ');
  }
}
function setF(f,btn){curF=f;document.querySelectorAll('.fb').forEach(b=>b.classList.remove('on'));btn.classList.add('on');run();}
function togSort(){
  sortByBoxes=!sortByBoxes;
  document.getElementById('sortBtn').style.color=sortByBoxes?'var(--gold)':'var(--muted)';
  run();
}
function clrS(){document.getElementById('si').value='';curQ='';document.getElementById('sc').style.display='none';run();}

let timer;
document.getElementById('si').addEventListener('input',function(){
  clearTimeout(timer);
  document.getElementById('sc').style.display=this.value?'block':'none';
  timer=setTimeout(()=>{curQ=this.value;run();},200);
});

// ===== ضغط الصور تلقائياً (تصغير الأبعاد + تحويل لـ JPEG بجودة عالية) =====
// الهدف: نفس الوضوح تقريباً للعين، بس حجم أصغر بعشرات المرات من صورة موبايل خام.
function compressImage(blob, maxDim=1000, quality=0.85){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxDim||h>maxDim){
        if(w>h){h=Math.round(h*maxDim/w);w=maxDim;}else{w=Math.round(w*maxDim/h);h=maxDim;}
      }
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b=>{
        const r=new FileReader();
        r.onload=()=>resolve({dataUrl:r.result, blob:b});
        r.onerror=reject;
        r.readAsDataURL(b);
      },'image/jpeg',quality);
    };
    img.onerror=reject;
    img.src=url;
  });
}

// ===== إضافة صورة لصنف بدون صورة (زر على الكارت) — عبر لصق Ctrl+V أو اختيار ملف =====
let imgPickerCode=null;
function openImgPicker(key){
  imgPickerCode=decodeURIComponent(key||'');
  const p=findByKey(imgPickerCode);
  document.getElementById('imgModalTitle').textContent='إضافة صورة — '+(p?p.name:'');
  document.getElementById('dzInner').innerHTML='<div class="dzicon">📋</div><div class="dztxt">اضغط هون وبعدين <b>Ctrl+V</b><br>أو دوس لاختيار ملف من جهازك</div>';
  document.getElementById('ovImg').classList.add('on');
  document.getElementById('dropzone').focus();
}
function closeImgModal(){
  document.getElementById('ovImg').classList.remove('on');
  imgPickerCode=null;
}
async function applyPickedImage(blob){
  const {blob:compressedBlob}=await compressImage(blob);
  const p=findByKey(imgPickerCode);
  if(!p) return;
  try{
    await uploadImageToServer(p.id, compressedBlob);
    await loadProductsFromDB();
    closeImgModal();
  }catch(err){
    console.error('فشل رفع الصورة', err);
    showToast('خطأ', err.message || 'فشل رفع الصورة', 'error');
  }
}
document.getElementById('cardImgInput').addEventListener('change', function(e){
  const file=e.target.files[0];
  if(!file || !imgPickerCode) return;
  applyPickedImage(file);
  e.target.value='';
});
// لصق من الحافظة (Ctrl+V) — يشتغل سواء كانت نافذة "إضافة صورة" مفتوحة، أو نموذج إضافة/تعديل صنف
document.addEventListener('paste', async function(e){
  const items=(e.clipboardData||window.clipboardData)?.items;
  if(!items) return;
  let imgItem=null;
  for(const it of items){ if(it.type && it.type.startsWith('image/')){ imgItem=it; break; } }
  if(!imgItem) return;
  const blob=imgItem.getAsFile();
  if(!blob) return;

  if(document.getElementById('ovImg').classList.contains('on') && imgPickerCode){
    e.preventDefault();
    await applyPickedImage(blob);
  } else if(document.getElementById('ov2').classList.contains('on')){
    e.preventDefault();
    const {dataUrl, blob:compressedBlob}=await compressImage(blob);
    formImageData=dataUrl;
    formImageBlob=compressedBlob;
    const prev=document.getElementById('f_preview');
    prev.src=dataUrl; prev.style.display='block';
  }
});

// ===== إضافة / تعديل صنف =====
let formImageData='';
let formImageBlob=null; // الصورة المضغوطة الجديدة (لسا ما انكتبت كملف) - بتنكتب فعلياً وقت الحفظ بـ saveForm

async function uploadImageToServer(productId, blob){
  const formData=new FormData();
  const ext=(blob.type.split('/')[1]||'jpg').toLowerCase();
  const safeExt=ext==='jpeg'?'jpg':ext;
  formData.append('image', blob, `image_${Date.now()}.${safeExt}`);
  const response=await fetch(`/api/products/${productId}/upload`, {
    method:'POST',
    headers: {'x-admin-key': adminToken},
    body:formData
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error || 'فشل رفع الصورة');
  return result;
}

async function saveProductToServer(payload, method='POST', productId=null){
  const response=await fetch(productId ? `/api/products/${productId}` : '/api/products', {
    method,
    headers:{'Content-Type':'application/json', 'x-admin-key': adminToken},
    body:JSON.stringify(payload)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error || 'فشل حفظ الصنف');
  return result;
}

function findSavedProduct(payload){
  const code=String(payload.code||'').trim();
  const warehouse=String(payload.warehouse||'').trim();
  const packageCode=String(payload.package_code||'').trim();
  const barcode=String(payload.barcode||'').trim();
  return DATA.find(d =>
    String(d.code||'').trim()===code &&
    String(d.warehouse||'').trim()===warehouse &&
    String(d.package_code||'').trim()===packageCode &&
    String(d.barcode||'').trim()===barcode
  );
}

function openAddForm(){
  curCode=null;
  fillForm({name:'',code:'',package_code:'',barcode:'',qty_pcs:0,box_fill:1,qty_boxes:0,warehouse:'مستودع 1',image_url:''});
  document.getElementById('formTitle').textContent='إضافة صنف جديد';
  document.getElementById('ov2').classList.add('on');
}
function openEditForm(code){
  const p=findByKey(curItemKey) || findByCode(code||curCode);
  if(!p) return;
  curCode=p.code;
  curItemKey=buildItemKey(p);
  fillForm(p);
  document.getElementById('formTitle').textContent='تعديل الصنف';
  document.getElementById('ov2').classList.add('on');
  document.getElementById('ov').classList.remove('on');
}
function fillForm(p){
  document.getElementById('f_name').value=p.name||'';
  document.getElementById('f_code').value=p.code||'';
  document.getElementById('f_package').value=p.package_code||'';
  document.getElementById('f_barcode').value=p.barcode||'';
  document.getElementById('f_qtypcs').value=p.qty_pcs||0;
  document.getElementById('f_boxfill').value=p.box_fill||1;
  document.getElementById('f_qtyboxes').value=p.qty_boxes||0;
  document.getElementById('f_warehouse').value=p.warehouse||'مستودع 1';
  document.getElementById('f_image').value='';
  formImageData=p.image_url||'';
  formImageBlob=null;
  const prev=document.getElementById('f_preview');
  if(formImageData){ prev.src=formImageData; prev.style.display='block'; }
  else { prev.src=''; prev.style.display='none'; }
}
document.getElementById('f_image').addEventListener('change', async function(e){
  const file=e.target.files[0];
  if(!file) return;
  const {dataUrl, blob}=await compressImage(file);
  formImageData=dataUrl;
  formImageBlob=blob;
  const prev=document.getElementById('f_preview');
  prev.src=dataUrl; prev.style.display='block';
});
function clsForm(){document.getElementById('ov2').classList.remove('on');}
async function saveForm(){
  const name=document.getElementById('f_name').value.trim();
  const code=document.getElementById('f_code').value.trim();
  if(!name||!code){ showToast('تنبيه', 'الاسم والكود مطلوبان', 'error'); return; }
  const qtyPcs=parseFloat(document.getElementById('f_qtypcs').value)||0;
  const boxFill=parseFloat(document.getElementById('f_boxfill').value)||1;
  const qtyBoxesInput=document.getElementById('f_qtyboxes').value;

  const payload={
    name,
    code,
    package_code: document.getElementById('f_package').value.trim()||'-',
    barcode: document.getElementById('f_barcode').value.trim(),
    qty_pcs: qtyPcs,
    box_fill: boxFill,
    qty_boxes: qtyBoxesInput!==''?parseFloat(qtyBoxesInput):+(qtyPcs/boxFill).toFixed(1),
    warehouse: document.getElementById('f_warehouse').value,
    image_url: ''
  };

  const duplicateNote=validateProductDuplication(payload);
  if(duplicateNote) showToast('تنبيه', duplicateNote, 'info');

  const existingProduct=findByKey(curItemKey) || findByCode(code);
  try{
    const saved = existingProduct
      ? await saveProductToServer(payload, 'PUT', existingProduct.id)
      : await saveProductToServer(payload, 'POST');

    if(formImageBlob){
      const productId = saved.id || existingProduct?.id;
      if(productId){ await uploadImageToServer(productId, formImageBlob); }
    }

    formImageData='';
    formImageBlob=null;
    clsForm();
    await loadProductsFromDB();
    const refreshed=findSavedProduct(payload);
    if(refreshed){
      curCode=refreshed.code;
      curItemKey=buildItemKey(refreshed);
      if(document.getElementById('ov').classList.contains('on')){
        opnM(refreshed);
      }
    }
    showToast('نجاح', 'تم الحفظ بنجاح', 'success');
  }catch(err){
    showToast('خطأ', err.message || 'فشل حفظ الصنف', 'error');
  }
}

// ===== تصدير نسخة محدّثة كملف HTML قائم بذاته =====
function exportUpdated(){
  document.getElementById('grid').innerHTML='';
  const marker='/*__CATALOG_EXPORT_MARKER__*/';
  const html='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  const newProducts=`${marker}\nconst PRODUCTS=${JSON.stringify(DATA)};\nconst IMAGES=${JSON.stringify(IMAGES)};`;
  const re=/\/\*__CATALOG_EXPORT_MARKER__\*\/\s*const PRODUCTS=\[[\s\S]*?\];\s*const IMAGES=\{[\s\S]*?\};/;
  let updated=html.replace(re, newProducts);
  if(updated===html){
    updated=html.replace(/<script>\s*const PRODUCTS=\[/, `<script>\n${newProducts}\n`);
  }
  const countInData = DATA.length;
  const countInExport = (updated.match(/"code"\s*:/g)||[]).length;
  let valid=countInExport >= countInData;
  if(!valid) {
    showToast('تحذير', 'تحذير: لم يتم حفظ جميع البيانات بشكل صحيح أثناء التصدير، يرجى إعادة المحاولة.', 'error');
  } else {
    showToast('نجاح', 'تم تصدير الكتالوج', 'success');
  }
  const blob=new Blob([updated],{type:'text/html;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  const ds=new Date().toISOString().slice(0,10);
  a.download='كتالوج_محدث_'+ds+'.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  run();
}

function updateStats(){
  document.getElementById('s1').textContent=`م1: ${DATA.filter(p=>p.warehouse==='مستودع 1').length}`;
  document.getElementById('s2').textContent=`م2: ${DATA.filter(p=>p.warehouse==='مستودع 2').length}`;
  document.getElementById('s3').textContent=`م3: ${DATA.filter(p=>p.warehouse==='مستودع 3').length}`;
}

function toggleMenu(button){
  const menu=document.getElementById('topMenu');
  const open=menu.classList.toggle('open');
  if(!open) return;
  menu.style.left='50%';
  menu.style.top='calc(100% + 8px)';
  menu.style.transform='translateX(-50%)';
  menu.style.position='absolute';
}

async function syncWarehousesBtn(){
  try{
    showToast('جاري المزامنة', 'جاري جلب ومطابقة البيانات...', 'info');
    const response=await fetch('/api/sync-warehouses', {
      method:'POST',
      headers: {'x-admin-key': adminToken}
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || 'فشل المزامنة');
    await loadProductsFromDB();
    if(result.summary) {
      showSyncReport(result.summary);
      showToast('اكتملت المزامنة', 'تم تحديث البيانات بنجاح', 'success');
    } else {
      showToast('اكتملت المزامنة', 'تم تحديث البيانات بنجاح', 'success');
    }
  }catch(err){
    console.error('فشل مزامنة المستودعات', err);
    showToast('خطأ في المزامنة', err.message || 'فشل المزامنة', 'error');
  }
}

function showWelcomeScreen(){
  const overlay=document.getElementById('welcomeOverlay');
  setTimeout(()=>hideWelcomeScreen(), 3500);
}
function hideWelcomeScreen(){
  const overlay=document.getElementById('welcomeOverlay');
  if(overlay) overlay.classList.add('hidden');
}

showWelcomeScreen();

/* ===================================================================
   إدارة مجلد الصور المحلي (File System Access API)
   الهدف: الصور تنحفظ كملفات منفصلة بمجلد images جنب ملف الـ HTML
   بدل ما تنضم base64 داخل الملف نفسه - هيك حجم الكتالوج بيضل خفيف
   =================================================================== */
let imagesDirectoryHandle=null;
let folderImageFiles=new Set();
const IMG_DB_NAME='catalogImagesDB', IMG_STORE='handles', IMG_HANDLE_KEY='imagesFolder';

function openHandleDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(IMG_DB_NAME,1);
    req.onupgradeneeded=()=>{ req.result.createObjectStore(IMG_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function saveHandleToDB(handle){
  const db=await openHandleDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IMG_STORE,'readwrite');
    tx.objectStore(IMG_STORE).put(handle, IMG_HANDLE_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function loadHandleFromDB(){
  const db=await openHandleDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IMG_STORE,'readonly');
    const req=tx.objectStore(IMG_STORE).get(IMG_HANDLE_KEY);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}

function setFolderStatus(connected){
  const el=document.getElementById('folder-status');
  if(!el) return;
  el.textContent=connected?'✅ مجلد الصور مربوط':'⚠️ مجلد الصور غير مربوط';
  el.style.color=connected?'#4ade80':'#ef4444';
}

async function refreshFolderImageIndex(){
  if(!imagesDirectoryHandle){ folderImageFiles.clear(); return; }
  try{
    folderImageFiles.clear();
    for await (const [name, handle] of imagesDirectoryHandle.entries()){
      if(handle?.kind==='file') folderImageFiles.add(name.toLowerCase());
    }
  }catch(err){ console.warn('لم نتمكن من قراءة محتويات المجلد', err); folderImageFiles.clear(); }
}

async function migrateLegacyImageToFile(p, skipConfirm=true){
  if(!imagesDirectoryHandle) return false;
  const current=(p.image_url||'').trim();
  if(!current || current.startsWith('images/')) return false;
  const isDataUrl=current.startsWith('data:image');
  const isHttpUrl=/^https?:\/\//i.test(current);
  if(!isDataUrl && !isHttpUrl) return false;

  try{
    const response=await fetch(current);
    if(!response.ok) throw new Error('bad response');
    const blob=await response.blob();
    const newPath=await saveImageToFolder(buildImageFileName(p), blob, skipConfirm);
    p.image_url=newPath;
    return true;
  }catch(err){
    console.warn('فشل تحويل الصورة القديمة إلى ملف', err);
    p.image_url='';
    return false;
  }
}

async function migrateLegacyImageUrls(){
  if(!imagesDirectoryHandle) return 0;
  let migrated=0;
  for(const p of DATA){
    if(!p.image_url) continue;
    if(p.image_url.startsWith('images/')) continue;
    if(await migrateLegacyImageToFile(p, true)) migrated++;
  }
  return migrated;
}

async function selectImagesFolder(){
  if(!('showDirectoryPicker' in window)){
    showToast('غير مدعوم', 'هاد المتصفح ما بيدعم ربط المجلدات مباشرة (بتشتغل هاي الميزة على Chrome/Edge بس). الصور رح تنحفظ داخل ملف الكتالوج كالمعتاد.', 'info');
    return;
  }
  try{
    const handle=await window.showDirectoryPicker();
    const granted=await handle.requestPermission({mode:'readwrite'});
    if(granted!=='granted'){ showToast('تنبيه', 'لازم توافق على صلاحية الكتابة حتى تنحفظ الصور بالمجلد.', 'error'); return; }
    imagesDirectoryHandle=handle;
    await refreshFolderImageIndex();
    await saveHandleToDB(handle);
    setFolderStatus(true);
    run();
  }catch(err){ console.warn('لم يتم اختيار المجلد', err); }
}

async function tryRestoreImagesFolder(){
  if(!('showDirectoryPicker' in window)){ setFolderStatus(false); return; }
  try{
    const saved=await loadHandleFromDB();
    if(!saved){ setFolderStatus(false); return; }
    let perm=await saved.queryPermission({mode:'readwrite'});
    if(perm!=='granted') perm=await saved.requestPermission({mode:'readwrite'});
    if(perm==='granted'){ imagesDirectoryHandle=saved; await refreshFolderImageIndex(); setFolderStatus(true); }
    else setFolderStatus(false);
  }catch(err){ console.warn('ما قدرنا نسترجع ربط المجلد تلقائياً', err); setFolderStatus(false); }
}

/* بتكتب الصورة كملف بمجلد images وبترجع المسار النسبي حتى نخزنه بـ image_url
   skipConfirm=true بتستخدم بالهجرة الجماعية حتى ما يطلع تأكيد لكل صورة عصورة */
async function saveImageToFolder(stem, blob, skipConfirm){
  const extRaw=(blob.type.split('/')[1]||'jpg').toLowerCase();
  const ext=extRaw==='jpeg'?'jpg':extRaw;
  const fileName=`${safeImageNamePart(stem)}.${ext}`;

  let exists=false;
  try{ await imagesDirectoryHandle.getFileHandle(fileName,{create:false}); exists=true; }catch{ exists=false; }

  if(exists && !skipConfirm){
    const ok=confirm(`في صورة موجودة مسبقاً للصنف ${stem}. استبدالها؟`);
    if(!ok) return `images/${fileName}`;
  }

  const fh=await imagesDirectoryHandle.getFileHandle(fileName,{create:true});
  const writable=await fh.createWritable();
  await writable.write(blob);
  await writable.close();
  return `images/${fileName}`;
}

/* هجرة لمرة وحدة: تفريغ كل الصور المضمّنة حالياً (base64 بحقل image_url لأي صنف،
   وكمان IMAGES القديمة المشتركة برمز الطرد) لملفات منفصلة باسم كود الصنف.
   بعدها IMAGES القديمة بتنفضّى تماماً وحجم الكتالوج بينزل بشكل كبير عند التصدير. */
async function migrateAllImagesToFiles(){
  if(!imagesDirectoryHandle){ showToast('تنبيه', 'اربط مجلد الصور أولاً من زر 📁.', 'error'); return; }
  if(!confirm('رح ينقل كل الصور المضمّنة حالياً بالكتالوج لملفات منفصلة بمجلد images، وبيخفف حجم الكتالوج بشكل كبير عند التصدير. متابعة؟')) return;

  let migrated=0, failed=0;
  for(const p of DATA){
    let sourceDataUrl=null;
    if(p.image_url && p.image_url.startsWith('data:image')){
      sourceDataUrl=p.image_url;
    } else if(!p.image_url){
      const k=(p.package_code||'').toUpperCase();
      if(IMAGES[k]) sourceDataUrl=IMAGES[k];
    }
    if(!sourceDataUrl) continue;
    try{
      const res=await fetch(sourceDataUrl);
      const blob=await res.blob();
      p.image_url=await saveImageToFolder(buildImageFileName(p), blob, true);
      migrated++;
    }catch(err){ failed++; console.error('فشل نقل صورة الصنف '+p.code, err); }
  }

  for(const k in IMAGES) delete IMAGES[k]; // تفريغ الصور المشتركة القديمة بعد ما انسخت لملفات فردية

  run();
  showToast('تمت الهجرة', `تم نقل ${migrated} صورة لملفات منفصلة${failed?(' (فشل نقل '+failed+')'):''}. اضغط 💾 تصدير لحفظ نسخة الكتالوج الجديدة الخفيفة.`, 'success');
}

async function initializeImages(){
  await tryRestoreImagesFolder();
  const migrated=await migrateLegacyImageUrls();
  if(migrated) console.log(`تم تحويل ${migrated} صور قديمة إلى ملفات محلية`);
  run();
}
initializeImages();
bindGridEvents();

/* حذف صورة الصنف المفتوح حالياً بالنافذة المنبثقة - بيحذف المرجع من البيانات
   وكمان الملف الفعلي من مجلد images إذا كانت الصورة محفوظة محلياً والمجلد مربوط */
async function deleteCurrentImage(){
  const p=findByKey(curItemKey) || findByCode(curCode);
  if(!p){ return; }
  const imageIds=Array.isArray(p.image_ids)?p.image_ids:[];
  const firstImageId=imageIds[0];
  if(!firstImageId){ showToast('تنبيه', 'لا توجد صورة لهاد الصنف أساساً.', 'error'); return; }
  if(!confirm(`متأكد إنك بدك تحذف صورة الصنف "${p.name}"؟`)) return;

  try{
    const response=await fetch(`/api/products/${p.id}/images/${firstImageId}`, {
      method:'DELETE',
      headers: {'x-admin-key': adminToken}
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || 'فشل حذف الصورة');
    await loadProductsFromDB();
    const refreshed=findByKey(curItemKey) || findByCode(curCode);
    if(refreshed && document.getElementById('ov').classList.contains('on')){
      opnM(refreshed);
    }
  }catch(err){
    console.error('فشل حذف الصورة', err);
    showToast('خطأ', err.message || 'فشل حذف الصورة', 'error');
  }
}
