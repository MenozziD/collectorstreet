// profile.js — logica pagina profilo (tabs + stats opzionali)
(function(){
  function qs(sel, el){ return (el||document).querySelector(sel); }
  function qsa(sel, el){ return Array.from((el||document).querySelectorAll(sel)); }

  function bindTabs(){
    const tabs = qsa('.profile-tabs .tab-btn');
    const panels = {
      view: qs('#tab-view'),
      edit: qs('#tab-edit')
    };
    if (!tabs.length || !panels.view || !panels.edit) return;

    function showTab(name){
      tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      Object.entries(panels).forEach(([k,p])=>{
        const active = (k === name);
        p.classList.toggle('active', active);
        p.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      if (history && history.replaceState){
        history.replaceState(null, '', '#' + name);
      }
    }

    tabs.forEach(btn => btn.addEventListener('click', ()=> showTab(btn.dataset.tab)));

    const hash = (location.hash||'').replace('#','');
    if (hash === 'edit' || hash === 'view') showTab(hash); else showTab('view');
  }

  async function refreshStatsIfPresent(){
    const btn = qs('#updateStatsBtn');
    if (!btn) return;

    async function fetchAndRender(){
      try{
        const r = await fetch('/api/dashboard/summary');
        const d = await r.json();
        if (d && !d.error){
          const elSpent = qs('#statTotalSpent');
          const elSold  = qs('#statTotalSold');
          const elROI   = qs('#statROI');
          if (elSpent) elSpent.textContent = (typeof d.tot_spent === 'number') ? d.tot_spent.toFixed(2) : '—';
          if (elSold)  elSold.textContent  = (typeof d.tot_sold  === 'number') ? d.tot_sold.toFixed(2)  : '—';
          if (elROI){
            const profit = d.profit_realized || 0;
            const base   = d.tot_spent || 0;
            const roi = base ? (profit / base) * 100 : null;
            elROI.textContent = (roi !== null) ? roi.toFixed(2) : '—';
          }
        }
      }catch(e){ console.warn('profile stats fetch error', e); }
    }

    btn.addEventListener('click', fetchAndRender);
    // se vuoi l’aggiornamento automatico al load, decommenta:
    // fetchAndRender();
  }

  document.addEventListener('DOMContentLoaded', function(){

    // Logout button handler
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/logout', { method: 'POST' });
        window.location.href = '/';
    });

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

    try { bindTabs(); } catch(e){ console.warn('profile tabs error', e); }
    try { refreshStatsIfPresent(); } catch(e){ console.warn('profile stats error', e); }
    // Personal Stats
    try { fetchStats(); } catch(e){}
    // Dashboard
    try { initDashboard(); } catch(e){}
  });
})();


/*      // Admin user management. Only initialize if the current user is admin.
        const isAdmin = {{ 'true' if is_admin else 'false' }};
        if (isAdmin) {
            async function loadUsers() {
                try {
                    const res = await fetch('/api/admin/users');
                    if (res.ok) {
                        const users = await res.json();
                        const tbody = document.getElementById('usersTableBody');
                        tbody.innerHTML = '';
                        users.forEach(user => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${user.id}</td>
                                <td>${user.username}</td>
                                <td>${user.nickname || ''}</td>
                                <td>${user.ref_currency || ''}</td>
                                <td>
                                    <button class="edit-user" data-id="${user.id}">Modifica</button>
                                    <button class="delete-user" data-id="${user.id}">Elimina</button>
                                </td>
                            `;
                            tbody.appendChild(tr);
                        });
                        // Attach handlers
                        document.querySelectorAll('.edit-user').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const id = btn.dataset.id;
                                const row = btn.closest('tr');
                                const username = row.children[1].textContent;
                                const nickname = row.children[2].textContent;
                                const refCur = row.children[3].textContent;
                                document.getElementById('editUserId').value = id;
                                document.getElementById('newUsername').value = username;
                                document.getElementById('newPassword').value = '';
                                document.getElementById('newNickname').value = nickname;
                                document.getElementById('newRefCurrency').value = refCur;
                            });
                        });
                        document.querySelectorAll('.delete-user').forEach(btn => {
                            btn.addEventListener('click', async () => {
                                const id = btn.dataset.id;
                                if (confirm('Sei sicuro di voler eliminare questo utente?')) {
                                    const resDel = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
                                    if (resDel.ok) {
                                        loadUsers();
                                    } else {
                                        const d = await resDel.json();
                                        alert(d.error || 'Errore durante la cancellazione');
                                    }
                                }
                            });
                        });
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            // Submit handler for user form
            document.getElementById('userForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('editUserId').value;
                const username = document.getElementById('newUsername').value.trim();
                const password = document.getElementById('newPassword').value.trim();
                const nickname = document.getElementById('newNickname').value.trim();
                const refCurrency = document.getElementById('newRefCurrency').value || null;
                if (!username) {
                    alert('Username obbligatorio');
                    return;
                }
                const payload = { username, nickname, ref_currency: refCurrency };
                // Include password only when set (for new user or if provided in edit)
                if (password) payload.password = password;
                let res;
                if (id) {
                    // Update existing user
                    res = await fetch(`/api/admin/users/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    // Create new user (password is required for new user)
                    if (!password) {
                        alert('Password obbligatoria per la creazione di un nuovo utente');
                        return;
                    }
                    res = await fetch('/api/admin/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password, nickname, ref_currency: refCurrency })
                    });
                }
                if (res.ok) {
                    // Clear form and reload list
                    document.getElementById('editUserId').value = '';
                    document.getElementById('userForm').reset();
                    loadUsers();
                } else {
                    const data = await res.json();
                    alert(data.error || 'Errore nel salvataggio utente');
                }
            });
            // Cancel edit button
            document.getElementById('cancelEditBtn').addEventListener('click', () => {
                document.getElementById('editUserId').value = '';
                document.getElementById('userForm').reset();
            });
            // Load users on initial page load
            loadUsers();
        }

        document.getElementById('theme')?.addEventListener('change', (e) => {
            const t = e.target.value || 'original';
            document.body.classList.remove('theme-original','theme-night','theme-sakura');
            document.body.classList.add('theme-' + t);
        }); */
