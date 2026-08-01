
/* ============================================================
   CONFIG
   ============================================================ */
// const SHEET_ID = "1zrhLerx15lT8xp55OzhXA5M5k7eDd9aW"; // local test sheet
const SHEET_ID = "1PHBmq5O0yvU87yrlBbJ-inuWTGJMLNYgHnfZ0IXBS7I"; // live sheet
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
// const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzoIp8TjW-1Ep8OqwPYDejn6Nc5mrB9pL-kM9F3jInPXRoYTV0aqOJ6ZZArYOA4WCPNg/exec"; // local test sheet
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzdqH02gUYfWAcH2KRUat6yLT2SmHQQV4RkK_DHmVGQXMbPF_Ekzo5d5-0NH0RwGLVFeg/exec"; // live sheet
const DATA_SOURCE_MODE = "apps-script"; // apps-script | direct-sheet | auto
const REFRESH_MS = 300 * 60 * 1000;

const PALETTE = ['#1E8E5A','#2F6FE0','#A98A1E','#1F3A5F','#6C4FD1','#D64545','#1E9E96','#8A8F98','#C9862C','#4B6F44'];
const LOG_PAGE_SIZE = 25;

/* ============================================================
   STATE
   ============================================================ */
let ALL_ROWS = [];
let charts = {};
let logPage = 1;
let logRowsCache = [];
let trendYMax = 1;
const FILTERS = { observer:'All', designation:'All', status:'All', search:'', category:null, location:null, quick:null, _sev:null };

/* ============================================================
   HELPERS
   ============================================================ */
function setSync(bad, text){
  const dot = document.getElementById('syncDot');
  const syncText = document.getElementById('syncText');
  if(dot) dot.className = 'dot' + (bad?' bad':'');
  if(syncText) syncText.textContent = text;
}
function showBanner(html){ const b=document.getElementById('banner'); b.innerHTML=html; b.style.display='block'; }
function hideBanner(){ document.getElementById('banner').style.display='none'; }
function formatTrendLabel(date){
  return [
    new Intl.DateTimeFormat('en-US', {weekday:'short'}).format(date),
    new Intl.DateTimeFormat('en-US', {day:'2-digit', month:'short'}).format(date),
  ];
}
function formatTrendTitle(date){
  return new Intl.DateTimeFormat('en-US', {weekday:'long', year:'numeric', month:'short', day:'2-digit'}).format(date);
}
function normLoc(loc){ return (loc||'').replace(/\(.*?\)/g,'').trim().replace(/\s+/g,' ').toUpperCase(); }
function natureOf(type){
  const t=(type||'').toLowerCase();
  if(t.includes('positive')) return 'positive';
  if(t.includes('near miss')) return 'nearmiss';
  return 'unsafe';
}
function isPositive(type){ return natureOf(type)==='positive'; }
function isOpenStatus(status){ return /open/i.test(status||''); }
function isCorrected(text){ return /^\s*yes/i.test(text||''); }
function sevColor(s){
  if(s===null || s===undefined) return '#B9BEC6';
  return s>=5?'#7A2E24':s===4?'#B23A2E':s===3?'#D64545':s===2?'#A98A1E':'#1E8E5A';
}
function parseDate(str){
  if(!str) return null;
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d;
}
function monthKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function monthLabel(k){
  const [y,m] = k.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1] + ' ' + y.slice(2);
}
function weekKey(d){
  const onejan = new Date(d.getFullYear(),0,1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay()+1)/7);
  return d.getFullYear()+'-W'+String(week).padStart(2,'0');
}

function setLogPage(page){
  logPage = Math.max(1, page);
  renderAll();
}

function buildPager(totalPages){
  if(totalPages <= 1) return '';
  const pages = [];
  const pushPage = (value, label = String(value), disabled = false, active = false) => {
    pages.push(`<button class="pager-btn ${active ? 'active' : ''}" data-page="${value}" ${disabled ? 'disabled' : ''}>${label}</button>`);
  };

  pushPage(logPage - 1, 'Prev', logPage === 1);

  const visible = new Set([1, totalPages, logPage - 1, logPage, logPage + 1]);
  const ordered = Array.from(visible).filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  let last = 0;
  ordered.forEach(page => {
    if(page - last > 1){
      if(page - last === 2){
        pages.push(`<button class="pager-btn" data-page="${last + 1}">${last + 1}</button>`);
      } else {
        pages.push('<span class="pager-ellipsis">…</span>');
      }
    }
    pages.push(`<button class="pager-btn ${page === logPage ? 'active' : ''}" data-page="${page}">${page}</button>`);
    last = page;
  });

  pushPage(logPage + 1, 'Next', logPage === totalPages);
  return pages.join('');
}

function openReportModal(row){
  const modal = document.getElementById('reportModal');
  const body = document.getElementById('reportModalBody');
  const title = document.getElementById('reportModalTitle');
  if(!modal || !body || !title) return;
  const nature = natureOf(row.type);
  const natureLabel = nature==='positive'?'Positive':'Near miss';
  title.textContent = `${row.observer || 'Observation'} · ${row.location || 'Report'}`;
  const section = (key, titleText, bodyHtml, open=true) => `
    <section class="report-section ${open ? 'open' : 'collapsed'}" data-section="${key}">
      <div class="report-section-head">
        <div>
          <h3>${titleText}</h3>
        </div>
        <button type="button" class="report-section-toggle" data-section-toggle="${key}" aria-expanded="${open ? 'true' : 'false'}">${open ? '▾' : '▸'}</button>
      </div>
      <div class="report-section-body">
        ${bodyHtml}
      </div>
    </section>`;

  body.innerHTML = `
    <div class="modal-meta">
      <span class="pill ${nature}">${natureLabel}</span>
      <span class="modal-meta-item"><b>Date</b>${escapeHtml(row.dateObs || '—')}</span>
      <span class="modal-meta-item"><b>Status</b>${escapeHtml(row.status || '—')}</span>
      <span class="modal-meta-item"><b>Severity</b>${row.severity ? 'Level ' + row.severity : 'Not specified'}</span>
    </div>
    ${section('summary', 'Summary', `
      <div class="detail-grid modal-grid">
        <p><b>Observer</b>${escapeHtml(row.observer || '—')}</p>
        <p><b>Designation</b>${escapeHtml(row.designation || '—')}</p>
        <p><b>Location</b>${escapeHtml(row.location || '—')}</p>
        <p><b>Responsible person</b>${escapeHtml(row.responsible || '—')}</p>
      </div>
    `)}
    ${section('observation', 'Observation Details', `
      <div class="detail-grid modal-grid">
        <p><b>Findings</b>${escapeHtml(row.what || '—')}</p>
        <p><b>Immediate action</b>${escapeHtml(row.immediateAction || '—')}</p>
        <p><b>Corrected on the spot</b>${escapeHtml(row.correctedOnSpot || '—')}</p>
        <p><b>Corrective action taken</b>${escapeHtml(row.correctiveAction || '—')}</p>
      </div>
    `)}
    ${section('evidence', 'Evidence & Closeout', `
      <div>
        <p><b>Photo / Evidence / Closeout</b></p>
        ${renderEvidencePreviewCards(row.evidenceUrls)}
      </div>
    `)}
  `;
  Array.from(body.querySelectorAll('.report-section-toggle')).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const sectionEl = btn.closest('.report-section');
      if(!sectionEl) return;
      const isCollapsed = sectionEl.classList.toggle('collapsed');
      sectionEl.classList.toggle('open', !isCollapsed);
      btn.textContent = isCollapsed ? '▸' : '▾';
      btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    });
  });
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeReportModal(){
  const modal = document.getElementById('reportModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function extractEvidenceUrls(text){
  if(!text) return [];
  const matches = String(text).match(/https?:\/\/[^\s,]+/g) || [];
  const cleaned = matches.map(u=>u.trim().replace(/[)\]\}"']+$/,'')).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function getDriveFileId(url){
  if(!url) return null;
  const byQuery = /[?&]id=([^&]+)/.exec(url);
  if(byQuery && byQuery[1]) return byQuery[1];
  const byPath = /\/file\/d\/([^/]+)/.exec(url);
  if(byPath && byPath[1]) return byPath[1];
  return null;
}

function getEvidencePreviewUrl(url){
  const fileId = getDriveFileId(url);
  if(fileId) return `https://drive.google.com/uc?export=view&id=${fileId}`;
  return url;
}

function isLikelyImageUrl(url){
  if(!url) return false;
  if(/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url)) return true;
  return !!getDriveFileId(url);
}

function escapeHtml(text){
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyCanvasBitmap(sourceCanvas, targetCanvas){
  if(!sourceCanvas || !targetCanvas) return;
  const sourceRect = sourceCanvas.getBoundingClientRect();
  const width = sourceCanvas.width || Math.max(1, Math.round(sourceRect.width));
  const height = sourceCanvas.height || Math.max(1, Math.round(sourceRect.height));
  targetCanvas.width = width;
  targetCanvas.height = height;
  const context = targetCanvas.getContext('2d');
  if(!context) return;
  context.clearRect(0, 0, width, height);
  context.drawImage(sourceCanvas, 0, 0, width, height);
}

function openPanelModal(targetId){
  const source = document.getElementById(targetId);
  const modal = document.getElementById('panelModal');
  const body = document.getElementById('panelModalBody');
  const title = document.getElementById('panelModalTitle');
  if(!source || !modal || !body || !title) return;

  const panel = source.closest('.t-panel');
  if(!panel) return;

  const clone = panel.cloneNode(true);
  clone.querySelectorAll('.panel-maximize-btn').forEach(btn=>btn.remove());
  clone.querySelectorAll('canvas').forEach((canvas, index)=>{
    const sourceCanvas = panel.querySelectorAll('canvas')[index];
    copyCanvasBitmap(sourceCanvas, canvas);
  });

  const headText = panel.querySelector('.panel-head-main')?.textContent || panel.querySelector('.panel-head')?.textContent || 'Report view';
  title.textContent = headText.trim();
  body.innerHTML = '';
  body.appendChild(clone);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closePanelModal(){
  const modal = document.getElementById('panelModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function renderEvidenceLinksHtml(urls){
  if(!urls || !urls.length) return '—';
  return `<div class="evidence-links">${urls.map((url, idx)=>{
    const safe = escapeHtml(url);
    return `<button type="button" class="evidence-link" data-url="${safe}">Evidence ${idx + 1}</button>`;
  }).join('')}</div>`;
}

function renderEvidencePreviewCards(urls){
  if(!urls || !urls.length) return '<p>—</p>';
  return `<div class="evidence-preview-grid">${urls.map((url, idx)=>{
    const safe = escapeHtml(url);
    const preview = escapeHtml(getEvidencePreviewUrl(url));
    const thumb = isLikelyImageUrl(url)
      ? `<img class="evidence-thumb" src="${preview}" alt="Evidence ${idx + 1}" loading="lazy">`
      : '<div class="evidence-thumb evidence-thumb-file">Open evidence</div>';
    return `<button type="button" class="evidence-preview-item evidence-link" data-url="${safe}">${thumb}<span>Evidence ${idx + 1}</span></button>`;
  }).join('')}</div>`;
}

function openEvidenceModal(url){
  const modal = document.getElementById('evidenceModal');
  const body = document.getElementById('evidenceModalBody');
  const title = document.getElementById('evidenceModalTitle');
  if(!modal || !body || !title) return;

  const previewUrl = getEvidencePreviewUrl(url);
  const safeOriginal = escapeHtml(url);
  const safePreview = escapeHtml(previewUrl);
  title.textContent = 'Observation evidence';

  if(isLikelyImageUrl(url)){
    body.innerHTML = `
      <div class="evidence-view-wrap">
        <img class="evidence-view" src="${safePreview}" alt="Observation evidence" loading="lazy">
      </div>
      <a class="evidence-open-link" href="${safeOriginal}" target="_blank" rel="noopener noreferrer">Open original link</a>
    `;
  } else {
    body.innerHTML = `
      <a class="evidence-open-link" href="${safeOriginal}" target="_blank" rel="noopener noreferrer">Open evidence link in new tab</a>
    `;
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeEvidenceModal(){
  const modal = document.getElementById('evidenceModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function parseRows(csvText){
  const parsed = Papa.parse(csvText, {header:true, skipEmptyLines:true});
  return parsed.data.map(r=>{
    const keys = Object.keys(r);
    const find = (needle) => { const k = keys.find(k=>k.toLowerCase().includes(needle)); return k?(r[k]||'').trim():''; };
    return {
      dateObs: find('date and time of observation') || find('timestamp'),
      location: find('location of observation') || find('location'),
      observer: find("observer's name") || find('observer name') || 'Unknown',
      type: find('type of observation'),
      what: find('what specifically'),
      category: find('category of unsafe'),
      severity: (()=>{ const n=parseInt(find('severity potential')); return isNaN(n)?null:Math.min(Math.max(n,1),5); })(),
      immediateAction: find('immediate action'),
      correctedOnSpot: find('corrected on the spot'),
      evidenceRaw: find('photo or evidence/closeout'),
      evidenceUrls: extractEvidenceUrls(find('photo or evidence/closeout')),
      responsible: find('responsible person'),
      correctiveAction: find('corrective action taken'),
      designation: find('observer designation') || 'N/A',
      status: find('status - open') || find('status') || 'Closed',
    };
  }).filter(r=>r.location);
}

function parseRowsFromObjects(flat){
  if(!Array.isArray(flat)) return [];
  return flat.map(r=>{
    const keys = Object.keys(r || {});
    const find = (needle) => {
      const k = keys.find(key => String(key).toLowerCase().includes(needle));
      return k ? String(r[k] ?? '').trim() : '';
    };
    const sev = parseInt(find('severity potential'), 10);
    return {
      dateObs: find('date and time of observation') || find('timestamp'),
      location: find('location of observation') || find('location'),
      observer: find("observer's name") || find('observer name') || 'Unknown',
      type: find('type of observation'),
      what: find('what specifically'),
      category: find('category of unsafe'),
      severity: Number.isNaN(sev) ? null : Math.min(Math.max(sev,1),5),
      immediateAction: find('immediate action'),
      correctedOnSpot: find('corrected on the spot'),
      evidenceRaw: find('photo or evidence/closeout'),
      evidenceUrls: extractEvidenceUrls(find('photo or evidence/closeout')),
      responsible: find('responsible person'),
      correctiveAction: find('corrective action taken'),
      designation: find('observer designation') || 'N/A',
      status: find('status - open') || find('status') || 'Closed',
    };
  }).filter(r=>r.location);
}

function parseRowsFromGviz(gviz){
  const table = gviz && gviz.table;
  if(!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) return [];
  const headers = table.cols.map((c, i)=> (c && (c.label || c.id)) ? String(c.label || c.id).trim() : `col_${i}`);
  const cellText = (cell)=>{
    if(!cell) return '';
    if(cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
    if(cell.v === undefined || cell.v === null) return '';
    return String(cell.v).trim();
  };

  const flat = table.rows.map(row=>{
    const item = {};
    headers.forEach((h, i)=>{ item[h] = cellText(row.c && row.c[i]); });
    return item;
  });

  return parseRowsFromObjects(flat);
}

function loadRowsFromGvizJsonp(){
  return new Promise((resolve, reject)=>{
    const cbName = `__gviz_cb_${Date.now()}_${Math.floor(Math.random()*1000000)}`;
    const script = document.createElement('script');
    let done = false;

    const clean = ()=>{
      if(script.parentNode) script.parentNode.removeChild(script);
      try { delete window[cbName]; } catch(_){ window[cbName] = undefined; }
    };

    const timeout = setTimeout(()=>{
      if(done) return;
      done = true;
      clean();
      reject(new Error('GViz request timed out'));
    }, 15000);

    window[cbName] = (response)=>{
      if(done) return;
      done = true;
      clearTimeout(timeout);
      clean();
      try{
        resolve(parseRowsFromGviz(response));
      }catch(parseErr){
        reject(parseErr);
      }
    };

    script.onerror = ()=>{
      if(done) return;
      done = true;
      clearTimeout(timeout);
      clean();
      reject(new Error('GViz script failed to load'));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${cbName}`;
    document.head.appendChild(script);
  });
}

async function loadRowsFromAppsScript(){
  const res = await fetch(APPS_SCRIPT_URL, {cache:'no-store'});
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const payload = await res.json();
  const rows = parseRowsFromObjects(payload);
  if(!rows.length) throw new Error('No rows parsed from Apps Script');
  return rows;
}

async function loadRowsFromDirectSheet(){
  if(window.location.protocol === 'file:' || window.location.origin === 'null'){
    throw new Error('direct-sheet mode requires HTTP(S) hosting. Opening index.html via file:// is blocked by browser CORS for Google CSV export.');
  }

  try{
    const res = await fetch(CSV_URL, {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if(text.trim().startsWith('<')) throw new Error('Sheet returned a sign-in page, not CSV');
    const rows = parseRows(text);
    if(!rows.length) throw new Error('No rows parsed');
    return rows;
  }catch(err){
    const message = err && err.message ? err.message : String(err);
    throw new Error(`direct-sheet load failed: ${message}`);
  }
}

function applyLoadedRows(rows, sourceLabel){
  ALL_ROWS = rows;
  hideBanner();
  document.getElementById('sourceNote').textContent = sourceLabel;
  populateDropdowns();
  syncDropdowns();
  renderAll();
  setSync(false, 'Data loaded ' + new Date().toLocaleTimeString());
}

/* ============================================================
   FILTERING
   ============================================================ */
function rowMatchesCategory(r, cat){ return (r.category||'').split(',').map(s=>s.trim()).includes(cat); }
function getFilteredRows(){
  return ALL_ROWS.filter(r=>{
    if(FILTERS.observer!=='All' && r.observer!==FILTERS.observer) return false;
    if(FILTERS.designation!=='All' && r.designation!==FILTERS.designation) return false;
    if(FILTERS.status!=='All'){
      const wantOpen = FILTERS.status==='Open';
      if(isOpenStatus(r.status)!==wantOpen) return false;
    }
    if(FILTERS.search){
      const hay = (r.what+' '+r.category+' '+r.location+' '+r.observer).toLowerCase();
      if(!hay.includes(FILTERS.search.toLowerCase())) return false;
    }
    if(FILTERS.category && !rowMatchesCategory(r, FILTERS.category)) return false;
    if(FILTERS.location && normLoc(r.location)!==FILTERS.location) return false;
    if(FILTERS.quick==='unsafe' && isPositive(r.type)) return false;
    if(FILTERS.quick==='positive' && !isPositive(r.type)) return false;
    if(FILTERS._sev){
      if(FILTERS._sev==='NA'){ if(r.severity!==null) return false; }
      else if(r.severity!==FILTERS._sev) return false;
    }
    return true;
  });
}

function renderChips(){
  const chips = [];
  if(FILTERS.category) chips.push(['Category: '+FILTERS.category, ()=>{FILTERS.category=null; renderAll();}]);
  if(FILTERS.location) chips.push(['Location: '+FILTERS.location, ()=>{FILTERS.location=null; renderAll();}]);
  if(FILTERS.quick) chips.push([FILTERS.quick==='unsafe'?'Quick: Unsafe only':'Quick: Positive only', ()=>{FILTERS.quick=null; renderAll();}]);
  if(FILTERS._sev) chips.push(['Severity: '+(FILTERS._sev==='NA'?'N/A':'Sev '+FILTERS._sev), ()=>{FILTERS._sev=null; renderAll();}]);
  const row = document.getElementById('chipRow');
  row.innerHTML = chips.map((c,i)=>`<span class="chip-x">${c[0]}<button data-i="${i}">âœ•</button></span>`).join('');
  Array.from(row.querySelectorAll('button')).forEach((btn,i)=>btn.addEventListener('click', chips[i][1]));
}

/* ============================================================
   MAIN RENDER PIPELINE
   ============================================================ */
function renderAll(){
  const rows = getFilteredRows();
  renderChips();
  renderKpis(rows);
  renderTrend(rows);
  renderCategoryDonut(rows);
  renderDesignation(rows);
  renderTopReporters(rows);
  renderSeverity(rows);
  renderHotspots(rows);
  renderCadence(rows);
  renderMonthly(rows);
  renderRateAndAging(rows);
  renderTable(rows);
  document.getElementById('logCount').textContent = rows.length + ' shown of ' + ALL_ROWS.length;
}

function svgIcon(path, extra){ return `<svg class="ic" style="${extra||''}" viewBox="0 0 24 24">${path}</svg>`; }
const ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>',
  warn: '<path d="M12 3l9 16H3L12 3z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5L16 9"/>'
};

function renderKpis(rows){
  const total = ALL_ROWS.length;
  const shown = rows.length;
  const positive = rows.filter(r=>isPositive(r.type)).length;
  const unsafe = shown - positive;
  const closed = rows.filter(r=>!isOpenStatus(r.status)).length;
  const closureRate = shown ? ((closed/shown)*100).toFixed(1) : '0.0';
  const pctPositive = shown ? Math.round(100*positive/shown) : 0;
  const pctUnsafe = shown ? Math.round(100*unsafe/shown) : 0;

  const cards = [
    {cls:'k-blue', quick:null, icon:ICONS.doc, badge:null, num:shown, lbl:'TOTAL REPORTS', cap:`${total} database entries`},
    {cls:'k-green', quick:'positive', icon:ICONS.shield, badge:pctPositive+'%', num:positive, lbl:'SAFE PRACTICES', cap:'Positive observations'},
    {cls:'k-red', quick:'unsafe', icon:ICONS.warn, badge:pctUnsafe+'%', num:unsafe, lbl:'UNSAFE ACTS', cap:'Corrective actions needed'},
    {cls:'k-olive', quick:null, icon:ICONS.check, badge:null, num:closureRate+'%', lbl:'CLOSURE RATE', cap:`${closed} issues resolved`},
  ];
  document.getElementById('kpiRow').innerHTML = cards.map(c=>`
    <div class="kpi ${c.cls} ${FILTERS.quick===c.quick && c.quick ? 'active':''}" data-quick="${c.quick||''}">
      <div class="kpi-top"><div class="kpi-ic">${svgIcon(c.icon,'width:15px;height:15px')}</div>${c.badge?`<div class="kpi-badge">${c.badge}</div>`:''}</div>
      <div class="num">${c.num}</div>
      <div class="lbl">${c.lbl}</div>
      <div class="cap">${c.cap}</div>
    </div>`).join('');
  Array.from(document.querySelectorAll('.kpi')).forEach(el=>{
    const q = el.getAttribute('data-quick');
    if(q){ el.addEventListener('click', ()=>{ FILTERS.quick = FILTERS.quick===q ? null : q; renderAll(); }); }
  });
}

function renderTrend(rows){
  const byDay = new Map();
  rows.forEach(r=>{
    const d = parseDate(r.dateObs);
    if(!d) return;
    const key = d.toISOString().slice(0,10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  });
  const days = Array.from(byDay.keys()).sort();
  const labels = days.map(day => formatTrendLabel(new Date(day + 'T00:00:00')));
  const titles = days.map(day => formatTrendTitle(new Date(day + 'T00:00:00')));
  trendYMax = Math.max(1, ...days.map(d=>byDay.get(d) || 0));
  drawLineChart('trendChart', labels, days.map(d=>byDay.get(d)), titles);
}

function renderCategoryDonut(rows){
  const counts = {};
  rows.forEach(r=> (r.category||'').split(',').forEach(c=>{ c=c.trim(); if(c) counts[c]=(counts[c]||0)+1; }));
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const labels = sorted.map(s=>s[0]);
  const data = sorted.map(s=>s[1]);
  const colors = labels.map((l,i)=> PALETTE[i % PALETTE.length]);
  drawDoughnut('catDonut', labels, data, colors, (label)=>{ FILTERS.category = FILTERS.category===label?null:label; renderAll(); });
  document.getElementById('catLegend').innerHTML = labels.map((l,i)=>`
    <div class="leg-row ${FILTERS.category===l?'active':''}" data-l="${i}">
      <span class="leg-dot" style="background:${colors[i]}"></span>
      <span class="leg-name" title="${l}">${l}</span>
      <span class="leg-count">${data[i]}</span>
    </div>`).join('');
  Array.from(document.querySelectorAll('#catLegend .leg-row')).forEach((el,i)=>{
    el.addEventListener('click', ()=>{ FILTERS.category = FILTERS.category===labels[i]?null:labels[i]; renderAll(); });
  });
}

function renderDesignation(rows){
  const counts = {};
  rows.forEach(r=>{ const d=r.designation||'N/A'; counts[d]=(counts[d]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12);
  drawBar('desigChart', sorted.map(s=>s[0]), sorted.map(s=>s[1]), (label)=>{ FILTERS.designation = FILTERS.designation===label?'All':label; syncDropdowns(); renderAll(); });
}

function renderTopReporters(rows){
  const counts = {};
  rows.forEach(r=>{ counts[r.observer]=(counts[r.observer]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  document.getElementById('topReporters').innerHTML = sorted.map((s,i)=>`
    <div class="rep-row ${FILTERS.observer===s[0]?'active':''}" data-name="${s[0]}">
      <div class="rep-rank ${i===0?'gold':''}">${i+1}</div>
      <div class="rep-name">${s[0]}</div>
      <div class="rep-count">${s[1]} reports</div>
    </div>`).join('');
  Array.from(document.querySelectorAll('#topReporters .rep-row')).forEach(el=>{
    el.addEventListener('click', ()=>{
      const name = el.getAttribute('data-name');
      FILTERS.observer = FILTERS.observer===name ? 'All' : name;
      syncDropdowns(); renderAll();
    });
  });
}

function renderSeverity(rows){
  const counts = {1:0,2:0,3:0,4:0,5:0,NA:0};
  rows.forEach(r=>{ if(r.severity===null){counts.NA++;} else {counts[r.severity]=(counts[r.severity]||0)+1;} });
  const labels = ['Sev 1','Sev 2','Sev 3','Sev 4','Sev 5','N/A'];
  const data = [counts[1],counts[2],counts[3],counts[4],counts[5],counts.NA];
  const colors = ['#1E8E5A','#A98A1E','#D64545','#B23A2E','#7A2E24','#B9BEC6'];
  drawBar('sevChart', labels, data, (label)=>{
    const sevVal = label==='N/A' ? 'NA' : parseInt(label.split(' ')[1]);
    FILTERS._sev = FILTERS._sev===sevVal ? null : sevVal;
    renderAll();
  }, colors);
}

function renderHotspots(rows){
  const map = new Map();
  rows.forEach(r=>{ const loc=normLoc(r.location); if(!map.has(loc)) map.set(loc,[]); map.get(loc).push(r); });
  const sorted = Array.from(map.entries()).sort((a,b)=>b[1].length-a[1].length).slice(0,12);
  const maxCount = sorted.length ? sorted[0][1].length : 1;
  document.getElementById('hotspotList').innerHTML = sorted.map(([loc, items])=>{
    const maxSev = Math.max(...items.map(r=>r.severity||1));
    const pct = Math.round(100*items.length/maxCount);
    return `<div class="hs-row ${FILTERS.location===loc?'active':''}" data-loc="${loc}">
      <span class="hs-km" title="${loc}">${loc}</span>
      <span class="hs-bar-track"><span class="hs-bar-fill" style="width:${pct}%; background:${sevColor(maxSev)}"></span></span>
      <span class="hs-count">${items.length}</span>
    </div>`;
  }).join('');
  Array.from(document.querySelectorAll('#hotspotList .hs-row')).forEach(el=>{
    el.addEventListener('click', ()=>{
      const loc = el.getAttribute('data-loc');
      FILTERS.location = FILTERS.location===loc ? null : loc;
      renderAll();
    });
  });
}

function renderCadence(rows){
  const byWeek = {};
  rows.forEach(r=>{ const d=parseDate(r.dateObs); if(!d) return; const k=weekKey(d); byWeek[k]=(byWeek[k]||0)+1; });
  const weeks = Object.keys(byWeek).sort();
  drawBar('cadenceChart', weeks.map(w=>w.split('-W')[1]?('W'+w.split('-W')[1]):w), weeks.map(w=>byWeek[w]), null, '#2F6FE0');
}

function renderMonthly(rows){
  const buckets = {};
  rows.forEach(r=>{
    const d = parseDate(r.dateObs); if(!d) return;
    const k = monthKey(d);
    if(!buckets[k]) buckets[k] = {positive:0, unsafe:0, nearmiss:0};
    buckets[k][natureOf(r.type)]++;
  });
  const months = Object.keys(buckets).sort();
  const ctx = document.getElementById('monthlyChart');
  if(charts.monthlyChart) charts.monthlyChart.destroy();
  charts.monthlyChart = new Chart(ctx, {
    type:'bar',
    data:{
      labels: months.map(monthLabel),
      datasets:[
        { label:'Positive', data: months.map(m=>buckets[m].positive), backgroundColor:'#1E8E5A', borderRadius:3 },
        { label:'Unsafe', data: months.map(m=>buckets[m].unsafe), backgroundColor:'#D64545', borderRadius:3 },
        { label:'Near miss', data: months.map(m=>buckets[m].nearmiss), backgroundColor:'#A98A1E', borderRadius:3 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ font:{family:'Inter',size:10.5}, color:'#6B7280', boxWidth:10 } } },
      scales:{
        x:{ stacked:true, grid:{display:false}, ticks:{font:{family:'IBM Plex Mono',size:9.5}, color:'#6B7280'} },
        y:{ stacked:true, grid:{color:'#EEF0EA'}, ticks:{font:{family:'IBM Plex Mono',size:9.5}, color:'#9AA1AC'} }
      }
    }
  });
}

function renderRateAndAging(rows){
  const withAnswer = rows.filter(r=>r.correctedOnSpot);
  const correctedYes = withAnswer.filter(r=>isCorrected(r.correctedOnSpot)).length;
  const pct = withAnswer.length ? Math.round(100*correctedYes/withAnswer.length) : 0;
  document.getElementById('rateCard').innerHTML = `
    <div class="rc-num">${pct}%</div>
    <div class="rc-body">
      <div class="rc-lbl">Corrected on the spot (${correctedYes} of ${withAnswer.length} answered)</div>
      <div class="rc-bar"><div class="rc-fill" style="width:${pct}%"></div></div>
    </div>`;

  const now = new Date();
  const openRows = rows.filter(r=>isOpenStatus(r.status)).map(r=>{
    const d = parseDate(r.dateObs);
    const days = d ? Math.max(0, Math.round((now - d)/86400000)) : null;
    return {...r, days};
  }).sort((a,b)=> (b.days||0)-(a.days||0));

  const list = document.getElementById('agingList');
  if(!openRows.length){
    list.innerHTML = `<div class="aging-empty">No open items in the current filter â€” nothing overdue.</div>`;
    return;
  }
  list.innerHTML = openRows.slice(0,25).map(r=>{
    const days = r.days===null ? 'â€”' : r.days+'d';
    const cls = r.days>=30 ? 'hot' : r.days>=14 ? 'warm' : '';
    return `<div class="aging-row" data-loc="${normLoc(r.location)}">
      <span class="aging-days ${cls}">${days}</span>
      <span class="aging-meta"><b>${r.location||'â€”'}</b> Â· ${r.observer||'â€”'} Â· ${(r.what||'').slice(0,50)}</span>
    </div>`;
  }).join('');
  Array.from(list.querySelectorAll('.aging-row')).forEach(el=>{
    el.addEventListener('click', ()=>{
      FILTERS.location = el.getAttribute('data-loc');
      renderAll();
      document.querySelector('.tab-btn[data-tab="insights"]').click();
    });
  });
}

function renderTable(rows){
  const sorted = [...rows].sort((a,b)=>{
    const da = parseDate(a.dateObs), db = parseDate(b.dateObs);
    return (db?db.getTime():0) - (da?da.getTime():0);
  });
  logRowsCache = sorted;
  const totalPages = Math.max(1, Math.ceil(sorted.length / LOG_PAGE_SIZE));
  if(logPage > totalPages) logPage = totalPages;
  const start = (logPage - 1) * LOG_PAGE_SIZE;
  const visibleRows = sorted.slice(start, start + LOG_PAGE_SIZE);

  const body = document.getElementById('logBody');
  const summary = document.getElementById('logSummary');
  const pager = document.getElementById('logPager');
  if(summary){
    if(sorted.length){
      const end = Math.min(start + LOG_PAGE_SIZE, sorted.length);
      summary.textContent = `Showing ${start + 1}-${end} of ${sorted.length} records`;
    } else {
      summary.textContent = 'No records available for the current filter';
    }
  }
  if(pager){
    pager.innerHTML = buildPager(totalPages);
    Array.from(pager.querySelectorAll('button[data-page]')).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(btn.disabled) return;
        setLogPage(parseInt(btn.getAttribute('data-page')));
      });
    });
  }

  if(!visibleRows.length){
    body.innerHTML = `<tr><td colspan="6" class="no-results">No observations match the current filters.</td></tr>`;
    return;
  }
  body.innerHTML = visibleRows.map((r,i)=>{
    const rowIndex = start + i;
    const nature = natureOf(r.type);
    const natureLabel = nature==='positive'?'POSITIVE':nature==='nearmiss'?'NEAR MISS':'UNSAFE';
    const open = isOpenStatus(r.status);
    const tags = (r.category||'').split(',').map(s=>s.trim()).filter(Boolean).map(t=>`<span class="tag">${t}</span>`).join('');
    return `
    <tr class="main-row" data-i="${rowIndex}">
      <td class="km-cell">${(r.dateObs||'').split(' ')[0]||'â€”'}</td>
      <td class="person"><b>${r.observer}</b><span>${r.designation}</span></td>
      <td><span class="pill ${nature}">${natureLabel}</span></td>
      <td class="findings-cell">${(r.what||'').slice(0,90)}${(r.what||'').length>90?'â€¦':''}</td>
      <td><span class="pill ${open?'open':'closed'}">${open?'OPEN':'CLOSED'}</span></td>
      <td class="action-cell">
        <button class="expand-btn" data-i="${rowIndex}" title="Expand details">▾</button>
        <button class="maximize-btn" data-i="${rowIndex}" title="Maximize report">⤢</button>
      </td>
    </tr>
    <tr class="detail-row" id="detail-${rowIndex}" style="display:none;"><td colspan="6">
      <div class="detail-grid">
        <p><b>Location</b>${r.location||'â€”'}</p>
        <p><b>Severity</b>${r.severity ? 'Level '+r.severity+' of 5' : 'Not specified'}</p>
        <p><b>Category tags</b>${tags||'â€”'}</p>
        <p><b>Immediate action</b>${r.immediateAction||'â€”'}</p>
        <p><b>Corrected on the spot</b>${r.correctedOnSpot||'â€”'}</p>
        <p><b>Photo / Evidence / Closeout</b>${renderEvidenceLinksHtml(r.evidenceUrls)}</p>
        <p><b>Responsible person</b>${r.responsible||'â€”'}</p>
        <p><b>Corrective action taken</b>${r.correctiveAction||'â€”'}</p>
      </div>
    </td></tr>`;
  }).join('');
  Array.from(document.querySelectorAll('.expand-btn')).forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const i = btn.getAttribute('data-i');
      const row = document.getElementById('detail-'+i);
      const isOpenRow = row.style.display==='table-row';
      row.style.display = isOpenRow ? 'none' : 'table-row';
      btn.textContent = isOpenRow ? '▾' : '▴';
    });
  });
  Array.from(document.querySelectorAll('.maximize-btn')).forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const row = logRowsCache[parseInt(btn.getAttribute('data-i'))];
      if(row) openReportModal(row);
    });
  });
  Array.from(document.querySelectorAll('tr.main-row')).forEach(tr=>{
    tr.addEventListener('click', ()=>{ tr.querySelector('.expand-btn').click(); });
  });
  Array.from(document.querySelectorAll('.panel-maximize-btn')).forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openPanelModal(btn.getAttribute('data-panel-target'));
    });
  });

  document.getElementById('closePanelModal')?.addEventListener('click', closePanelModal);
  document.getElementById('panelModal')?.addEventListener('click', (e)=>{ if(e.target.id === 'panelModal') closePanelModal(); });
}

/* ============================================================
   CHART DRAWING
   ============================================================ */
function drawLineChart(id, labels, data, fullLabels){
  const ctx = document.getElementById(id);
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ label:'Reports', data, borderColor:'#1E8E5A', backgroundColor:'rgba(30,142,90,0.12)', fill:true, tension:.35, pointRadius:3, pointHoverRadius:5, borderWidth:2 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'nearest', intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            title:(items)=>{
              const index = items[0].dataIndex;
              return fullLabels && fullLabels[index] ? fullLabels[index] : items[0].label;
            },
            label:(item)=>`Reports: ${item.parsed.y}`
          }
        }
      },
      scales:{
        x:{
          ticks:{
            color:'#6B7280',
            font:{family:'IBM Plex Mono',size:9},
            maxRotation:0,
            autoSkip:true,
            maxTicksLimit:10,
            callback:(value, index)=>Array.isArray(labels[index]) ? labels[index].join(' ') : labels[index]
          },
          grid:{display:false}
        },
        y:{
          grid:{color:'#EEF0EA'},
          ticks:{
            font:{family:'IBM Plex Mono',size:9.5},
            color:'#9AA1AC',
            precision:0,
            callback:(value)=>String(Math.round(value))
          },
          beginAtZero:true,
          suggestedMax: trendYMax,
          max: trendYMax,
          grace:0
        }
      }
    }
  });
}
function drawDoughnut(id, labels, data, colors, onClick){
  const ctx = document.getElementById(id);
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:2, borderColor:'#fff' }] },
    options:{
      responsive:true, cutout:'62%', maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      onClick:(evt,els)=>{ if(els.length) onClick(labels[els[0].index]); },
      onHover:(evt,els)=>{ evt.native.target.style.cursor = els.length?'pointer':'default'; }
    }
  });
}
function drawBar(id, labels, data, onClick, colors){
  const ctx = document.getElementById(id);
  if(charts[id]) charts[id].destroy();
  const bg = Array.isArray(colors) ? colors : (colors || '#1E8E5A');
  charts[id] = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor:bg, borderRadius:4 }] },
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ grid:{color:'#EEF0EA'}, ticks:{font:{family:'IBM Plex Mono',size:9}, color:'#6B7280', precision:0, callback:(value)=>String(Math.round(value))} , beginAtZero:true },
        y:{ grid:{display:false}, ticks:{font:{family:'Inter',size:10}, color:'#14181F'} }
      },
      onClick: onClick ? (evt,els)=>{ if(els.length) onClick(labels[els[0].index]); } : undefined,
      onHover: onClick ? (evt,els)=>{ evt.native.target.style.cursor = els.length?'pointer':'default'; } : undefined
    }
  });
}

/* ============================================================
   TABS
   ============================================================ */
Array.from(document.querySelectorAll('.tab-btn')).forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const tab = btn.getAttribute('data-tab');
    Array.from(document.querySelectorAll('.tab-btn')).forEach(b=>b.classList.toggle('active', b===btn));
    Array.from(document.querySelectorAll('.tab-content')).forEach(c=>c.classList.toggle('active', c.getAttribute('data-tab')===tab));
    document.querySelector('.tab-panels')?.classList.toggle('log-view', tab === 'log');
  });
});

document.querySelector('.tab-panels')?.classList.toggle('log-view', document.querySelector('.tab-btn.active')?.getAttribute('data-tab') === 'log');

/* ============================================================
   FILTER BAR WIRING
   ============================================================ */
function syncDropdowns(){
  document.getElementById('fObserver').value = FILTERS.observer;
  document.getElementById('fDesignation').value = FILTERS.designation;
  document.getElementById('fStatus').value = FILTERS.status;
}
function populateDropdowns(){
  const observers = Array.from(new Set(ALL_ROWS.map(r=>r.observer))).sort();
  const designations = Array.from(new Set(ALL_ROWS.map(r=>r.designation))).sort();
  document.getElementById('fObserver').innerHTML = '<option>All</option>' + observers.map(o=>`<option>${o}</option>`).join('');
  document.getElementById('fDesignation').innerHTML = '<option>All</option>' + designations.map(d=>`<option>${d}</option>`).join('');
}
document.getElementById('fObserver').addEventListener('change', e=>{ FILTERS.observer = e.target.value; renderAll(); });
document.getElementById('fDesignation').addEventListener('change', e=>{ FILTERS.designation = e.target.value; renderAll(); });
document.getElementById('fStatus').addEventListener('change', e=>{ FILTERS.status = e.target.value; renderAll(); });
document.getElementById('fSearch').addEventListener('input', e=>{ FILTERS.search = e.target.value; renderAll(); });
document.getElementById('clearFiltersBtn').addEventListener('click', ()=>{
  FILTERS.observer='All'; FILTERS.designation='All'; FILTERS.status='All'; FILTERS.search=''; FILTERS.category=null; FILTERS.location=null; FILTERS.quick=null; FILTERS._sev=null;
  document.getElementById('fSearch').value=''; syncDropdowns(); renderAll();
});
const reportModal = document.getElementById('reportModal');
const closeReportModalBtn = document.getElementById('closeReportModal');
const evidenceModal = document.getElementById('evidenceModal');
const closeEvidenceModalBtn = document.getElementById('closeEvidenceModal');
if(reportModal){
  reportModal.addEventListener('click', (event)=>{
    if(event.target === reportModal) closeReportModal();
  });
}
if(closeReportModalBtn){
  closeReportModalBtn.addEventListener('click', closeReportModal);
}
if(evidenceModal){
  evidenceModal.addEventListener('click', (event)=>{
    if(event.target === evidenceModal) closeEvidenceModal();
  });
}
if(closeEvidenceModalBtn){
  closeEvidenceModalBtn.addEventListener('click', closeEvidenceModal);
}
document.addEventListener('click', (event)=>{
  const btn = event.target.closest('.evidence-link');
  if(!btn) return;
  const url = btn.getAttribute('data-url');
  if(url) openEvidenceModal(url);
});
document.addEventListener('keydown', (event)=>{
  if(event.key === 'Escape'){
    closeReportModal();
    closeEvidenceModal();
  }
});

/* ============================================================
   LOAD
   ============================================================ */
let refreshTimer = null;
async function loadData(){
  setSync(false, 'Loading data');
  try{
    if(DATA_SOURCE_MODE === 'apps-script'){
      const rows = await loadRowsFromAppsScript();
      applyLoadedRows(rows, 'Source: Apps Script');
    }else if(DATA_SOURCE_MODE === 'direct-sheet'){
      const rows = await loadRowsFromDirectSheet();
      applyLoadedRows(rows, 'Source: Google Sheet');
    }else if(DATA_SOURCE_MODE === 'auto'){
      try{
        const rows = await loadRowsFromAppsScript();
        applyLoadedRows(rows, 'Source: Apps Script (auto)');
      }catch(appsErr){
        try{
          const rows = await loadRowsFromDirectSheet();
          applyLoadedRows(rows, 'Source: Google Sheet (auto fallback)');
        }catch(sheetErr){
          throw new Error(`auto mode failed: Apps Script error: ${appsErr.message}; Direct Sheet error: ${sheetErr.message}`);
        }
      }
    }else{
      throw new Error(`Unsupported DATA_SOURCE_MODE: ${DATA_SOURCE_MODE}. Use "apps-script", "direct-sheet", or "auto".`);
    }
  }catch(err){
    if(!ALL_ROWS.length) ALL_ROWS = [];
    document.getElementById('sourceNote').textContent = 'Source unavailable';
    populateDropdowns(); syncDropdowns(); renderAll();
    setSync(true, 'Live data unavailable');
    showBanner(`<b>Could not load configured source</b> (${err.message}). Current mode: <b>${DATA_SOURCE_MODE}</b>. Check only this mode configuration for Sheet ID ${SHEET_ID}.`);
  }
  document.getElementById('countNote').textContent = ALL_ROWS.length + ' total observations loaded';
}
loadData();
refreshTimer = setInterval(loadData, REFRESH_MS);

