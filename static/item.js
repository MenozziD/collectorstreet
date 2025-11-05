import { renderEditModal, renderViewModal} from './render.js';
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

// Schema dei parametri per categoria
const MARKET_HINTS_SCHEMA = {
  'tradingcard': [
    {key:'game', label:'Gioco', placeholder:'es. Pokémon / MTG', tip:'Gioco TCG (pokemon, mtg, yugioh, ...)' },
    {key:'set_name', label:'Set', placeholder:'es. Base Set', tip:'Nome set/espansione' },
    {key:'number', label:'Numero', placeholder:'es. 4/102', tip:'Numero carta' },
    {key:'language', label:'Lingua', placeholder:'es. ITA/ENG/JP', tip:'Lingua' },
    {key:'printing', label:'Finitura', placeholder:'Normal / Foil', tip:'Normal / Foil / 1st Edition / Unlimited' },
    {key:'tcgplayer_id', label:'TCGplayer ID', placeholder:'es. 123456', tip:'ID diretto per lookup preciso' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ],
  'videogame': [
    {key:'platform', label:'Piattaforma', placeholder:'es. PS2, SNES', tip:'Piattaforma/console' },
    {key:'region', label:'Regione', placeholder:'PAL / NTSC-U / NTSC-J', tip:'Area/Regione' },
    {key:'edition', label:'Edizione', placeholder:'Standard / Limited', tip:'Edizione o variant' },
    {key:'pricecharting_id', label:'PriceCharting ID', placeholder:'es. 12345', tip:'ID diretto se noto' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ],
  'console': [
    {key:'platform', label:'Piattaforma', placeholder:'es. Nintendo Switch', tip:'Console piattaforma' },
    {key:'region', label:'Regione', placeholder:'PAL / NTSC-U / NTSC-J', tip:'Area/Regione' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ],
  'sneakers': [
    {key:'brand', label:'Brand', placeholder:'Nike / Adidas', tip:'Marca' },
    {key:'model', label:'Modello', placeholder:'es. Dunk Low', tip:'Modello' },
    {key:'colorway', label:'Colorway', placeholder:'es. Panda', tip:'Colorway' },
    {key:'sku', label:'SKU', placeholder:'es. DD1391-100', tip:'Codice prodotto' },
    {key:'size', label:'Taglia', placeholder:'US 9 / EU 42.5', tip:'Taglia' },
    {key:'stockx_url_key', label:'StockX URL Key', placeholder:'es. nike-dunk-low-retro-white-black', tip:'Slug univoco' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ],
  'vinyl': [
    {key:'artist', label:'Artista', placeholder:'es. Pink Floyd', tip:'Artista' },
    {key:'album', label:'Album', placeholder:'es. The Dark Side...', tip:'Titolo' },
    {key:'year', label:'Anno', placeholder:'es. 1973', tip:'Anno uscita' },
    {key:'discogs_release_id', label:'Discogs Release ID', placeholder:'es. 1234567', tip:'ID release Discogs' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ],
  'cd': [
    {key:'artist', label:'Artista', placeholder:'es. Daft Punk', tip:'Artista' },
    {key:'album', label:'Album', placeholder:'es. Discovery', tip:'Titolo' },
    {key:'year', label:'Anno', placeholder:'es. 2001', tip:'Anno uscita' },
    {key:'discogs_release_id', label:'Discogs Release ID', placeholder:'es. 7654321', tip:'ID release Discogs' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ],
  'lego': [
    {key:'set_number', label:'Set Number', placeholder:'es. 75336', tip:'Codice set LEGO' },
    {key:'theme', label:'Tema', placeholder:'es. Star Wars', tip:'Tema' },
    {key:'year', label:'Anno', placeholder:'es. 2022', tip:'Anno uscita' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ],
  'default': [
    {key:'brand', label:'Brand', placeholder:'', tip:'Marca' },
    {key:'model', label:'Modello', placeholder:'', tip:'Modello' },
    {key:'serial_number', label:'Serial Number', placeholder:'es. 123456', tip:'Codice univoco del prodotto SKU/HAC/CTR/WUP/DMG/SLES/PPSA'}
  ]
};

const CATEGORY_ALIASES = {
  'snickers': 'sneakers',
  'shoes': 'sneakers',
  'vynil': 'vinyl',
  'videogames': 'videogame',
  'tradingcards': 'tradingcard'
};


const languageFlags = {
  'ITA': 'https://flagcdn.com/w20/it.png',
  'ENG': 'https://flagcdn.com/w20/gb.png',  // o us se preferisci
  'JAP': 'https://flagcdn.com/w20/jp.png',
  'KOR': 'https://flagcdn.com/w20/kr.png',
  'CHS': 'https://flagcdn.com/w20/cn.png'
};

let USER_ITEM_VIEW_MODE = null;
let USER_REF_CURRENCY = null;


function setUser(pUSER_ITEM_VIEW_MODE,pUSER_REF_CURRENCY)
{
    USER_ITEM_VIEW_MODE = pUSER_ITEM_VIEW_MODE;
    USER_REF_CURRENCY = pUSER_REF_CURRENCY;
}

function normalizeCategory(cat){
  const k = (cat || '').toLowerCase().trim();
  if (MARKET_HINTS_SCHEMA[k]) return k;
  if (CATEGORY_ALIASES[k] && MARKET_HINTS_SCHEMA[CATEGORY_ALIASES[k]]) {
    return CATEGORY_ALIASES[k];
  }
  return 'default';
}

async function saveItem() {

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
        const stateInfoLinks = document.getElementById('infoLinksItemList');
        const stateMarketplaceLinks = document.getElementById('marketplaceLinksItemList');
        let res;
        try {
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
                const mp = collectMarketParams();
                if (Object.keys(mp).length) payload.market_params = mp;
                res = await fetch('/api/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
        } catch (err) {
            console.error(err);
            alert('Impossibile connettersi al server');
        }
        return res;
}

async function linkToGlobalCatalog(){
  const itemId = document.getElementById('itemId')?.value;
  const category = document.getElementById('itemCategory')?.value || '';
  const mp = collectMarketParams();
  const hintName = document.getElementById('itemName')?.value || '';
  try{
    const r = await fetch('/api/global-catalog/ensure-or-resolve', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({category, market_params: mp, hint_name: hintName})
    });
    const jsn = await r.json();
    if (jsn.global_id){
      // salva sull'item
      if (itemId){
        await fetch(`/api/items/${itemId}`, {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({global_id: jsn.global_id})
        });
      }
      alert(`Collegato al Catalogo Globale (ID ${jsn.global_id}).`);
    } else {
      alert('Impossibile collegare al Catalogo Globale.');
    }
  }catch(e){ alert('Errore collegamento catalogo.'); }
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

function parseMarketParams(mp){
  try {
    if (!mp) return {};
    if (typeof mp === 'string') return JSON.parse(mp);
    if (typeof mp === 'object') return mp;
  } catch(e){}
  return {};
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
        if (USER_ITEM_VIEW_MODE !== 'compact') {
            if (item.description) {
                const desc = document.createElement('p');
                desc.id = "desc-field";
                desc.textContent = item.description;
                card.appendChild(desc);
            }
        }
        if (item.category) {
            const cat = document.createElement('p');
            cat.innerHTML = `<strong>Categoria:</strong> ${item.category}`;
            card.appendChild(cat);
        }
        if (USER_ITEM_VIEW_MODE !== 'compact') {
            if (item.purchase_price !== null && item.purchase_price !== undefined) {
                const pp = document.createElement('p');
                const currency = item.currency || '';
                pp.innerHTML = `<strong>Prezzo Acquisto:</strong> ${item.purchase_price} ${currency}`;
                card.appendChild(pp);
            }
            // Mostra anche il prezzo in valuta di riferimento se disponibile e se l'utente ha impostato una valuta di riferimento
            if (USER_ITEM_VIEW_MODE !== 'compact') {
                if (item.purchase_price_curr_ref !== null && item.purchase_price_curr_ref !== undefined && USER_REF_CURRENCY) {
                    const ppRef = document.createElement('p');
                    ppRef.innerHTML = `<strong>Prezzo Acquisto (Ref):</strong> ${item.purchase_price_curr_ref.toFixed(2)} ${USER_REF_CURRENCY}`;
                    card.appendChild(ppRef);
                }
            }
        }
        if (item.purchase_date) {
            const pd = document.createElement('p');
            pd.innerHTML = `<strong>Data Acquisto:</strong> ${item.purchase_date}`;
            card.appendChild(pd);
        }
        if (USER_ITEM_VIEW_MODE !== 'compact') {
            if (item.sale_price !== null && item.sale_price !== undefined) {
                const sp = document.createElement('p');
                const currency = item.currency || '';
                sp.innerHTML = `<strong>Prezzo Vendita:</strong> ${item.sale_price} ${currency}`;
                card.appendChild(sp);
            }
        }
        if (USER_ITEM_VIEW_MODE !== 'compact') {
            if (item.sale_date) {
                const sd = document.createElement('p');
                sd.innerHTML = `<strong>Data Vendita:</strong> ${item.sale_date}`;
                card.appendChild(sd);
            }
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
        if (USER_ITEM_VIEW_MODE !== 'compact') {
            if (item.roi !== null && item.roi !== undefined) {
                const roi = document.createElement('p');
                const perc = (item.roi * 100).toFixed(2);
                roi.innerHTML = `<strong>ROI:</strong> ${perc}%`;
                card.appendChild(roi);
            }
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
            let tags = item.tags.split('#').map(t => t.trim()).filter(Boolean);
            // In modalità compatta, limita ai primi 3
            if (USER_ITEM_VIEW_MODE === 'compact') tags = tags.slice(0, 3);
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
            renderEditModal(USER_REF_CURRENCY,item);
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
        viewBtn.addEventListener('click', () => renderViewModal(item));
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

// exporting variables and function
export {saveItem,fetchItems,setUser,linkToGlobalCatalog, MARKET_HINTS_SCHEMA, normalizeCategory};