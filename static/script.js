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
        //renderMarketParamsFields();
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












