// import the variables and function from module.js
import { renderMarketParamsFields, renderLinks } from './render.js';

// script.js - gestisce login e interazione con l'applicazione
// Global variable to store the current user's reference currency
let USER_REF_CURRENCY = null;
function updateRefCurrencyLabel(){
  const el = document.getElementById('refCurrencyLabel');
  if (el) { el.textContent = USER_REF_CURRENCY || 'EUR'; }
}


// Mappatura categorie -> icone. Le chiavi sono in minuscolo.
const categoryIcons = {
    'videogames': 'gamepad.svg',
    'console': 'tv.svg',
    'action figure': 'robot.svg',
    'trading card': 'tradingcard.svg',
    'cd': 'cd.svg',
    'vynil': 'vynil.svg',
    'other': 'other.svg',
    'sticker': 'sticker.svg',
};

const languageFlags = {
  'ITA': 'https://flagcdn.com/w20/it.png',
  'ENG': 'https://flagcdn.com/w20/gb.png',  // o us se preferisci
  'JAP': 'https://flagcdn.com/w20/jp.png',
  'KOR': 'https://flagcdn.com/w20/kr.png',
  'CHS': 'https://flagcdn.com/w20/cn.png'
};

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
            updateRefCurrencyLabel();
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
    updateRefCurrencyLabel();
    document.getElementById('purchasePrice')?.addEventListener('input', () => { validateFields(); updateConversion(); });
    document.getElementById('currency')?.addEventListener('change', () => { validateFields(); updateConversion(); });
    document.getElementById('purchaseDate')?.addEventListener('change', validateFields);
    document.getElementById('salePrice')?.addEventListener('input', validateFields);
    document.getElementById('saleDate')?.addEventListener('change', validateFields);
    document.getElementById('quantity')?.addEventListener('input', validateFields);

// Eventi bottoni
    addItemBtn?.addEventListener('click', () => {
        clearItemForm();
        modalTitle.textContent = 'Nuovo Item';
        openModal();
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
        const id = document.getElementById('itemId').value;
        const name = document.getElementById('itemName').value.trim();
        const description = document.getElementById('itemDescription').value.trim();
        const language = document.getElementById('itemLanguage').value;
        const category = document.getElementById('itemCategory').value.trim();
        const purchasePrice = document.getElementById('purchasePrice').value;
        const purchaseDate = document.getElementById('purchaseDate').value;
        const salePrice = document.getElementById('salePrice').value;
        const saleDate = document.getElementById('saleDate').value;
        const tags = document.getElementById('itemTags').value.trim();
        const quantity = document.getElementById('quantity').value;
        const conditionVal = document.getElementById('condition').value;
        const currency = document.getElementById('currency').value;
        const imageInput = document.getElementById('image');
        try {
            let res;
            if (id) {
                // Aggiornamento con FormData (può contenere immagine)
                const formData = new FormData();
                formData.append('name', name);
                formData.append('description', description);
                formData.append('language', language);
                formData.append('category', category);
                formData.append('purchase_price', purchasePrice);
                formData.append('purchase_date', purchaseDate);
                formData.append('sale_price', salePrice);
                formData.append('sale_date', saleDate);
                formData.append('marketplace_links', JSON.stringify(stateMarketplaceLinks));
                formData.append('info_links', JSON.stringify(stateInfoLinks));
                formData.append('tags', tags);
                formData.append('quantity', quantity);
                formData.append('condition', conditionVal);
                formData.append('currency', currency);
                // Prezzo in valuta di riferimento può essere opzionale; aggiungilo comunque
                const refVal = document.getElementById('purchasePriceRef').value;
                formData.append('purchase_price_curr_ref', refVal);
                try{
                    const mp = collectMarketParams();
                    if (Object.keys(mp).length) formData.append('market_params', JSON.stringify(mp));
                }
                catch(e)
                {}
                
                if (imageInput.files && imageInput.files[0])
                {
                    formData.append('image', imageInput.files[0]);
                }
                
                res = await fetch(`/api/items/${id}`, {
                    method: 'PUT',
                    body: formData
                });
            } else {
                // Creazione tramite JSON (senza immagine)
                const payload = {
                    name,
                    description,
                    language,
                    category,
                    purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
                    purchase_date: purchaseDate || null,
                    sale_price: salePrice ? parseFloat(salePrice) : null,
                    sale_date: saleDate || null,
                    tags,
                    quantity: quantity ? parseInt(quantity) : null,
                    condition: conditionVal || null,
                    currency
                };
                // Include prezzo in valuta di riferimento se presente
                const refValJson = document.getElementById('purchasePriceRef').value;
                payload.purchase_price_curr_ref = refValJson ? parseFloat(refValJson) : null;
                const mp = collectMarketParams(); if (Object.keys(mp).length) payload.market_params = mp;
                res = await fetch('/api/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (res.ok) {
                closeModal();
                clearItemForm();
                fetchItems();
            } else {
                let data;
                try { data = await res.json(); } catch { data = {}; }
                alert(data.error || 'Errore durante il salvataggio');
            }
        } catch (err) {
            console.error(err);
            alert('Impossibile connettersi al server');
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
        const inp = document.getElementById('infoLinkItemInput');
        const url = (inp?.value || '').trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) { alert('Inserisci un URL che inizi con http:// o https://'); return; }
        if (!stateInfoLinks.includes(url)) stateInfoLinks.push(url);
        inp.value = '';
        renderLinks(stateInfoLinks, 'infoLinksItemList');
    }
    if (e.target && e.target.id === 'btnAddMarketplaceLinkItem') {
        e.preventDefault();
        const inp = document.getElementById('marketplaceLinkItemInput');
        const url = (inp?.value || '').trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) { alert('Inserisci un URL che inizi con http:// o https://'); return; }
        if (!stateMarketplaceLinks.includes(url)) stateMarketplaceLinks.push(url);
        inp.value = '';
        renderLinks(stateMarketplaceLinks, 'marketplaceLinksItemList');
    }
    });

    const _openModalOrig = window.openModal;
    window.openModal = function(editItem = null){
        if (typeof _openModalOrig === 'function') _openModalOrig.apply(this, arguments);

        // inizializza stati
        stateInfoLinks = Array.isArray(editItem?.info_links) ? [...editItem.info_links] : [];
        stateMarketplaceLinks = Array.isArray(editItem?.marketplace_links) ? [...editItem.marketplace_links] : [];

        renderLinks(stateInfoLinks, 'infoLinksItemList');
        renderLinks(stateMarketplaceLinks, 'marketplaceLinksItemList');

        // pulisci input
        const i1 = document.getElementById('infoLinkItemInput'); if (i1) i1.value = '';
        const i2 = document.getElementById('marketplaceLinkItemInput'); if (i2) i2.value = '';
    };

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

async function fetchItems() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const tagFilter = document.getElementById('tagFilter');
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.append('q', searchInput.value.trim());
    if (categoryFilter.value) params.append('category', categoryFilter.value);
    if (tagFilter.value.trim()) params.append('tags', tagFilter.value.trim());
    try {
        const res = await fetch(`/api/items?${params.toString()}`);
        if (res.ok) {
            const items = await res.json();
            renderItems(items);
            populateCategories(items);
        } else if (res.status === 401) {
            // Non autorizzato, forza logout
            window.location.href = '/';
        }
    } catch (err) {
        console.error(err);
    }
}

function renderItems(items) {
    const container = document.getElementById('itemsContainer');
    container.innerHTML = '';
    if (!items || items.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'Nessun item trovato';
        container.appendChild(emptyMsg);
        return;
    }
    items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        // Inserisci immagine se presente
        if (item.image_path) {
            const img = document.createElement('img');
            img.className = 'item-image';
            img.src = `/static/${item.image_path}`;
            img.alt = item.name;
            card.appendChild(img);
        }
        // Inserisci icona categoria e titolo
        const title = document.createElement('h3');
        
        // Contenitore per icona e testo
        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'title-wrapper';
        
        // Icona categoria
        const icon = document.createElement('img');
        icon.className = 'icon';
        if (item.category) {
            const key = item.category.toLowerCase();
            const filename = categoryIcons[key] || 'gamepad.svg';
            icon.src = `/static/icons/${filename}`;
        } else {
            icon.src = `/static/icons/gamepad.svg`;
        }
        icon.alt = 'Icona categoria';
        
        // Icona Lingua
        const flagImg = document.createElement('img');
        flagImg.className = 'icon-languageflag';
        if (item.language && languageFlags[item.language]) {
            flagImg.src = languageFlags[item.language];
            flagImg.alt = item.language;
            flagImg.className = 'icon';
            flagImg.className = 'language-flag';
        }
        
        // Contenitore Categoria e Lancguage icon
        const iconlanguageWrapper = document.createElement('div');
        // iconlanguageWrapper.id = "iconlanguage-div";
        iconlanguageWrapper.class = "container";
        iconlanguageWrapper.appendChild(icon);
        iconlanguageWrapper.appendChild(flagImg);

        titleWrapper.appendChild(iconlanguageWrapper);
        const nameSpan = document.createElement('span');
        nameSpan.id = "nameSpan";
        nameSpan.textContent = item.name;
        nameSpan.style.marginLeft = '6px';
        nameSpan.style.marginRight = '10px';
        titleWrapper.appendChild(nameSpan);

        card.appendChild(titleWrapper);
        if (item.description) {
            const desc = document.createElement('p');
            desc.id = "desc-field";
            desc.textContent = item.description;
            card.appendChild(desc);
        }
        if (item.category) {
            const cat = document.createElement('p');
            cat.innerHTML = `<strong>Categoria:</strong> ${item.category}`;
            card.appendChild(cat);
        }
        if (item.purchase_price !== null && item.purchase_price !== undefined) {
            const pp = document.createElement('p');
            const currency = item.currency || '';
            pp.innerHTML = `<strong>Prezzo Acquisto:</strong> ${item.purchase_price} ${currency}`;
            card.appendChild(pp);
            // Mostra anche il prezzo in valuta di riferimento se disponibile e se l'utente ha impostato una valuta di riferimento
            if (item.purchase_price_curr_ref !== null && item.purchase_price_curr_ref !== undefined && USER_REF_CURRENCY) {
                const ppRef = document.createElement('p');
                ppRef.innerHTML = `<strong>Prezzo Acquisto (Ref):</strong> ${item.purchase_price_curr_ref.toFixed(2)} ${USER_REF_CURRENCY}`;
                card.appendChild(ppRef);
            }
        }
        if (item.purchase_date) {
            const pd = document.createElement('p');
            pd.innerHTML = `<strong>Data Acquisto:</strong> ${item.purchase_date}`;
            card.appendChild(pd);
        }
        if (item.sale_price !== null && item.sale_price !== undefined) {
            const sp = document.createElement('p');
            const currency = item.currency || '';
            sp.innerHTML = `<strong>Prezzo Vendita:</strong> ${item.sale_price} ${currency}`;
            card.appendChild(sp);
        }
        if (item.sale_date) {
            const sd = document.createElement('p');
            sd.innerHTML = `<strong>Data Vendita:</strong> ${item.sale_date}`;
            card.appendChild(sd);
        }
        if (item.quantity !== null && item.quantity !== undefined) {
            const qty = document.createElement('p');
            qty.innerHTML = `<strong>Quantità:</strong> ${item.quantity}`;
            card.appendChild(qty);
        }
        if (item.condition) {
            const cond = document.createElement('p');
            cond.innerHTML = `<strong>Condizione:</strong> ${item.condition}`;
            card.appendChild(cond);
        }
        if (item.time_in_collection !== null && item.time_in_collection !== undefined) {
            const tic = document.createElement('p');
            tic.innerHTML = `<strong>Giorni in collezione:</strong> ${item.time_in_collection}`;
            card.appendChild(tic);
        }
        if (item.roi !== null && item.roi !== undefined) {
            const roi = document.createElement('p');
            const perc = (item.roi * 100).toFixed(2);
            roi.innerHTML = `<strong>ROI:</strong> ${perc}%`;
            card.appendChild(roi);
        }
        /* Valore stimato e range di mercato
        if (item.fair_value !== null && item.fair_value !== undefined) {
            const fv = document.createElement('p');
            const cur = item.currency || '';
            fv.innerHTML = `<strong>Valore stimato:</strong> ${item.fair_value.toFixed(2)} ${cur}`;
            card.appendChild(fv);
            if (item.price_p05 !== null && item.price_p95 !== null) {
                const range = document.createElement('p');
                range.innerHTML = `<strong>Range:</strong> ${item.price_p05.toFixed(2)} - ${item.price_p95.toFixed(2)} ${cur}`;
                card.appendChild(range);
            }
        }
        */    
        if (item.marketplace_link) {
            const link = document.createElement('a');
            link.href = item.marketplace_link;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Vedi su marketplace';
            card.appendChild(link);
        }
        // Tags
        if (item.tags) {
            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'tags';
            const tags = item.tags.split('#').map(t => t.trim()).filter(Boolean);
            tags.forEach(tag => {
                const span = document.createElement('span');
                span.className = 'tag';
                span.textContent = tag;
                tagsDiv.appendChild(span);
            });
            card.appendChild(tagsDiv);
        }
        // Azioni
        const actions = document.createElement('div');
        actions.className = 'actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'edit';
        editBtn.textContent = 'Modifica';
        editBtn.addEventListener('click', () => {
            openModal(item);
        });
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete';
        deleteBtn.textContent = 'Elimina';
        deleteBtn.addEventListener('click', async () => {
            if (confirm('Sei sicuro di voler eliminare questo item?')) {
                try {
                    const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        fetchItems();
                    } else {
                        alert('Errore durante la cancellazione');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Impossibile connettersi al server');
                }
            }
        });
        const viewBtn = document.createElement('button');
        viewBtn.className = 'action-btn';
        viewBtn.textContent = 'Visualizza';
        viewBtn.addEventListener('click', () => openViewModal(item));
        actions.appendChild(viewBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(actions);
        container.appendChild(card);
    });
}

function populateCategories(items) {
    const select = document.getElementById('categoryFilter');
    const current = select.value;
    // Ottieni insieme di categorie uniche
    const categories = new Set();
    items.forEach(item => {
        if (item.category) {
            categories.add(item.category);
        }
    });
    // Svuota l'elenco mantenendo l'opzione 'tutte'
    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Tutte le categorie';
    select.appendChild(defaultOption);
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        if (cat === current) option.selected = true;
        select.appendChild(option);
    });
}

function openModal(item = null) {
    
  // reset label/hints
    updateRefCurrencyLabel();
    setHint('purchasePriceHint',''); setHint('purchaseDateHint',''); setHint('purchasePriceRefHint',''); setHint('salePriceHint',''); setHint('saleDateHint',''); setHint('quantityHint',''); setHint('marketplaceLinkHint','');
    const modalContentEl = document.querySelector('#itemModal .modal-content');
    const advancedFields = document.querySelector('#itemModal .advanced-fields');
    if (modalContentEl && modalContentEl.classList.contains('expanded')) { modalContentEl.classList.remove('expanded'); }
    if (advancedFields && !advancedFields.classList.contains('hidden')) { advancedFields.classList.add('hidden'); }
    const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
    if (toggleAdvancedBtn) toggleAdvancedBtn.textContent = 'Altre informazioni';
    updateRefCurrencyLabel();

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
        if (item && item.market_params) {
            renderMarketParamsFields();
        } else {
            renderMarketParamsFields();
        }
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

function closeModal() {
    const modal = document.getElementById('itemModal');
    stateInfoLinks = [];
    stateMarketplaceLinks = [];
    modal.classList.add('hidden');
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

function openViewModal(item){
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

// === Inline validation & conversion ===
function setHint(id, msg, cls='') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('error','warn','ok');
    if (cls) el.classList.add(cls);
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

function fmtMoney(v, cur){ if (v==null || isNaN(Number(v))) return '-'; return Number(v).toFixed(2) + (cur?(' '+cur):''); }



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

function parseMarketParams(mp){
  try {
    if (!mp) return {};
    if (typeof mp === 'string') return JSON.parse(mp);
    if (typeof mp === 'object') return mp;
  } catch(e){}
  return {};
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


// Stato locale della modale
let stateInfoLinks = [];
let stateMarketplaceLinks = [];


//
function hostFromUrl(u){
  try { return new URL(u).hostname.replace(/^www\./,''); }
  catch { return ''; }
}

// Mini set di SVG inline per i brand più comuni (fallback a favicon Google S2)
const BRAND_SVG = {
  'ebay': `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>`,
  'vinted': `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5"/></svg>`,
  'subito': `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18"/></svg>`,
  'discogs': `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18"/></svg>`,
  'catawiki': `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/></svg>`,
  'stockx': `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L19 5M5 5l14 14"/></svg>`,
  'etsy': `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>`,
  'amazon': `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18c5 4 13 4 18 0"/></svg>`,
  'wallapop': `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20"/></svg>`,
  'facebook': `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20"/></svg>`,
  'depop': `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16"/></svg>`
};

function brandKeyFromHost(host){
  const h = host.toLowerCase();
  if (h.includes('ebay')) return 'ebay';
  if (h.includes('vinted')) return 'vinted';
  if (h.includes('subito')) return 'subito';
  if (h.includes('discogs')) return 'discogs';
  if (h.includes('catawiki')) return 'catawiki';
  if (h.includes('stockx')) return 'stockx';
  if (h.includes('etsy')) return 'etsy';
  if (h.includes('amazon')) return 'amazon';
  if (h.includes('wallapop')) return 'wallapop';
  if (h.includes('facebook') || h.includes('fb')) return 'facebook';
  if (h.includes('depop')) return 'depop';
  return null;
}

function iconHtmlFor(url){
  const host = hostFromUrl(url);
  const key = brandKeyFromHost(host);
  //if (key && BRAND_SVG[key]) return BRAND_SVG[key];
  // fallback su favicon Google
  return `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${host}" alt="">`;
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
