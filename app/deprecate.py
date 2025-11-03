from app import db
import json    

class old():

@app.route('/api/global-catalog/<int:gid>/info-links', methods=['GET'])
@require_login
def get_global_info_links(gid):
    conn = db.get_db_connection(app.config['DATABASE'])
    cur = conn.cursor()
    cur.execute("SELECT info_links FROM global_catalog WHERE id=?", (gid,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return jsonify({'error':'not found'}), 404
    raw = row['info_links'] if isinstance(row, dict) else row[0]
    try:
        links = json.loads(raw) if raw else []
    except Exception:
        links = []
    out = []
    if isinstance(links, list):
        for x in links:
            if isinstance(x, str): out.append(x)
            elif isinstance(x, dict) and x.get('url'): out.append(x['url'])
    return jsonify({'links': out})

@app.route('/api/global-catalog/<int:gid>/info-links', methods=['PUT'])
@require_login
def put_global_info_links(gid):
    data = request.get_json(silent=True) or {}
    links = data.get('links') or []
    clean = []
    if isinstance(links, list):
        for x in links:
            if not x: continue
            if isinstance(x, str): u = x.strip()
            elif isinstance(x, dict) and x.get('url'): u = str(x['url']).strip()
            else: continue
            if u.startswith('http://') or u.startswith('https://'):
                clean.append(u)
    conn = db.get_db_connection(app.config['DATABASE'])
    cur = conn.cursor()
    cur.execute("UPDATE global_catalog SET info_links=?, updated_at=? WHERE id=?", (json.dumps(clean, ensure_ascii=False), datetime.datetime.utcnow().isoformat(), gid))
    conn.commit(); conn.close()
    return jsonify({'ok': True, 'links': clean})

    def ensure_global_by_serial(market_params,category) -> int:
        
        #if not serial or not str(serial).strip():
            #raise ValueError("serial è obbligatorio")
        
        jl = json.loads(market_params)
        jl.get('serial_number')
        serial = str(jl.get('serial_number')).strip()

        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        err = False

        # 1) SELECT (prima con json_extract se disponibile, altrimenti fallback LIKE)
        found = None
        try:
            # Tentativo con JSON1
            cur.execute("""
                SELECT id FROM global_catalog
                WHERE json_extract(market_params, '$.serial') = ?
                OR catalog_key = ?
                LIMIT 1
            """, (serial, f"serial:{serial}"))
            found = cur.fetchone()
        except sqlite3.OperationalError:
            # Fallback senza JSON1
            like = f'%\"serial\":\"{serial}\"%'
            cur.execute("""
                SELECT id FROM global_catalog
                WHERE market_params LIKE ?
                OR catalog_key = ?
                LIMIT 1
            """, (like, f"serial:{serial}"))
            found = cur.fetchone()
        except Exception as e:
            print(e)
            err = True

        if found or err :
            conn.close()
            return found['id'] if isinstance(found, dict) else found[0]

        # 2) INSERT (se non trovato)
        now = datetime.utcnow().isoformat()

        # prepara payload coerente
        idents = dict({})
        idents['serial'] = serial
        try:
            mp = dict(jl or {})
            mp.setdefault('serial', serial)
        except Exception as e:
            print(e)

        links = list([])

        # catalog_key univoca basata su serial
        catalog_key = f"serial:{serial}"

        try:
            cur.execute("""
                INSERT INTO global_catalog
                    (catalog_key, canonical_name, category, identifiers, market_params, info_links, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                catalog_key,
                serial.strip(),
                (category or '').strip() or None,
                json.dumps(idents, ensure_ascii=False),
                json.dumps(mp, ensure_ascii=False),
                json.dumps(links, ensure_ascii=False),
                now, now
            ))
            gid = cur.lastrowid
            conn.commit()
            conn.close()
            return gid
        except sqlite3.IntegrityError:
            # In caso di race condition sul UNIQUE(catalog_key), rileggo
            try:
                cur.execute("SELECT id FROM global_catalog WHERE catalog_key = ? LIMIT 1", (catalog_key,))
                row = cur.fetchone()
                conn.close()
                if row:
                    return row['id'] if isinstance(row, dict) else row[0]
                raise
            except Exception:
                conn.close()
                raise