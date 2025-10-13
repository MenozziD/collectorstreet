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

    // Inizializza la pagina caricando statistiche e attività
    fetchStats();
    fetchPersonalActivity();
    fetchGlobalActivity();

    // Recupera notizie rilevanti in base ai tag degli oggetti della collezione
    fetchNews();
});