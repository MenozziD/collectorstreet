

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
export {renderLinks};