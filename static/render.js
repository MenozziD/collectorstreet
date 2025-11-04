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


function normalizeCategory(cat){
  const k = (cat || '').toLowerCase().trim();
  if (MARKET_HINTS_SCHEMA[k]) return k;
  if (CATEGORY_ALIASES[k] && MARKET_HINTS_SCHEMA[CATEGORY_ALIASES[k]]) {
    return CATEGORY_ALIASES[k];
  }
  return 'default';
}

// exporting variables and function
export {renderMarketParamsFields, collectMarketParams, renderLinks };