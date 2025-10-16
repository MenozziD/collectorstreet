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
    toggleAdvancedBtn?.addEventListener('click', () => {
        modalContentEl?.classList.toggle('expanded');
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
    document.getElementById('marketplaceLink')?.addEventListener('input', validateFields);

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
        }
    });
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
        const marketplaceLink = document.getElementById('marketplaceLink').value.trim();
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
                formData.append('marketplace_link', marketplaceLink);
                formData.append('tags', tags);
                formData.append('quantity', quantity);
                formData.append('condition', conditionVal);
                formData.append('currency', currency);
                // Prezzo in valuta di riferimento può essere opzionale; aggiungilo comunque
                const refVal = document.getElementById('purchasePriceRef').value;
                formData.append('purchase_price_curr_ref', refVal);
                if (imageInput.files && imageInput.files[0]) {
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
                    marketplace_link: marketplaceLink || null,
                    tags,
                    quantity: quantity ? parseInt(quantity) : null,
                    condition: conditionVal || null,
                    currency
                };
                // Include prezzo in valuta di riferimento se presente
                const refValJson = document.getElementById('purchasePriceRef').value;
                payload.purchase_price_curr_ref = refValJson ? parseFloat(refValJson) : null;
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
        // Valore stimato e range di mercato
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
            const tags = item.tags.split(',').map(t => t.trim()).filter(Boolean);
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
    const marketplaceLink = document.getElementById('marketplaceLink');
    const itemTags = document.getElementById('itemTags');
    const quantity = document.getElementById('quantity');
    const condition = document.getElementById('condition');
    const imageInput = document.getElementById('image');
    const currencySelect = document.getElementById('currency');
    const purchasePriceRef = document.getElementById('purchasePriceRef');
    if (item) {
        modalTitle.textContent = 'Modifica Item';
        itemId.value = item.id;
        itemName.value = item.name || '';
        itemDescription.value = item.description || '';
        itemLanguage.value = item.language || '';
        itemCategory.value = item.category || '';
        purchasePrice.value = item.purchase_price !== null && item.purchase_price !== undefined ? item.purchase_price : '';
        purchaseDate.value = item.purchase_date || '';
        salePrice.value = item.sale_price !== null && item.sale_price !== undefined ? item.sale_price : '';
        saleDate.value = item.sale_date || '';
        marketplaceLink.value = item.marketplace_link || '';
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
        clearItemForm();
        // Reset reference price field
        if (purchasePriceRef) purchasePriceRef.value = '';
    }
    modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('itemModal');
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
    document.getElementById('marketplaceLink').value = '';
    document.getElementById('itemTags').value = '';
    document.getElementById('quantity').value = '1';
    document.getElementById('condition').value = '';
    document.getElementById('image').value = '';
    document.getElementById('currency').value = '';
    const refInput = document.getElementById('purchasePriceRef');
    if (refInput) refInput.value = '';
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

    // Link
    const link = document.getElementById('marketplaceLink').value.trim();
    if (link && !/^https?:\/\//i.test(link)) setHint('marketplaceLinkHint','Il link deve iniziare con http:// o https://','warn');
    else setHint('marketplaceLinkHint','', '');
}
