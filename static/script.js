// import the variables and function from module.js
import { renderEditModal, renderViewModal, renderMarketParamsFields, renderLinks, collectMarketParams, updateRefCurrencyLabel,initPrice, setHint, clearItemForm, fmtMoney, closeModal, addMarketLink, addInfoLinks } from './render.js';
import { saveItem,fetchItems,setUser, linkToGlobalCatalog } from './item.js';

let USER_ITEM_VIEW_MODE = 'standard';
let USER_REF_CURRENCY = null;
// NEW: aggiungi subito dopo
(function applyViewModeClass(){
  const root = document.documentElement;
  root.classList.toggle('compact-mode', USER_ITEM_VIEW_MODE === 'compact');
})();


document.addEventListener('DOMContentLoaded', () => {
    // Se è presente il form di login, gestisci la login; altrimenti inizializza l'applicazione
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();
            const loginError = document.getElementById('loginError');
            loginError.textContent = '';
            try {
                const res = await fetch('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                if (res.ok) {
                    // login riuscito, ricarica la pagina principale
                    window.location.href = '/';
                } else if (res.status === 401) {
                    const data = await res.json();
                    loginError.textContent = data.error || 'Credenziali errate';
                } else {
                    loginError.textContent = 'Errore imprevisto. Riprovare.';
                }
            } catch (err) {
                loginError.textContent = 'Impossibile connettersi al server';
                console.error(err);
            }
        });
    } else {
        // Siamo nella pagina principale della app
        initApp();
    }
    // Se siamo nella pagina profilo, attacca evento per aggiornare le statistiche
    const updateStatsBtn = document.getElementById('updateStatsBtn');
    if (updateStatsBtn) {
        updateStatsBtn.addEventListener('click', updateProfileStats);
    }
    

});

// Fetch the logged in user's information, including reference currency
async function fetchUserInfo() {
    try {
        const res = await fetch('/api/user');
        if (res.ok) {
            const data = await res.json();
            USER_REF_CURRENCY = data.ref_currency || null;
            USER_ITEM_VIEW_MODE = (data.item_view_mode || 'standard').toLowerCase();
            updateRefCurrencyLabel(USER_REF_CURRENCY);
            setUser(USER_ITEM_VIEW_MODE,USER_REF_CURRENCY);
        }
    } catch (err) {
        console.error('Errore recupero utente:', err);
    }
}

function initApp() {
    // Elementi principali del DOM
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const tagFilter = document.getElementById('tagFilter');
    const addItemBtn = document.getElementById('addItemBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    // const exportPdfBtn = document.getElementById('exportPdfBtn'); // non implementato
    const logoutBtn = document.getElementById('logoutBtn');
    const modal = document.getElementById('itemModal');
    const modalClose = document.getElementById('modalClose');
    const modalTitle = document.getElementById('modalTitle');
    const itemForm = document.getElementById('itemForm');
    const viewItemClose = document.getElementById('viewItemClose');
    const viewItemModal = document.getElementById('viewItemModal');

    // Recupera informazioni utente (valuta di riferimento) all'avvio
    fetchUserInfo();

    // Recupera e visualizza gli item all'avvio
    fetchItems();

    // Eventi filtri
    searchInput.addEventListener('input', () => fetchItems());
    categoryFilter.addEventListener('change', () => fetchItems());
    tagFilter.addEventListener('input', () => fetchItems());

    // Toggle avanzato nella modale
    const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
    const modalContentEl = document.querySelector('#itemModal .modal-content');
    const advancedFields = document.querySelector('#itemModal .advanced-fields');
    toggleAdvancedBtn?.addEventListener('click', () => 
    {
        modalContentEl?.classList.toggle('expanded');
        renderMarketParamsFields();
        if (advancedFields) {
            advancedFields.classList.toggle('hidden');
        }
        if (modalContentEl?.classList.contains('expanded')) {
            toggleAdvancedBtn.textContent = 'Nascondi dettagli';
        } else {
            toggleAdvancedBtn.textContent = 'Altre informazioni';
        }
    });
    
    // Aggiorna indicatore valuta di riferimento e conversione
    initPrice(USER_REF_CURRENCY);

    // Eventi bottoni
    addItemBtn?.addEventListener('click', () => {
        clearItemForm();
        modalTitle.textContent = 'Nuovo Item';
        renderEditModal(USER_REF_CURRENCY);
    });
    exportCsvBtn?.addEventListener('click', () => {
        const params = new URLSearchParams();
        if (searchInput.value.trim()) params.append('q', searchInput.value.trim());
        if (categoryFilter.value) params.append('category', categoryFilter.value);
        if (tagFilter.value.trim()) params.append('tags', tagFilter.value.trim());
        window.location.href = `/api/export/csv?${params.toString()}`;
    });
    // exportPdfBtn?.addEventListener('click', () => {
    //     // Da implementare quando la funzionalità sarà pronta
    // });
    logoutBtn?.addEventListener('click', async () => {
        try {
            await fetch('/logout', { method: 'POST' });
        } catch (err) {
            console.error(err);
        }
        window.location.href = '/';
    });

    modalClose.addEventListener('click', closeModal);
    // Chiusura modale su click fuori dalla finestra
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
            viewItemModal?.classList.add('hidden');
        }
    });

    viewItemClose?.addEventListener('click', () => viewItemModal?.classList.add('hidden'));
    
    // Gestione submit del form dell'item (creazione/aggiornamento)
    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const modalTitle = document.getElementById('modalTitle');
        let res = await saveItem();
        if (res.ok) {
            if (modalTitle.textContent != 'Nuovo Item')
                try { await linkToGlobalCatalog(); } catch {};
            closeModal();
            clearItemForm();
            fetchItems(USER_ITEM_VIEW_MODE,USER_REF_CURRENCY);
        } else {
            let data;
            try { data = await res.json(); } catch { data = {}; }
            alert(data.error || 'Errore durante il salvataggio');
        }
    });

    // Aggiungi listener per ricalcolo automatico del prezzo in valuta di riferimento
    const purchasePriceInput = document.getElementById('purchasePrice');
    const currencySelectInput = document.getElementById('currency');
    purchasePriceInput.addEventListener('input', autoCalculateRefPrice);
    currencySelectInput.addEventListener('change', autoCalculateRefPrice);

    // Aggiunte
    document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btnAddInfoLinkItem') {
        e.preventDefault();
        addInfoLinks();
    }
    if (e.target && e.target.id === 'btnAddMarketplaceLinkItem') {
        e.preventDefault();
        addMarketLink();
    }
    });

}

// Calcola automaticamente il prezzo di acquisto nella valuta di riferimento dell'utente
async function autoCalculateRefPrice() {
    const refCur = USER_REF_CURRENCY;
    const priceField = document.getElementById('purchasePrice');
    const currField = document.getElementById('currency');
    const refField = document.getElementById('purchasePriceRef');
    if (!refField) return;
    const amount = parseFloat(priceField.value);
    const fromCur = currField.value;
    if (!refCur || !amount || isNaN(amount) || !fromCur) {
        // Nessun calcolo possibile
        refField.value = '';
        return;
    }
    try {
        const params = new URLSearchParams({ amount: amount, from: fromCur, to: refCur });
        const res = await fetch(`/api/convert?${params.toString()}`);
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data.result === 'number') {
                refField.value = data.result.toFixed(2);
                return;
            }
        }
    } catch (err) {
        console.error('Errore conversione valuta:', err);
    }
    // In caso di errore lascia vuoto
    refField.value = '';
}

// Aggiorna le statistiche del profilo manualmente
async function updateProfileStats() {
    try {
        const res = await fetch('/api/profile/stats');
        if (!res.ok) return;
        const stats = await res.json();
        // Aggiorna gli elementi nel DOM
        const totalSpentEl = document.getElementById('statTotalSpent');
        const totalSoldEl = document.getElementById('statTotalSold');
        const roiEl = document.getElementById('statROI');
        const startDateEl = document.getElementById('statStartDate');
        const daysEl = document.getElementById('statDays');
        if (stats.currency) {
            totalSpentEl.textContent = stats.total_spent.toFixed(2);
            totalSoldEl.textContent = stats.total_sold.toFixed(2);
            roiEl.textContent = (stats.roi !== null && stats.roi !== undefined) ? (stats.roi * 100).toFixed(2) : '-';
        } else {
            totalSpentEl.textContent = '-';
            totalSoldEl.textContent = '-';
            roiEl.textContent = '-';
        }
        startDateEl.textContent = stats.start_date || '-';
        daysEl.textContent = (stats.days_in_collection !== null && stats.days_in_collection !== undefined) ? stats.days_in_collection : '-';
    } catch (err) {
        console.error('Errore aggiornamento statistiche:', err);
    }
}

function renderPriceChartingSection(item){
    const logo = document.getElementById('2mLogo');
    logo.style.backgroundColor = "transparent";
    logo.src = 'https://www.pricecharting.com/images/logo-pricecharting-new.png';
    const src = document.getElementById('2mSource');
    const query = document.getElementById('2mQuery');
    const content = document.getElementById('2mContent');
  
    if (content) content.innerHTML = '<em>Caricamento stima in corso…</em>'; if (src) src.textContent='';
    fetch(`/api/pricecharting-estimate?item_id=${item.id}`)
        .then(r => r.json())
        .then(data => {
        if (!content) return;
        if (data && data.query){
            const qurl = data.query.url || 'PriceCharting';
            const params = data.query.params || {};
            const q = params.q || '';
            src.textContent = `· Fonte: PriceCharting (${qurl})"`;
            query.textContent = `· Query: "${q}"`;
            
        }
        if (data && data.prices) {
        const c = data.prices.currency || '';
        const parts = [];
        if (data.product && (data.product.product_name || data.product.console_name)) {
            const meta = [];
            if (data.product.product_name) meta.push(data.product.product_name);
            if (data.product.console_name) meta.push(`(${data.product.console_name})`);
            parts.push(`<span class="pill"><strong>Prodotto</strong> ${meta.join(' ')}</span>`);
        }
        if (data.prices.loose != null) parts.push(`<span class="pill"><strong>Loose</strong> ${fmtMoney(data.prices.loose, c)}</span>`);
        if (data.prices.cib   != null) parts.push(`<span class="pill"><strong>CIB</strong> ${fmtMoney(data.prices.cib, c)}</span>`);
        if (data.prices.new   != null) parts.push(`<span class="pill"><strong>New</strong> ${fmtMoney(data.prices.new, c)}</span>`);
        if (data.prices.retail_loose_sell != null) parts.push(`<span class="pill"><strong>Retail Loose Sell</strong> ${fmtMoney(data.prices.retail_loose_sell, c)}</span>`);
        if (data.prices.retail_cib_sell   != null) parts.push(`<span class="pill"><strong>Retail CIB Sell</strong> ${fmtMoney(data.prices.retail_cib_sell, c)}</span>`);
        if (data.prices.retail_new_sell   != null) parts.push(`<span class="pill"><strong>Retail New Sell</strong> ${fmtMoney(data.prices.retail_new_sell, c)}</span>`);
        content.innerHTML = parts.length ? parts.join(' ') : '<em>Nessuna stima disponibile.</em>';
      } else {
        const msg = data && data.error ? `Errore PriceCharting: ${data.error}` : 'Nessuna stima disponibile.';
        content.innerHTML = `<em>${msg}</em>`;
      }
    })
    .catch(() => { if (content) content.innerHTML = '<em>Impossibile recuperare la stima al momento.</em>'; });
}

function renderJustTCGSection(item){
  const logo = document.getElementById('2mLogo');
  logo.style.backgroundColor = "transparent";
  logo.src = 'https://miro.medium.com/v2/resize:fit:640/format:webp/1*ZPbRrX5X8kQP8x_LDF1Fww.png';  
  const content = document.getElementById('2mContent');
  const query = document.getElementById('2mQuery');
  const src = document.getElementById('2mSource');

  if (content) content.innerHTML = '<em>Caricamento stima in corso…</em>'; if (src) src.textContent='';
  fetch(`/api/justtcg-estimate?item_id=${item.id}`)
    .then(r => r.json())
    .then(data => {
      if (!content) return;
      if (data && data.query){
        const q   = (data.query.params && (data.query.params.q || '')) || '';
        const g   = (data.query.params && data.query.params.game) ? ` · Gioco: ${data.query.params.game}` : '';
        src.textContent = `· Fonte: JustTCG (${data.query.url})`;
        query.textContent = `· Query: "${q}"`;
        if (data.error) src.textContent += `· Error: ${data.error}`;
      }
      const parts = [];
      if (data.card && (data.card.name || data.card.set_name)){
        const meta = [];
        if (data.card.name) meta.push(data.card.name);
        if (data.card.set_name) meta.push(`(${data.card.set_name})`);
        if (data.card.number) meta.push(`#${data.card.number}`);
        parts.push(`<span class="pill"><strong>Carta</strong> ${meta.join(' ')}</span>`);
      }

      const vars = data.variants || [];
      const c = 'USD';
      const pick = (cond, print) => vars.find(v => v.condition === cond && v.printing === print);

      // combo più utili
      const combos = [
        ['Near Mint','Normal','NM Normal'],
        ['Lightly Played','Normal','LP Normal'],
        ['Near Mint','Foil','NM Foil'],
        ['Lightly Played','Foil','LP Foil']
      ];
      combos.forEach(([cond, print, label])=>{
        const v = pick(cond, print);
        if (v && v.price != null) parts.push(`<span class="pill"><strong>${label}</strong> ${fmtMoney(v.price, c)}</span>`);
      });

      // fallback: mostra qualche variante generica
      if (!vars.length) {
        parts.push('<em>Nessuna variante disponibile.</em>');
      } else if (!parts.some(p => p.includes('NM Normal'))) {
        vars.slice(0,4).forEach(v=>{
          if (v.price != null) parts.push(`<span class="pill"><strong>${v.condition||'?'} / ${v.printing||'?'}</strong> ${fmtMoney(v.price,c)}</span>`);
        });
      }

      if (data.stats){
        parts.push(`<span class="pill"><strong>Media</strong> ${fmtMoney(data.stats.avg,c)}</span>`);
        parts.push(`<span class="pill"><strong>Mediana</strong> ${fmtMoney(data.stats.median,c)}</span>`);
        parts.push(`<span class="pill"><strong>Range</strong> ${fmtMoney(data.stats.min,c)} – ${fmtMoney(data.stats.max,c)}</span>`);
        parts.push(`<span class="pill"><strong>Campioni</strong> ${data.stats.count||0}</span>`);
      }

      content.innerHTML = parts.join(' ') || '<em>Nessuna stima disponibile.</em>';
    })
    .catch(()=>{ if (content) content.innerHTML = '<em>Impossibile recuperare la stima al momento.</em>'; });
}

function renderPriceLegoSection(item){
    const logo = document.getElementById('2mLogo');
    logo.src = 'https://rebrickable.com/static/img/title.png?1692235612.579406';
    const src = document.getElementById('2mSource');
    const query = document.getElementById('2mQuery');
    const content = document.getElementById('2mContent');
    const cat = (item.category || '').toLowerCase();

  fetch(`/api/lego-estimate?item_id=${item.id}`)
    .then(r=>r.json()).then(data=>{
      const best = data && data.best;
      if (best && best.set_number){
        appendChip('legoSetCodeChip','Codice LEGO', best.set_number, best.url || null);
      } else if (data && data.inferred){
        appendChip('legoSetCodeChip','Codice LEGO (stima)', data.inferred, null);
      }
    }).catch(()=>{ if (content) content.innerHTML = '<em>Impossibile recuperare la stima al momento.</em>'; });
}

function renderDiscogsSection(item){
    const logo = document.getElementById('2mLogo');
    logo.src = 'https://www.discogs.com/images/discogs-white.png';
    logo.style.padding = "2px";
    logo.style.backgroundColor = "#000000";
    const src = document.getElementById('2mSource');
    const query = document.getElementById('2mQuery');
    const content = document.getElementById('2mContent');

    if (content) content.innerHTML = '<em>Caricamento stima in corso…</em>';
    if (src) src.textContent='';
    if (query) src.textContent='';

    fetch(`/api/discogs-estimate?item_id=${item.id}`).then(r=>r.json()).then(data=>{
        if (!content) return;
        if (data && data.query)
        {
            
            const qurl = data.query.releases_lookup.url || 'Discogs Search';
            const qparams = data.query.params || {};
            const q = qparams.q || '';
            const release = data.release;
            const error = data.error || null
            if (error)  
            {
                src.textContent = `· Error: (${error})`;
                throw error;
            }
            //const rel = data.query.releases_lookup.id ? ` · Release ID #${data.query.releases_lookup.id}` : '';
            //const psu = data.query.price_suggestions_url ? ` · PriceSuggestions: ${data.query.price_suggestions_url}` : '';
            //const psu = '';
            //src.textContent = `· Fonte: Discogs (${qurl})`;
            //query.textContent = `· Query: "${q}"${rel}${psu}`;
            src.textContent = `· Fonte: Discogs (${qurl})`;
            query.innerHTML = `· Product: <a href="https://www.discogs.com/it/release/${data.query.releases_lookup.id}-${release.artist_names[0]}-${release.title}" target="_blank" rel="noopener">Link</a>`;
            //query.textContent = `· Product: "https://www.discogs.com/it/release/${data.query.releases_lookup.id}-${release.title}"`;
        }
        if (data && data.suggestions)
        {
            const parts = [];
            if (data.release && (data.release.title || data.release.year)){
                const meta=[]; if (data.release.title) meta.push(data.release.title); if (data.release.year) meta.push(`(${data.release.year})`);
                if (data.release.formats && data.release.formats.length) meta.push(`[${data.release.formats.join(', ')}]`);
                parts.push(`<span class="pill"><strong>Release</strong> ${meta.join(' ')}</span>`);
            }
            Object.entries(data.suggestions).forEach(([cond,obj])=>{
                const val = obj && obj.value!=null ? Number(obj.value) : null;
                if (val!=null) parts.push(`<span class="pill"><strong>${cond}</strong> ${fmtMoney(val,'USD')}</span>`);
            });
            if (data.stats){
                const c = data.stats.currency || 'USD';
                parts.push(`<span class="pill"><strong>Media</strong> ${fmtMoney(data.stats.avg,c)}</span>`);
                parts.push(`<span class="pill"><strong>Mediana</strong> ${fmtMoney(data.stats.median,c)}</span>`);
                parts.push(`<span class="pill"><strong>Range</strong> ${fmtMoney(data.stats.min,c)} – ${fmtMoney(data.stats.max,c)}</span>`);
                parts.push(`<span class="pill"><strong>Campioni</strong> ${data.stats.count||0}</span>`);
            }
            content.innerHTML = parts.length ? parts.join(' ') : '<em>Nessuna stima disponibile.</em>';
        } else
        {
            const msg = data && data.error ? `Errore Discogs: ${data.error}` : 'Nessuna stima disponibile.';
            content.innerHTML = `<em>${msg}</em>`;
        }
    }).catch(()=>{ if (content) content.innerHTML = '<em>Impossibile recuperare la stima al momento.</em>'; });
}

function renderStockXSection(item){
    const logo = document.getElementById('2mLogo');
    logo.src = 'https://upload.wikimedia.org/wikipedia/commons/5/58/StockX_logo.svg';
    const src = document.getElementById('2mSource');
    const query = document.getElementById('2mQuery');
    const content = document.getElementById('2mContent');
    if (content) content.innerHTML = '<em>Caricamento stima in corso…</em>'; if (src) src.textContent='';
    fetch(`/api/stockx-estimate?item_id=${item.id}`)
        .then(r => r.json())
        .then(data => {
        if (!content) return;
        if (data && data.query){
            let via = data.query.via || 'StockX'; let info = `Fonte: StockX (${via})`;
            if (data.query.search){ const qp = data.query.search.params || {}; const q = qp.query || qp._search || ''; if (q) info += ` · Query: "${q}"`; }
            if (data.query.detail_endpoint) info += ` · Endpoint: ${data.query.detail_endpoint}`;
            if (data.query.detail && data.query.detail.url) info += ` · Detail: ${data.query.detail.url}`;
            src.textContent = info;
        }
        const parts = [];
        if (data.product && (data.product.name || data.product.urlKey)) {
            const meta = []; if (data.product.name) meta.push(data.product.name); if (data.product.urlKey) meta.push(`(${data.product.urlKey})`);
            parts.push(`<span class="pill"><strong>Modello</strong> ${meta.join(' ')}</span>`);
        }
        if (data.market){
            const c = 'USD';
            if (data.market.lastSale != null)   parts.push(`<span class="pill"><strong>Last Sale</strong> ${fmtMoney(data.market.lastSale, c)}</span>`);
            if (data.market.lowestAsk != null)  parts.push(`<span class="pill"><strong>Lowest Ask</strong> ${fmtMoney(data.market.lowestAsk, c)}</span>`);
            if (data.market.highestBid != null) parts.push(`<span class="pill"><strong>Highest Bid</strong> ${fmtMoney(data.market.highestBid, c)}</span>`);
            if (data.market.deadstockSold != null) parts.push(`<span class="pill"><strong>Sold 12M</strong> ${data.market.deadstockSold}</span>`);
            if (data.market.volatility != null)    parts.push(`<span class="pill"><strong>Volatility</strong> ${Number(data.market.volatility).toFixed(2)}</span>`);
            if (data.market.pricePremium != null)  parts.push(`<span class="pill"><strong>Premium</strong> ${Number(data.market.pricePremium).toFixed(2)}%</span>`);
        }
        if (data.stats){
            const c = data.stats.currency || 'USD';
            parts.push(`<span class="pill"><strong>Media</strong> ${fmtMoney(data.stats.avg, c)}</span>`);
            parts.push(`<span class="pill"><strong>Mediana</strong> ${fmtMoney(data.stats.median, c)}</span>`);
            parts.push(`<span class="pill"><strong>Range</strong> ${fmtMoney(data.stats.min, c)} – ${fmtMoney(data.stats.max, c)}</span>`);
        }
        content.innerHTML = parts.length ? parts.join(' ') : '<em>Nessuna stima disponibile.</em>';
        })
        .catch(()=>{ if (content) content.innerHTML = '<em>Impossibile recuperare la stima al momento.</em>'; });
}

function renderSecondaryMarketSection(item){
    const c = (item.category || '').toLowerCase();
    const isCard = c.includes('card') || c.includes('tradingcard') || c.includes('cardset');
    const isShoes = c.includes('shoes') || c.includes('snickers')
    const isVideo = c.includes('videogiochi') || c.includes('videogames') || c.includes('console');
    const isDisc  = c === 'cd' || c.includes(' cd') || c.startswith ? false : false;
    const isVinyl = c.includes('vinyl') || c.includes('vinile') || c.includes('lp');
    const isLego = c.includes('Lego') || c.includes('lego')
    if (isVinyl || isDisc)
        return renderDiscogsSection(item);
    if (isVideo)
        return renderPriceChartingSection(item);
    if (isLego)
        return renderPriceLegoSection(item);
    if (isCard)
        return renderJustTCGSection(item);
    if (isShoes)
        return renderStockXSection(item);
    return None
}

function drawHistoryChart(rows){
  const canvas = document.getElementById('estChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640; const height = canvas.getAttribute('height') ? parseInt(canvas.getAttribute('height'),10) : 160;
  canvas.width = Math.floor(width * DPR); canvas.height = Math.floor(height * DPR); ctx.scale(DPR, DPR);
  ctx.clearRect(0,0,width,height);
  if (!rows || !rows.length) { ctx.fillStyle = '#94a3b8'; ctx.fillText('Nessuno storico disponibile', 10, 20); return; }
  const xs = rows.map(r => new Date(r.date));
  const ys = rows.map(r => Number((r.median ?? r.avg) ?? 0));
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const pad = {l:32, r:8, t:8, b:20};
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const minX = xs[0].getTime(), maxX = xs[xs.length-1].getTime();
  const xScale = d => pad.l + (W * ((d.getTime()-minX)/((maxX-minX) || 1)));
  const yScale = v => pad.t + H - (H * ((v - yMin)/((yMax - yMin) || 1)));
  // axes
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t+H); ctx.lineTo(pad.l+W, pad.t+H); ctx.stroke();
  // line median
  ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2; ctx.beginPath();
  ys.forEach((y,i)=>{ const x = xScale(xs[i]); const yy = yScale(y); if(i===0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy); }); ctx.stroke();
  ctx.fillStyle = '#0ea5e9'; ys.forEach((y,i)=>{ const x=xScale(xs[i]); const yy=yScale(y); ctx.beginPath(); ctx.arc(x,yy,2.5,0,Math.PI*2); ctx.fill(); });
  // labels
  ctx.fillStyle = '#64748b'; ctx.font = '11px sans-serif';
  ctx.fillText(yMin.toFixed(2), 4, yScale(yMin)); ctx.fillText(yMax.toFixed(2), 4, yScale(yMax));
}

// ===== Global Catalog: Info Links =====
function getCurrentGlobalId(){
  const el = document.getElementById('globalId');
  if (!el) return null;
  const v = (el.value||'').trim();
  return v ? parseInt(v,10) : null;
}

function renderInfoLinks(links){
  const list = document.getElementById('infoLinksList');
  if (!list) return;
  list.innerHTML = '';
  (links||[]).forEach((u, idx)=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<a href="${u}" target="_blank" rel="noopener">${u}</a> <button type="button" data-idx="${idx}" aria-label="Rimuovi">&times;</button>`;
    list.appendChild(chip);
  });
  list.querySelectorAll('button[data-idx]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.getAttribute('data-idx'),10);
      currentInfoLinks.splice(i,1);
      renderInfoLinks(currentInfoLinks);
    });
  });
}


async function saveInfoLinks(){
  const gid = getCurrentGlobalId();
  if (!gid){ alert('Collega prima un elemento del Catalogo Globale.'); return; }
  try{
    const r = await fetch(`/api/global-catalog/${gid}/info-links`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({links: currentInfoLinks})
    });
    const jsn = await r.json();
    if (jsn.ok){ alert('Link salvati.'); } else { alert('Impossibile salvare i link.'); }
  }catch(e){ alert('Errore salvataggio link.'); }
}

// Hook su openModal per caricare i link quando presente global_id
/* (function(){
  const _open = window.openModal;
  window.openModal = function(editItem=null){
    if (typeof _open === 'function'){ _open.apply(this, arguments); }
    const hid = document.getElementById('globalId');
    if (hid && editItem && editItem.global_id){
      hid.value = editItem.global_id;
    }
    loadInfoLinksIfAny();
  };
})(); */












