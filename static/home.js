// home.js - Gestisce la visualizzazione della dashboard Home

document.addEventListener('DOMContentLoaded', () => {
    /**
     * Recupera le statistiche dal server e aggiorna grafici e indicatori.
     */
    async function fetchStats() {
        try {
            const res = await fetch('/api/profile/stats');
            if (!res.ok) return;
            const stats = await res.json();
            updateStatsCard(stats);
        } catch (err) {
            console.error('Errore nel recupero delle statistiche', err);
        }
    }

    /**
     * Aggiorna i grafici e gli indicatori della card statistiche.
     * Calcola la larghezza relativa delle barre rispetto al valore massimo.
     * @param {Object} stats Oggetto con totale speso, venduto, roi e valuta
     */
    function updateStatsCard(stats) {
        // Usa la spesa complessiva per confrontare con il totale venduto.
        const totalSpent = stats.total_spent_all || 0;
        const totalSold = stats.total_sold || 0;
        const maxVal = Math.max(totalSpent, totalSold, 1);
        const spentBar = document.querySelector('.bar.spent');
        const soldBar = document.querySelector('.bar.sold');
        if (spentBar && soldBar) {
            const spentWidth = (totalSpent / maxVal) * 100;
            const soldWidth = (totalSold / maxVal) * 100;
            spentBar.style.width = spentWidth + '%';
            soldBar.style.width = soldWidth + '%';
            spentBar.setAttribute('title', `${totalSpent.toFixed(2)} ${stats.currency || ''}`);
            soldBar.setAttribute('title', `${totalSold.toFixed(2)} ${stats.currency || ''}`);
        }
        // Aggiorna i valori numerici
        const spentValEl = document.getElementById('totalSpentVal');
        const soldValEl = document.getElementById('totalSoldVal');
        if (spentValEl) {
            spentValEl.textContent = stats.currency ? `${(stats.total_spent_all || 0).toFixed(2)} ${stats.currency}` : '-';
        }
        if (soldValEl) {
            soldValEl.textContent = stats.currency ? `${(stats.total_sold || 0).toFixed(2)} ${stats.currency}` : '-';
        }
        // Aggiorna ROI
        const roiSpan = document.getElementById('roiPercentage');
        if (roiSpan) {
            if (stats.currency && stats.roi !== null && stats.roi !== undefined) {
                const roiPercent = stats.roi * 100;
                roiSpan.textContent = roiPercent.toFixed(2) + '%';
                roiSpan.style.color = roiPercent >= 0 ? '#28a745' : '#d9534f';
            } else {
                roiSpan.textContent = '-';
                roiSpan.style.color = '';
            }
        }

        // Aggiorna card informative: numero oggetti e giorni di collezione
        const infoItemsCard = document.getElementById('infoItemsCard');
        if (infoItemsCard) {
            const p = infoItemsCard.querySelector('p');
            p.textContent = stats.item_count !== null && stats.item_count !== undefined ? stats.item_count : '-';
        }
        const infoPeriodCard = document.getElementById('infoPeriodCard');
        if (infoPeriodCard) {
            const p = infoPeriodCard.querySelector('p');
            p.textContent = stats.days_in_collection !== null && stats.days_in_collection !== undefined ? stats.days_in_collection : '-';
        }
    }

    /**
     * Recupera gli ultimi oggetti dell'utente per popolare le card di attività personali.
     */
    async function fetchPersonalActivity() {
        try {
            const res = await fetch('/api/items');
            if (!res.ok) return;
            const items = await res.json();
            // Ordina per data di acquisto desc (stringa ISO) o per id desc se mancante
            items.sort((a, b) => {
                const da = a.purchase_date || '';
                const db = b.purchase_date || '';
                if (da && db) {
                    return db.localeCompare(da);
                }
                return b.id - a.id;
            });
            const personalCards = document.querySelectorAll('.personal-card');
            personalCards.forEach((card, index) => {
                const p = card.querySelector('p');
                const title = card.querySelector('h4');
                const item = items[index];
                if (!item) {
                    title.textContent = 'Attività recente';
                    p.textContent = 'Nessuna attività recente';
                } else {
                    // Se l'oggetto ha una data di acquisto, usala; altrimenti mostra "N/A"
                    const date = item.purchase_date || 'Data non disponibile';
                    title.textContent = 'Nuovo oggetto';
                    p.innerHTML = `<strong>${item.name}</strong><br><small>${date}</small>`;
                }
            });
        } catch (err) {
            console.error('Errore nel recupero delle attività personali', err);
        }
    }

    /**
     * Recupera l'ultima attività dell'applicazione (nuovi utenti) da mostrare nella card globale.
     * Questa funzione è chiamata solo se l'utente loggato è l'admin.
     */
    async function fetchGlobalActivity() {
        try {
            const globalCard = document.getElementById('globalCard');
            if (!globalCard) return;
            const res = await fetch('/api/admin/users');
            if (!res.ok) return;
            const users = await res.json();
            // Ordina utenti per id decrescente e cerca il più recente diverso da admin
            users.sort((a, b) => b.id - a.id);
            const newUser = users.find(u => u.username !== 'admin');
            const title = globalCard.querySelector('h4');
            const p = globalCard.querySelector('p');
            if (newUser) {
                title.textContent = 'Nuovo utente';
                p.innerHTML = `<strong>${newUser.username}</strong><br><small>Nickname: ${newUser.nickname || '-'}</small>`;
            } else {
                title.textContent = 'Attività applicazione';
                p.textContent = 'Nessuna nuova attività.';
            }
        } catch (err) {
            console.error('Errore nel recupero delle attività globali', err);
        }
    }

    /**
     * Recupera notizie da Google News RSS in base ai tag degli oggetti nella collezione.
     * Usa il servizio allorigins per bypassare CORS. In caso di errore mostra un messaggio di fallback.
     */
    async function fetchNews() {
        try {
            // Ottieni tutti gli item per determinare i tag unici
            const resItems = await fetch('/api/items');
            if (!resItems.ok) throw new Error('Impossibile recuperare gli oggetti');
            const items = await resItems.json();
            const tagSet = new Set();
            items.forEach(item => {
                if (item.tags) {
                    item.tags.split(',').forEach(t => {
                        const tag = t.trim();
                        if (tag) tagSet.add(tag);
                    });
                }
                // Considera anche la categoria come tag per la ricerca
                if (item.category) {
                    tagSet.add(item.category.trim());
                }
            });
            let query = Array.from(tagSet).join(' OR ');
            if (!query) {
                // Tag predefinito se non ci sono oggetti o tag
                query = 'collezionismo';
            }
            const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=it&gl=IT&ceid=IT:it`;
            // Usa allorigins per superare le limitazioni CORS
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error('Impossibile recuperare le notizie');
            const data = await res.json();
            const parser = new DOMParser();
            const xml = parser.parseFromString(data.contents, 'application/xml');
            const itemsNodes = xml.querySelectorAll('item');
            const newsCards = [document.getElementById('newsCard1'), document.getElementById('newsCard2')];
            newsCards.forEach((card, idx) => {
                const titleEl = card.querySelector('h4');
                const pEl = card.querySelector('p');
                const itemNode = itemsNodes[idx];
                if (itemNode && titleEl && pEl) {
                    const title = itemNode.querySelector('title')?.textContent || 'Notizia';
                    const link = itemNode.querySelector('link')?.textContent || '#';
                    const pubDate = itemNode.querySelector('pubDate')?.textContent || '';
                    titleEl.textContent = title;
                    // Mostra link e data
                    pEl.innerHTML = `<a href="${link}" target="_blank">Apri articolo</a><br><small>${pubDate}</small>`;
                } else if (titleEl && pEl) {
                    titleEl.textContent = 'Novità';
                    pEl.textContent = 'Nessuna notizia disponibile.';
                }
            });
        } catch (err) {
            console.error('Errore nel recupero delle notizie', err);
            // fallback: mostra messaggio di errore
            const newsCards = [document.getElementById('newsCard1'), document.getElementById('newsCard2')];
            newsCards.forEach((card) => {
                const titleEl = card.querySelector('h4');
                const pEl = card.querySelector('p');
                if (titleEl && pEl) {
                    titleEl.textContent = 'Novità';
                    pEl.textContent = 'Impossibile recuperare le notizie.';
                }
            });
        }
    }

    // Associa il click del bottone di aggiornamento statistiche alla funzione fetchStats
    const updateBtn = document.getElementById('updateStatsBtn');
    if (updateBtn) {
        updateBtn.addEventListener('click', fetchStats);
    }

    // ===== Dashboard =====
    async function initDashboard()
    {
        try{
            const s = await fetch('/api/dashboard/summary'); 
            const summary = await s.json();
            if (!summary.error){
            setKPI('kpiSpent', summary.tot_spent);
            setKPI('kpiSold', summary.tot_sold);
            setKPI('kpiProfit', summary.profit_realized);
            setKPI('kpiInCollection', summary.in_collection);
            setKPI('kpiForSale', summary.for_sale);
            setKPI('kpiAvgDays', summary.avg_days_in_collection);
            }
        }catch(e){ console.warn('summary fail', e); }
        
        try{
            const r = await fetch('/api/dashboard/trend');
            const data = await r.json();
            if (data && Array.isArray(data.points)){
            renderTrendChart(data.points);
            }
        }catch(e){ console.warn('trend fail', e); }
        
    }

    function setKPI(id, val)
    {
        const el = document.getElementById(id);
        if (!el) return;
        if (val === null || val === undefined) { el.textContent = '—'; return; }
        if (typeof val === 'number'){
            if (id === 'kpiSpent' || id === 'kpiSold' || id === 'kpiProfit'){
            el.textContent = formatMoney(val);
            } else {
            el.textContent = String(Math.round(val));
            }
        } else {
            el.textContent = String(val);
        }
    }

    function formatMoney(v)
    { 
        try { return (window.USER_REF_CURRENCY || 'EUR') + ' ' + Number(v).toFixed(2); }
        catch(e){ return String(v); }
    }

    let trendChartInstance = null;
    
    function renderTrendChart(points)
    {
        const labels = points.map(p => p.month);
        const spent = points.map(p => p.spent);
        const sold  = points.map(p => p.sold);

        const ctx = document.getElementById('trendChart').getContext('2d');
        if (trendChartInstance){ trendChartInstance.destroy(); }
        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
            labels,
            datasets: [
                { label: 'Speso',  data: spent, borderColor: '#9aa5b1', backgroundColor: 'rgba(154,165,177,0.15)', tension: 0.25, fill: true },
                { label: 'Venduto',data: sold,  borderColor: '#4f8cff', backgroundColor: 'rgba(79,140,255,0.12)', tension: 0.25, fill: true }
            ]
            },
            options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: { beginAtZero: true, ticks: { callback: (v)=> formatMoney(v) } },
                x: { ticks: { maxRotation: 0, autoSkip: true } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx)=> `${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` } }
            },
            elements: { point: { radius: 2 } }
            }
        });
    }

    // ===== Platform Overview =====
    async function initPlatformOverview(){
        try{
            const r = await fetch('/api/platform/overview');
            const data = await r.json();
            if (!data) return;
            const u = document.getElementById('pfUsers');
            const i = document.getElementById('pfItems');
            const v = document.getElementById('pfVer');
            if (u) u.textContent = (data.total_users ?? '—');
            if (i) i.textContent = (data.total_items ?? '—');
            if (v) v.textContent = (data.ver ?? '—');

            const c = document.getElementById('pfTopTags');
            if (c){
            c.innerHTML = '';
            const tags = Array.isArray(data.top_tags) ? data.top_tags : [];
            tags.forEach(t => {
                const span = document.createElement('span');
                span.className = 'tag-pill';
                span.title = `#${t.tag} (${t.count})`;
                span.textContent = `#${t.tag} (${t.count})`;
                c.appendChild(span);
            });
            if (!tags.length){
                c.innerHTML = '<span class="muted">Nessun tag disponibile</span>';
            }
            }
        }catch(e){
            console.warn('platform overview fail', e);
        }
    }

    // Inizializza la pagina caricando statistiche e attività
    fetchStats();
    fetchPersonalActivity();
    fetchGlobalActivity();

    // Dashboard
    try { initDashboard(); } catch(e){}
    try { initPlatformOverview(); } catch(e){}

    // Recupera notizie rilevanti in base ai tag degli oggetti della collezione
    fetchNews();
});