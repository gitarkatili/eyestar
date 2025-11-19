/* ========= CONFIG ========= */
// IMPORTANT: set this to your deployed Apps Script Web App URL.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxJfW_5cRc4mpjuXDgrjmGdLMIdFpQlRn6rV4VUciRu71hMo8W_i3RcPJj4TtzsCFjF/exec';
const QR_MODE = 'code'; // keep raw code inside QR

/* ========= UTILITIES ========= */
function $(sel){ return document.querySelector(sel); }
function generateId(){
  const rand = crypto.getRandomValues(new Uint32Array(2));
  const partA = rand[0].toString(36).slice(-4).toUpperCase();
  const partB = rand[1].toString(36).slice(-4).toUpperCase();
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `EYS-${ts}-${partA}-${partB}`;
}
function showToast(txt){
  let t=$('#toast');
  if(!t){
    t=document.createElement('div');
    t.id='toast';
    t.className='fixed top-4 left-1/2 -translate-x-1/2 z-50';
    t.innerHTML='<div class="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm shadow-lg"></div>';
    document.body.appendChild(t);
  }
  t.firstElementChild.textContent=txt;
  t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'),1500);
}

/* ========= API HELPERS ========= */
async function apiGet(params){
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k,v])=> url.searchParams.set(k,v));
  const res = await fetch(url.toString(), { method:'GET' });
  if (!res.ok) throw new Error('GET failed');
  return res.json();
}
function apiPost(payload){
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_URL.startsWith('http')) {
    console.warn('APPS_SCRIPT_URL not set; skipping remote write.');
    return Promise.resolve();
  }
  return fetch(APPS_SCRIPT_URL, {
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
}

/* ========= QR HELPERS ========= */
let qrcodeInstance=null;
function buildQR(data){
  const box=$('#qr');
  if(!box) return false;
  if (typeof QRCode !== 'function') {
    console.error('QRCode lib missing.');
    $('#qrError')?.classList.remove('hidden');
    return false;
  }
  box.innerHTML='';
  qrcodeInstance = new QRCode(box, {
    text:data, width:220, height:220, colorDark:'#0f172a', colorLight:'#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  $('#qrHint')?.remove();
  return true;
}
function downloadQR(filename){
  const box=$('#qr');
  const canvas=box?.querySelector('canvas');
  const img=box?.querySelector('img');
  const dataUrl= canvas? canvas.toDataURL('image/png') : (img? img.src : '');
  if(!dataUrl){ console.warn('QR not ready'); return; }
  const a=document.createElement('a');
  a.href=dataUrl; a.download=filename||'qr.png'; a.click();
}

/* ========= LANDING ========= */
function initLanding(){
  const form=$('#gaeForm'); if(!form) return;

  const msg=$('#formMsg');
  const codeInput=$('#couponCode');
  const copyBtn=$('#copyBtn');
  const dlBtn=$('#downloadQrBtn');
  const qrError=$('#qrError');

  // WhatsApp button: build link at runtime so number doesn't appear in source
  const wh = ['+','90','532','353','9604'].join('');
  const whBtn = $('#whBtn');
  if (whBtn) whBtn.href = 'https://wa.me/' + wh.replace(/\D/g,'');

  // “Get my code” CTA: show arrow & flash card a few times
  const btnGet = $('#btnGetCode');
  const card = $('#get-code');
  const arrow = $('#ctaArrow');
  if (btnGet && card && arrow){
    btnGet.addEventListener('click', ()=>{
      arrow.classList.remove('hidden');
      card.classList.add('animate-flash');
      setTimeout(()=>{ arrow.classList.add('hidden'); card.classList.remove('animate-flash'); }, 3500);
    });
  }

  // Reset clears UI only
  $('#resetBtn').addEventListener('click', ()=>{
    form.reset();
    codeInput.value='';
    $('#qr').innerHTML='<span id="qrHint" class="text-xs text-slate-400">Will appear here</span>';
    msg.classList.add('hidden');
    copyBtn.disabled=true;
    dlBtn.disabled=true;
  });

  copyBtn.addEventListener('click', async ()=>{
    if (!codeInput.value) return;
    await navigator.clipboard.writeText(codeInput.value);
    showToast('Code copied');
  });

  dlBtn.addEventListener('click', ()=> downloadQR(codeInput.value + '.png'));

  // Submit: generate code & QR immediately; then fire-and-forget write to Apps Script
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    msg.classList.remove('hidden');
    msg.textContent='Generating your code…';
    msg.className='mt-2 text-sm text-slate-700';

    if(!form.reportValidity()){
      msg.textContent='Please complete all required fields.';
      msg.className='mt-2 text-sm text-red-600';
      return;
    }

    const fd=new FormData(form);
    const payload=Object.fromEntries(fd.entries());
    payload.createdAt=new Date().toISOString();
    payload.code=generateId();
    codeInput.value=payload.code;

    const ok = buildQR(payload.code);
    if(!ok){
      msg.textContent='Could not render the QR (library missing). The code is still generated.';
      msg.className='mt-2 text-sm text-amber-700';
      return;
    }
    copyBtn.disabled=false;
    dlBtn.disabled=false;

    try{
      await apiPost({
        action:'registerGAE',
        firstName:payload.firstName,
        lastName:payload.lastName,
        email:payload.email,
        phone:payload.phone,
        location:payload.location,
        couponCode:payload.code
      });
      msg.textContent='Your code is ready! Share the code or QR with your friends.';
      msg.className='mt-2 text-sm text-emerald-700';
    }catch(err){
      console.error(err);
      msg.textContent='Code generated. Could not reach the database right now.';
      msg.className='mt-2 text-sm text-amber-700';
    }
  });
}

/* ========= CANDIDATE ========= */
function initCandidate(){
  const form=$('#candidateLookupForm'); if(!form) return;
  const msg=$('#candidateMsg');
  const stats=$('#candidateStats');
  const input=$('#candidateCoupon');

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    msg.textContent='Loading…';
    msg.className='text-sm text-slate-600';
    try{
      const data = await apiGet({ action:'gaeStats', couponCode: input.value.trim() });
      stats.innerHTML = `<div class="text-sm">
        Completed: <b>${data.totalCompleted||0}</b> |
        Ineligible: <b>${data.totalIneligible||0}</b> |
        Pending: <b>${data.totalPending||0}</b> |
        Total Credit: <b>${data.totalCredit||0}</b>
      </div>`;
      msg.textContent=''; msg.className='hidden';
    }catch(e){
      console.error(e);
      msg.textContent='Failed to load. Check your code and try again.';
      msg.className='text-sm text-red-600';
    }
  });
}

/* ========= INIT ========= */
document.addEventListener('DOMContentLoaded', ()=>{
  initLanding();
  initCandidate();
});
