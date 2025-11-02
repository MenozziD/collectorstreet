// home.js - Gestisce la visualizzazione della dashboard Home

document.addEventListener('DOMContentLoaded', () => {

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
    fetchPersonalActivity();
    fetchGlobalActivity();

    try { initPlatformOverview(); } catch(e){}

    // Recupera notizie rilevanti in base ai tag degli oggetti della collezione
    fetchNews();
});