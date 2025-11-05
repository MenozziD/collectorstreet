import { MARKET_HINTS_SCHEMA, normalizeCategory} from './item.js';
// Identifiers supportati nel lookup AUTO (label → type / backend key)
const IDENT_OPTIONS = [
  { value: 'serial',           label: 'Serial' },
  { value: 'ean',              label: 'EAN/UPC' },
  { value: 'lego_set',         label: 'LEGO Set' },
  { value: 'pc_id',            label: 'PriceCharting ID' },
  { value: 'discogs_id',       label: 'Discogs Release ID' },
  { value: 'tcgplayer_id',     label: 'TCGplayer ID' },
  { value: 'stockx_slug',      label: 'StockX Slug' }
];

// Stato locale della modale
let stateInfoLinks = [];
let stateMarketplaceLinks = [];

function renderEditModal(USER_REF_CURRENCY,item = null) {  
  // reset label/hints
    updateRefCurrencyLabel(USER_REF_CURRENCY);
    setHint('purchasePriceHint',''); setHint('purchaseDateHint',''); setHint('purchasePriceRefHint',''); setHint('salePriceHint',''); setHint('saleDateHint',''); setHint('quantityHint',''); setHint('marketplaceLinkHint','');
    const modalContentEl = document.querySelector('#itemModal .modal-content');
    const advancedFields = document.querySelector('#itemModal .advanced-fields');
    if (modalContentEl && modalContentEl.classList.contains('expanded')) { modalContentEl.classList.remove('expanded'); }
    if (advancedFields && !advancedFields.classList.contains('hidden')) { advancedFields.classList.add('hidden'); }
    const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
    if (toggleAdvancedBtn) toggleAdvancedBtn.textContent = 'Altre informazioni';
    updateRefCurrencyLabel(USER_REF_CURRENCY);

    const modal = document.getElementById('itemModal');
    const modalTitle = document.getElementById('modalTitle');
    const itemId = document.getElementById('itemId');
    const itemName = document.getElementById('itemName');
    const itemDescription = document.getElementById('itemDescription');
    const itemLanguage = document.getElementById('itemLanguage');
    const itemCategory = document.getElementById('itemCategory');
    const purchasePrice = document.getElementById('purchasePrice');
    const purchaseDate = document.getElementById('purchaseDate');
    const salePrice = document.getElementById('salePrice');
    const saleDate = document.getElementById('saleDate');
    const itemTags = document.getElementById('itemTags');
    const quantity = document.getElementById('quantity');
    const condition = document.getElementById('condition');
    const imageInput = document.getElementById('image');
    const currencySelect = document.getElementById('currency');
    const purchasePriceRef = document.getElementById('purchasePriceRef');
    
    if (item) {
        modalTitle.textContent = 'Modifica Item';
        toggleAdvancedBtn.style="display: flex";
        itemId.value = item.id;
        itemName.value = item.name || '';
        itemDescription.value = item.description || '';
        itemLanguage.value = item.language || '';
        itemCategory.value = item.category || '';
        purchasePrice.value = item.purchase_price !== null && item.purchase_price !== undefined ? item.purchase_price : '';
        purchaseDate.value = item.purchase_date || '';
        salePrice.value = item.sale_price !== null && item.sale_price !== undefined ? item.sale_price : '';
        saleDate.value = item.sale_date || '';
        itemTags.value = item.tags || '';
        quantity.value = item.quantity !== null && item.quantity !== undefined ? item.quantity : '1';
        condition.value = item.condition || '';
        // Note: non si può impostare il valore dell'input file per motivi di sicurezza
        imageInput.value = '';
        currencySelect.value = item.currency || '';
        // Set purchase price in reference currency if available
        if (purchasePriceRef) {
            purchasePriceRef.value = (item.purchase_price_curr_ref !== null && item.purchase_price_curr_ref !== undefined) ? item.purchase_price_curr_ref : '';
        }
        // Links Info e MarketPlace
        // inizializza stati
        const stateInfoLinks = Array.isArray(item?.info_links) ? [...item.info_links] : [];
        const stateMarketplaceLinks = Array.isArray(item?.marketplace_links) ? [...item.marketplace_links] : [];
        // Render Link già presenti
        renderLinks(stateInfoLinks, 'infoLinksItemList');
        renderLinks(stateMarketplaceLinks, 'marketplaceLinksItemList');
        // pulisci input
        const i1 = document.getElementById('infoLinkItemInput'); if (i1) i1.value = '';
        const i2 = document.getElementById('marketplaceLinkItemInput'); if (i2) i2.value = '';
        // Render MarketParamsFields
        if (item && item.market_params) {
            renderMarketParamsFields(Array.isArray(item?.market_params) ? [...item.market_params] : []);
        } else {
            renderMarketParamsFields();
        }
    } else {
        modalTitle.textContent = 'Nuovo Item';
        toggleAdvancedBtn.style="display: None";
        clearItemForm();
        // Nascondi toggleAdvancedBtn 
        // Reset reference price field
        if (purchasePriceRef) purchasePriceRef.value = '';
    }
    modal.classList.remove('hidden');
    
    document.getElementById('itemCategory')?.addEventListener('change', () => {
        renderMarketParamsFields();
    });
}

function initPrice(USER_REF_CURRENCY)
 {
    updateRefCurrencyLabel(USER_REF_CURRENCY);
    document.getElementById('purchasePrice')?.addEventListener('input', () => { validateFields(); updateConversion(); });
    document.getElementById('currency')?.addEventListener('change', () => { validateFields(); updateConversion(); });
    document.getElementById('purchaseDate')?.addEventListener('change', validateFields);
    document.getElementById('salePrice')?.addEventListener('input', validateFields);
    document.getElementById('saleDate')?.addEventListener('change', validateFields);
    document.getElementById('quantity')?.addEventListener('input', validateFields);
 }

function clearItemForm() {
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemDescription').value = '';
    document.getElementById('itemLanguage').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('purchasePrice').value = '';
    document.getElementById('purchaseDate').value = '';
    document.getElementById('salePrice').value = '';
    document.getElementById('saleDate').value = '';
    document.getElementById('itemTags').value = '';
    document.getElementById('quantity').value = '1';
    document.getElementById('condition').value = '';
    document.getElementById('image').value = '';
    document.getElementById('currency').value = '';
    const refInput = document.getElementById('purchasePriceRef');
    if (refInput) refInput.value = '';
}

async function updateConversion() {
    const priceEl = document.getElementById('purchasePrice');
    const curEl = document.getElementById('currency');
    const refEl = document.getElementById('purchasePriceRef');
    const lbl = document.getElementById('refCurrencyLabel');
    if (!priceEl || !curEl || !refEl) return;
    const amount = parseFloat(priceEl.value);
    const from = curEl.value || 'EUR';
    const to = (USER_REF_CURRENCY || 'EUR');
    if (!amount || isNaN(amount)) {
        setHint('purchasePriceRefHint','', '');
        return;
    }
    try {
        const q = new URLSearchParams({ amount: amount.toString(), from, to }).toString();
        const res = await fetch(`/api/convert?${q}`);
        if (res.ok) {
            const data = await res.json();
            if (typeof data.result === 'number') {
                refEl.value = data.result.toFixed(2);
                setHint('purchasePriceRefHint', `≈ ${data.result.toFixed(2)} ${to}`, 'ok');
            } else {
                setHint('purchasePriceRefHint','Conversione non disponibile', 'warn');
            }
        } else {
            setHint('purchasePriceRefHint','Errore conversione', 'warn');
        }
    } catch (e) {
        setHint('purchasePriceRefHint','Errore rete conversione', 'warn');
    }
}

function fmtMoney(v, cur){ if (v==null || isNaN(Number(v))) return '-'; return Number(v).toFixed(2) + (cur?(' '+cur):''); }

function closeModal() {
    const modal = document.getElementById('itemModal');
    stateInfoLinks = [];
    stateMarketplaceLinks = [];
    modal.classList.add('hidden');
}

// === Inline validation & conversion ===
function setHint(id, msg, cls='') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('error','warn','ok');
    if (cls) el.classList.add(cls);
}

function validateFields() {
    // Prezzi
    const p = parseFloat(document.getElementById('purchasePrice').value);
    const s = parseFloat(document.getElementById('salePrice').value);
    if (p < 0) setHint('purchasePriceHint','Il prezzo di acquisto non può essere negativo','error');
    else if (p === 0) setHint('purchasePriceHint','Zero? Verifica se è corretto','warn');
    else setHint('purchasePriceHint','', '');

    if (s < 0) setHint('salePriceHint','Il prezzo di vendita non può essere negativo','error');
    else setHint('salePriceHint','', '');

    // Date
    const pd = document.getElementById('purchaseDate').value ? new Date(document.getElementById('purchaseDate').value) : null;
    const sd = document.getElementById('saleDate').value ? new Date(document.getElementById('saleDate').value) : null;
    const today = new Date(); today.setHours(0,0,0,0);
    if (pd && pd > today) setHint('purchaseDateHint','La data di acquisto è nel futuro','warn');
    else setHint('purchaseDateHint','', '');
    if (sd && pd && sd < pd) setHint('saleDateHint','La data di vendita è precedente alla data di acquisto','warn');
    else setHint('saleDateHint','', '');

    // Quantità
    const q = parseInt(document.getElementById('quantity').value || '1', 10);
    if (q < 1) setHint('quantityHint','La quantità deve essere almeno 1','error');
    else setHint('quantityHint','', '');
}


// script.js - gestisce login e interazione con l'applicazione
// Global variable to store the current user's reference currency
//let USER_REF_CURRENCY = null;
function updateRefCurrencyLabel(USER_REF_CURRENCY){
  const el = document.getElementById('refCurrencyLabel');
  if (el) { el.textContent = USER_REF_CURRENCY || 'EUR'; }
}

/**
 * Rende i campi di market params in due modalità:
 *  - MANUAL: mostra tutti i campi (comportamento attuale)
 *  - AUTO: mostra select "tipo seriale" + input "valore" + bottone "Conferma"
 *
 * @param {HTMLElement} container El. DOM dove renderizzare
 * @param {string} category Categoria corrente (può essere usata dal renderer manuale)
 * @param {object} currentMarketParams Oggetto esistente dei market params
 */
function renderMarketParamsFields(currentMarketParams = {}) {
  const container = document.getElementById('marketParamsFields');
  const category = normalizeCategory(document.getElementById('itemCategory').value);
  container.innerHTML = '';

  // Header modalità
  const modeWrap = document.createElement('div');
  modeWrap.className = 'gc-mode-switch';
  modeWrap.innerHTML = `
    <div class="hstack" style="gap:12px; align-items:center; margin-bottom:8px;">
      <span class="muted">Modalità parametri:</span>
      <label><input type="radio" name="gc_mode" value="manual" checked> Manual</label>
      <label><input type="radio" name="gc_mode" value="auto"> Auto</label>
    </div>
    <div id="gcModeArea"></div>
  `;
  container.appendChild(modeWrap);

  const modeArea = modeWrap.querySelector('#gcModeArea');

  function renderManual() {
    modeArea.innerHTML = '';
    const wrap = document.createElement('div');
    
    const catRaw = document.getElementById('itemCategory')?.value || '';
    const catKey = normalizeCategory(catRaw);
    const schema = MARKET_HINTS_SCHEMA[catKey] || MARKET_HINTS_SCHEMA['default'];

    // Valori esistenti (object) se passati o presi dai campi attuali
    const existingObj = collectMarketParams();

    wrap.innerHTML = '';
    schema.forEach(f => {
        const div = document.createElement('div');
        //div.style = "width: 40%; padding-right: 0%; margin-right: 0%; border-right:0%;";
        //div.className = 'field';

        const inputId = 'mp_' + f.key;
        const val = (existingObj && existingObj[f.key] != null) ? existingObj[f.key] : '';

        const label = document.createElement('small');
        label.className = 'hint-field'
        label.htmlFor = inputId;
        label.title = f.tip || '';
        label.textContent = f.label;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = inputId;
        input.placeholder = f.placeholder || '';
        input.value = val || '';

        div.append(label, input);
        wrap.appendChild(div);      
    });
    modeArea.appendChild(wrap);
    
    // modeArea.innerHTML = '';
    // // *** Usa il renderer esistente (comportamento attuale) ***
    // // Se hai già una funzione che costruisce i campi in base a category/schema, richiamala qui.
    // // Esempio:
    // if (typeof renderManualMarketParamsSection === 'function') {
    //   renderManualMarketParamsSection(modeArea, category, currentMarketParams);
    // } else {
    //   // Fallback minimo: mostra JSON editabile (per non rompere il flusso se manca la funzione)
    //   modeArea.innerHTML = `
    //     <label class="muted">Parametri (JSON):</label>
    //     <textarea id="marketParamsJson" rows="6" style="width:100%">${JSON.stringify(currentMarketParams || {}, null, 2)}</textarea>
    //   `;
    // }
  }

  function renderAuto() {
    modeArea.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="vstack" style="gap:8px;">
        <div class="hstack" style="gap:8px;">
          <label class="muted" style="min-width:160px;">Tipo identificatore</label>
          <select id="gcIdentType" style="flex:1;"></select>
        </div>
        <div class="hstack" style="gap:8px;">
          <label class="muted" style="min-width:160px;">Valore</label>
          <input id="gcIdentValue" type="text" style="flex:1;" placeholder="Inserisci il valore esatto">
        </div>
        <div class="hstack" style="gap:8px; justify-content:flex-start;">
          <button type="button" class="btn" id="gcAutoConfirm">Conferma</button>
          <span id="gcAutoMsg" class="muted"></span>
        </div>
      </div>
    `;
    modeArea.appendChild(wrap);

    // Popola select
    const sel = wrap.querySelector('#gcIdentType');
    IDENT_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.label;
      sel.appendChild(o);
    });

    // Conferma → lookup su backend
    wrap.querySelector('#gcAutoConfirm').addEventListener('click', async () => {
      const type = sel.value;
      const value = (wrap.querySelector('#gcIdentValue').value || '').trim();
      const msg = wrap.querySelector('#gcAutoMsg');
      msg.textContent = '';
      msg.style.color = '';

      if (!type || !value) {
        msg.textContent = 'Seleziona un tipo e inserisci un valore.'; msg.style.color = 'red';
        return;
      }

      try {
        const r = await fetch(`/api/global-catalog/lookup?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`);
        const jsn = await r.json();
        if (jsn && jsn.match && jsn.global) {
          // Abbiamo un match → salviamo in hidden inputs per submit
          // 1) settiamo category UI (se hai un select per categoria)
          const catSel = document.getElementById('itemCategory');
          if (catSel && jsn.global.category) {
            catSel.value = jsn.global.category;
            // Eventuale trigger per ridisegnare campi manuali se l’utente passa a manual dopo
            catSel.dispatchEvent(new Event('change'));
          }
          // 2) teniamo memoria dell’aggancio:
          ensureHidden('gcLinkedGlobalId').value = jsn.global.id;
          ensureHidden('gcModeSelected').value = 'auto';
          // 3) Carichiamo i marketParams dal GC nel form (in memoria; i campi restano nascosti in AUTO)
          window.__autoResolvedMarketParams = jsn.global.market_params || {};
          msg.textContent = `Trovato: ${jsn.global.canonical_name} (ID ${jsn.global.id}). Verranno usati i parametri collegati.`;
          msg.style.color = 'green';
        } else {
          ensureHidden('gcLinkedGlobalId').value = '';
          window.__autoResolvedMarketParams = null;
          ensureHidden('gcModeSelected').value = 'auto';
          msg.textContent = 'Nessun match trovato. Passa alla modalità MANUAL e inserisci i dati: probabilmente va aggiunto al catalogo.';
          msg.style.color = 'red';
        }
      } catch (e) {
        ensureHidden('gcLinkedGlobalId').value = '';
        window.__autoResolvedMarketParams = null;
        ensureHidden('gcModeSelected').value = 'auto';
        msg.textContent = 'Errore di lookup. Riprova o usa la modalità MANUAL.';
        msg.style.color = 'red';
      }
    });
  }

  // utility per hidden fields necessari al submit
  function ensureHidden(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('input');
      el.type = 'hidden';
      el.id = id;
      el.name = id;
      container.appendChild(el);
    }
    return el;
  }

  // Gestione toggle
  const radios = modeWrap.querySelectorAll('input[name="gc_mode"]');
  radios.forEach(r => r.addEventListener('change', () => {
    if (modeWrap.querySelector('input[name="gc_mode"]:checked').value === 'auto') renderAuto();
    else renderManual();
    // Aggiorno hidden gcModeSelected
    ensureHidden('gcModeSelected').value = modeWrap.querySelector('input[name="gc_mode"]:checked').value;
  }));

  // Render iniziale (manual come da requisito)
  renderManual();
  ensureHidden('gcModeSelected').value = 'manual';
  ensureHidden('gcLinkedGlobalId'); // creato, vuoto
}


function renderLinks(list, containerId){
  const listEl = document.getElementById(containerId);
  if (!listEl) return;
  listEl.innerHTML = '';
  (list || []).forEach((u, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<a href="${u}" target="_blank" rel="noopener">${u}</a>
                      <button type="button" data-idx="${idx}" aria-label="Rimuovi">&times;</button>`;
    listEl.appendChild(chip);
  });
  listEl.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-idx'), 10);
      if (containerId === 'infoLinksItemList') {
        stateInfoLinks.splice(i, 1);
        renderLinks(stateInfoLinks, 'infoLinksItemList');
      } else {
        stateMarketplaceLinks.splice(i, 1);
        renderLinks(stateMarketplaceLinks, 'marketplaceLinksItemList');
      }
    });
  });
}

function collectMarketParams(){
  const catKey = normalizeCategory(document.getElementById('itemCategory').value);
  const schema = MARKET_HINTS_SCHEMA[catKey] || MARKET_HINTS_SCHEMA['default'];
  const obj = {};
  schema.forEach(f => {
    const el = document.getElementById('mp_' + f.key);
    if (el && el.value && el.value.trim() !== '') obj[f.key] = el.value.trim();
  });
  return obj;
}


function renderViewModal(item){
    
    const m = document.getElementById('viewItemModal');
    const set = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'A') {
        if (val) { el.href = val; el.textContent = 'Apri annuncio'; el.style.display='inline'; }
        else      { el.href = '#'; el.textContent = '—'; el.style.display='none'; }
    } else {
        el.textContent = val || '—';
    }
    };
    document.getElementById('viewName').textContent = item.name || '(senza nome)';
    //document.getElementById('viewSubtitle').textContent = (item.category||'') + (item.language?(' · '+item.language):'');
    const img = document.getElementById('viewImage');
    img.src = item.image_path ? `/static/${item.image_path}` : '';
    img.style.display = item.image_path ? 'block' : 'none';

    set('viewCategory',     item.category);
    set('viewLanguage',     item.language);
    set('viewCondition',    item.condition);
    set('viewDescription',  item.description);
    set('viewPurchase',     item.purchase_price!=null ? fmtMoney(item.purchase_price, item.currency) : null);
    set('viewPurchaseDate', item.purchase_date);
    const el=document.getElementById('viewDaysInCollection'); if (el) el.textContent = `—`;
    (function(){ try { if (item.purchase_date) { const d=new Date(item.purchase_date); const now=new Date(); const days=Math.floor((now - d)/(1000*60*60*24)); const el=document.getElementById('viewDaysInCollection'); if (el) el.textContent = `${days} giorni`; } } catch(e){} })();
    set('viewSale',         item.sale_price!=null ? fmtMoney(item.sale_price, item.currency) : null);
    set('viewSaleDate',     item.sale_date);
    set('viewLink',         item.marketplace_link);
    set('viewTags',         item.tags);
    (function(){ const el=document.getElementById('viewToken'); if (!el) return; if (item.token) { el.textContent=item.token; el.style.display='inline-flex'; } else { el.textContent=''; el.style.display='none'; } })();

    // Info links (item level)
    const infoLinksArr = Array.isArray(item.info_links) ? item.info_links : [];
    renderLinkList(infoLinksArr, 'viewInfoLinks');

    // Market links (item level) + fallback ad eventuale campo legacy
    let marketArr = Array.isArray(item.marketplace_links) ? item.marketplace_links : [];
    renderLinkList(marketArr, 'viewMarketplaceLinks');

    // Reset stima e apri
    document.getElementById('estContent').innerHTML = '<em>Caricamento stima in corso…</em>';
    document.getElementById('estSource').textContent = '';
    m.classList.remove('hidden');
    renderChips(item);
    renderTagPills(item);

    // Chiamata ad eBay
    fetch(`/api/ebay-estimate?item_id=${item.id}`)
    .then(r => r.json())
    .then(data => {
      const est = document.getElementById('estContent');
      const src = document.getElementById('estSource');
      const query = document.getElementById('estQuery');
      if (data && data.query) {
        const qurl = data.query.url || 'eBay';
        const params = data.query.params || {};
        const kw = params.keywords || '';
        src.textContent = `· Fonte: eBay (${qurl})"`;
        query.textContent = `· Query: "${kw}"`;
      }

      if (data && data.stats) {
        const c = data.stats.currency || '';
        const parts = [];
        if (data.stats.avg    != null) parts.push(`<span class="pill"><strong>Media</strong> ${fmtMoney(data.stats.avg, c)}</span>`);
        if (data.stats.median != null) parts.push(`<span class="pill"><strong>Mediana</strong> ${fmtMoney(data.stats.median, c)}</span>`);
        if (data.stats.min    != null && data.stats.max != null) parts.push(`<span class="pill"><strong>Range</strong> ${fmtMoney(data.stats.min, c)} – ${fmtMoney(data.stats.max, c)}</span>`);
        parts.push(`<span class="pill"><strong>Campioni</strong> ${(data.stats.count||0)}</span>`);
        est.innerHTML = parts.join(' ');

        if (data.samples && data.samples.length) {
          const links = data.samples.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${s.title || 'venduto'}</a>`).join(' · ');
          const samples = document.createElement('div');
          samples.className = 'samples';
          samples.innerHTML = `<div>Esempi recenti: ${links}</div>`;
          est.appendChild(samples);
        }
      } else {
        est.innerHTML = '<em>Nessuna stima disponibile.</em>';
      }
    })
    .catch(() => {
      document.getElementById('estContent').innerHTML = '<em>Impossibile recuperare la stima al momento.</em>';
    });
    // Chiamata in base a categoria
    renderSecondaryMarketSection(item)

    const viewItemClose = document.getElementById('viewItemClose');
    const viewItemModal = document.getElementById('viewItemModal');
    viewItemClose?.addEventListener('click', () => viewItemModal?.classList.add('hidden'));
}

function iconHtmlFor(url){
  const host = hostFromUrl(url);
  // fallback su favicon Google
  return `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${host}" alt="">`;
}

function renderChips(item){
  const chips = document.getElementById('viewChips');
  if (!chips) return;
  chips.innerHTML = '';
  const mk = (label, value, icon) => {
    if (!value) return null;
    const el = document.createElement('span'); el.className='chip';
    el.innerHTML = (icon?`<span class="icon">${icon}</span>`:'') + `<strong>${label}</strong> ${value}`;
    return el;
  };
  const icons = {
    category: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M10 4H4v6h6V4zm10 0h-6v6h6V4zM10 14H4v6h6v-6zm10 0h-6v6h6v-6z"/></svg>',
    language: '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3l2.2 6H21l-5.6 4 2.2 6L12 15l-5.6 4 2.2-6L3 9h6.8L12 3z"/></svg>',
    condition:'<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 21l-6-6 1.41-1.41L9 18.17l10.59-10.6L21 9l-12 12z"/></svg>',
    token:    '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 2l4 4-4 4-4-4 4-4zm0 12l4 4-4 4-4-4 4-4z"/></svg>'
  };
  const list = [
    mk('Categoria', item.category, icons.category),
    mk('Lingua', item.language, icons.language),
    mk('Condizione', item.condition, icons.condition),
    mk('Token', item.token, icons.token),
  ].filter(Boolean);
  list.forEach(el => chips.appendChild(el));
}

function renderTagPills(item){
  const tgt = document.getElementById('viewTagList');
  if (!tgt) return;
  tgt.innerHTML = '';
  const tags = (item.tags || '').split('#').map(s=>s.trim()).filter(Boolean);
  tags.forEach(t => {
    const el = document.createElement('span'); el.className='tag-pill'; el.textContent = t;
    tgt.appendChild(el);
  });
  // If we rendered tag pills, hide the legacy Tag row (if present)
  const legacy = document.querySelector('.hide-when-chips');
  if (legacy) legacy.style.display = tags.length ? 'none' : '';
}

function renderLinkList(urls, containerId){
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!Array.isArray(urls) || urls.length === 0){
    el.innerHTML = '<span class="muted">Nessun link</span>';
    return;
  }
  el.innerHTML = urls.map(u => {
    const host = hostFromUrl(u) || u;
    return `<a class="link-item" href="${u}" target="_blank" rel="noopener">
              ${iconHtmlFor(u)}<span>${host}</span>
            </a>`;
  }).join('');
}

//
function hostFromUrl(u){
  try { return new URL(u).hostname.replace(/^www\./,''); }
  catch { return ''; }
}

// exporting variables and function
export {renderEditModal, renderMarketParamsFields, collectMarketParams, renderLinks, updateRefCurrencyLabel, initPrice, setHint, clearItemForm, renderViewModal, fmtMoney, closeModal};