function renderMarketParamsFields(existing){
    const wrap = document.getElementById('marketParamsFields');
    if (!wrap) return;

    const catRaw = document.getElementById('itemCategory')?.value || '';
    const catKey = normalizeCategory(catRaw);
    const schema = MARKET_HINTS_SCHEMA[catKey] || MARKET_HINTS_SCHEMA['default'];

    // Valori esistenti (object) se passati o presi dai campi attuali
    const existingObj = existing ? parseMarketParams(existing) : collectMarketParams();

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

// exporting variables and function
export {renderMarketParamsFields, renderLinks};