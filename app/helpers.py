import json

class hlp():

    def convert_currency(amount: float, from_currency: str, to_currency: str) -> float:
        """
        Convert an amount from one currency to another using exchangerate.host free API.
        If conversion fails or currencies are the same, returns the original amount.

        Args:
            amount (float): The amount to convert.
            from_currency (str): ISO currency code of the source amount.
            to_currency (str): ISO currency code of the target currency.

        Returns:
            float: The converted amount in the target currency.
        """
        if amount is None:
            return None
        # If currencies are missing or identical, return original amount
        if not from_currency or not to_currency or from_currency == to_currency:
            return amount
        # Static approximate exchange rates relative to EUR. These can be updated as needed.
        # Values represent how many EUR equals one unit of the currency. Example: 1 USD ≈ 0.93 EUR.
        rates = {
            'EUR': 1.0,
            'USD': 0.93,
            'JPY': 0.0062,
            'GBP': 1.17,
            'CNY': 0.13
        }
        from_cur = from_currency.upper()
        to_cur = to_currency.upper()
        if from_cur in rates and to_cur in rates:
            # Convert amount to EUR then to target
            try:
                eur_amount = amount * rates[from_cur]
                return eur_amount / rates[to_cur]
            except Exception:
                return amount
        # If unknown currency, return original amount
        return amount

    def _parse_links_field(val):
        """Accetta stringa JSON o lista; restituisce sempre una lista di stringhe http/https."""
        if not val:
            return []
        try:
            if isinstance(val, str):
                obj = json.loads(val)
            else:
                obj = val
        except Exception:
            return []
        out = []
        if isinstance(obj, list):
            for x in obj:
                u = x.get('url').strip() if isinstance(x, dict) and x.get('url') else (str(x).strip() if isinstance(x, str) else '')
                if u and (u.startswith('http://') or u.startswith('https://')):
                    out.append(u)
        return out
    
    def is_admin_user() -> bool:
        # Stile coerente con la tua profile view
        return (session.get('username') or '').lower() == 'admin'

    def generate_canonical_name(category: str, hint_name: str = None) -> str:
        # 1) preferisci hint_name pulito
        if hint_name and str(hint_name).strip():
            return str(hint_name).strip()
        # 2) fallback con timestamp locale
        now = datetime.now().strftime("%Y%m%d%H%M%S")
        cat = (category or 'item').upper().replace(' ', '')
        return f"ITEM_{cat}_{now}"

    def normalize_identifiers(category: str, market_params_json: str) -> dict:
        """
        Estrae dai market_params gli identificatori forti, pronti anche per i campi denormalizzati.
        """
        out = {}
        try:
            mp = json.loads(market_params_json or "{}")
        except Exception:
            mp = {}
        # Mappa minima (estendibile)
        out['ident_serial']       = (mp.get('serial') or mp.get('serial_number') or '').strip() or None
        out['ident_ean']          = (mp.get('ean') or mp.get('barcode') or mp.get('upc') or '').strip() or None
        out['ident_tcg_id']       = (mp.get('tcgplayer_id') or mp.get('justtcg_id') or '').strip() or None
        out['ident_discogs_id']   = (mp.get('discogs_release_id') or mp.get('discogs_master_id') or '').strip() or None
        out['ident_pc_id']        = (mp.get('pricecharting_id') or '').strip() or None
        out['ident_lego_set']     = (mp.get('set_number') or '').strip() or None
        out['ident_stockx_slug']  = (mp.get('stockx_slug') or mp.get('stockx_urlKey') or '').strip() or None
        return out

    def preferred_catalog_key(category: str, idmap: dict) -> str:
        # Ordine di priorità confermato
        if idmap.get('ident_tcg_id'):      return f"tcg:{idmap['ident_tcg_id']}"
        if idmap.get('ident_lego_set'):    return f"lego:{idmap['ident_lego_set']}"
        if idmap.get('ident_discogs_id'):  return f"discogs:{idmap['ident_discogs_id']}"
        if idmap.get('ident_stockx_slug'): return f"stockx:{idmap['ident_stockx_slug']}"
        if idmap.get('ident_pc_id'):       return f"pc:{idmap['ident_pc_id']}"
        if idmap.get('ident_ean'):         return f"ean:{idmap['ident_ean']}"
        if idmap.get('ident_serial'):      return f"serial:{idmap['ident_serial']}"
        # Fallback: firma derivata, stabile
        sig = json.dumps({'cat': (category or '').lower(), **{k:v for k,v in idmap.items() if v}}, sort_keys=True)
        import hashlib
        return "sig:" + hashlib.sha1(sig.encode('utf-8')).hexdigest()[:16]

    def record_price_snapshot(global_id: int, source: str, stats: dict, query_obj: dict):
        """
        Salva/aggiorna 1 record/giorno/fonte su global_catalog_prices.
        stats atteso: {'avg','median','min','max','samples_count'}
        """
        conn = get_db_connection(); cur = conn.cursor()
        ref_date = date.today().isoformat()
        cur.execute("""
            INSERT INTO global_catalog_prices (global_id, ref_date, source, samples_count, avg, median, min, max, query, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(global_id, ref_date, source) DO UPDATE SET
            samples_count=excluded.samples_count,
            avg=excluded.avg, median=excluded.median, min=excluded.min, max=excluded.max,
            query=excluded.query
        """, (
            global_id, ref_date, source,
            int(stats.get('samples_count') or stats.get('count') or 0),
            stats.get('avg'), stats.get('median'), stats.get('min'), stats.get('max'),
            json.dumps(query_obj or {}, ensure_ascii=False)
        ))
        conn.commit(); conn.close()
