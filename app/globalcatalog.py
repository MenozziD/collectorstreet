from app import hlp,db
from datetime import datetime, date
import json

class gc():

    IDENT_BACKEND_MAP = {
        'serial':          {'json_keys': ['serial', 'serial_number'], 'ckey': 'serial'},
        'ean':             {'json_keys': ['ean', 'barcode', 'upc'],    'ckey': 'ean'},
        'lego_set':        {'json_keys': ['set_number'],               'ckey': 'lego'},
        'pc_id':           {'json_keys': ['pricecharting_id'],         'ckey': 'pc'},
        'discogs_id':      {'json_keys': ['discogs_release_id', 'discogs_master_id'], 'ckey': 'discogs'},
        'tcgplayer_id':    {'json_keys': ['tcgplayer_id', 'justtcg_id'], 'ckey': 'tcg'},
        'stockx_slug':     {'json_keys': ['stockx_slug', 'stockx_urlKey'], 'ckey': 'stockx'},
    }

    

    def ensure_global_by_identifiers(db_string, market_params: str, category: str, hint_name: str = None) -> int:
        idmap = hlp.normalize_identifiers(category, market_params)
        catalog_key = hlp.preferred_catalog_key(category, idmap)

        conn = db.get_db_connection(db_string)
        cur = conn.cursor()
        # Cerca per catalog_key
        cur.execute("SELECT id FROM global_catalog WHERE catalog_key = ? LIMIT 1", (catalog_key,))
        row = cur.fetchone()
        if row:
            gid = row['id'] if isinstance(row, dict) else row[0]
            # UPDATE consentito solo ad admin
            if hlp.is_admin_user():
                sets = []
                params = []
                for col, val in idmap.items():
                    if val:
                        sets.append(f"{col}=?"); params.append(val)
                if sets:
                    params.extend([datetime.utcnow().isoformat(), gid])
                    cur.execute(f"UPDATE global_catalog SET {', '.join(sets)}, updated_at=? WHERE id=?", params)
                    conn.commit()
            conn.close(); return gid

        # CREATE (consentito a tutti)
        canonical_name = hlp.generate_canonical_name(category, hint_name)
        
        cur.execute("""
            INSERT INTO global_catalog (catalog_key, canonical_name, category, identifiers, market_params, info_links, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            catalog_key, canonical_name, category,
            market_params, market_params, json.dumps([], ensure_ascii=False),
            datetime.now().isoformat(), datetime.now().isoformat()
        ))
        gid = cur.lastrowid

        # Denormalizza gli id forti
        sets = []
        params = []
        for col, val in idmap.items():
            if val:
                sets.append(f"{col}=?"); params.append(val)
        if sets:
            params.extend([gid])
            cur.execute(f"UPDATE global_catalog SET {', '.join(sets)} WHERE id=?", params)

        conn.commit(); conn.close()
        return gid
