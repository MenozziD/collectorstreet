function renderMarketParamsFields(){
    const wrap = document.getElementById('marketParamsFields');
    if (!wrap) return;

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

function normalizeCategory(cat){
  const k = (cat || '').toLowerCase().trim();
  if (MARKET_HINTS_SCHEMA[k]) return k;
  if (CATEGORY_ALIASES[k] && MARKET_HINTS_SCHEMA[CATEGORY_ALIASES[k]]) {
    return CATEGORY_ALIASES[k];
  }
  return 'default';
}

// exporting variables and function
export {renderMarketParamsFields, renderLinks };