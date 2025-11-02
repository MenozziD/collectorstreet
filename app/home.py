from flask import jsonify
from app import db

class dashboard():

    # --- Dashboard snapshots (manual/optional) ---
    def ensure_finance_snapshots_table(db_string):
        conn = db.get_db_connection(db_string)
        cur = conn.cursor()
        try:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_finance_daily (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    spent REAL DEFAULT 0,
                    sold  REAL DEFAULT 0,
                    items_bought INTEGER DEFAULT 0,
                    items_sold   INTEGER DEFAULT 0,
                    inventory_value REAL DEFAULT 0,
                    note TEXT
                )
            """)
            conn.commit()
        finally:
            conn.close()

    def api_dashboard_summary(uid,db_string):
        conn = db.get_db_connection(db_string)
        cur = conn.cursor()

        # Totale Speso
        cur.execute("SELECT COALESCE(SUM(purchase_price),0) FROM items WHERE user_id=? AND purchase_price IS NOT NULL", (uid,))
        tot_spent = cur.fetchone()[0]

        cur.execute("SELECT COALESCE(SUM(sale_price),0) FROM items WHERE user_id=? AND sale_price IS NOT NULL", (uid,))
        tot_sold = cur.fetchone()[0]

        cur.execute("SELECT COALESCE(SUM(sale_price - COALESCE(purchase_price,0)),0) FROM items WHERE user_id=? AND sale_price IS NOT NULL", (uid,))
        profit_realized = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM items WHERE user_id=? AND (sale_date IS NULL OR sale_date='')", (uid,))
        in_collection = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*) FROM items WHERE user_id=? AND 
            (marketplace_links IS NOT NULL OR sale_price IS NOT NULL)
        """, (uid,))
        for_sale = cur.fetchone()[0]

        cur.execute("""
            SELECT AVG(julianday(COALESCE(NULLIF(sale_date,''), date('now'))) - julianday(purchase_date))
            FROM items WHERE user_id=? AND purchase_date IS NOT NULL AND purchase_date<>''
        """, (uid,))
        avg_days = cur.fetchone()[0]

        # cur.execute("SELECT * FROM user_finance_daily WHERE user_id=? ORDER BY date DESC LIMIT 1", (uid,))
        # row = cur.fetchone()
        # conn.close()

        #latest_snapshot = dict(row) if row else None
        return jsonify({
            'tot_spent': tot_spent,
            'tot_sold': tot_sold,
            'profit_realized': profit_realized,
            'in_collection': in_collection,
            'for_sale': for_sale,
            'avg_days_in_collection': round(avg_days,1) if avg_days is not None else None,
            'latest_snapshot': None #latest_snapshot
        })

    def api_dashboard_trend(uid,db_string):
        conn = db.get_db_connection(db_string)
        cur = conn.cursor()

        cur.execute("""
            SELECT strftime('%Y-%m', purchase_date) AS ym, COALESCE(SUM(purchase_price),0)
            FROM items
            WHERE user_id=? AND purchase_price IS NOT NULL AND purchase_date IS NOT NULL AND purchase_date<>''
            GROUP BY ym ORDER BY ym
        """, (uid,))
        spent = {r[0]: r[1] for r in cur.fetchall()}

        cur.execute("""
            SELECT strftime('%Y-%m', sale_date) AS ym, COALESCE(SUM(sale_price),0)
            FROM items
            WHERE user_id=? AND sale_price IS NOT NULL AND sale_date IS NOT NULL AND sale_date<>''
            GROUP BY ym ORDER BY ym
        """, (uid,))
        sold = {r[0]: r[1] for r in cur.fetchall()}

        months = sorted(set(spent.keys()) | set(sold.keys()))
        if len(months) > 24:
            months = months[-24:]  # ultimi 24 mesi

        points = [{'month': m, 'spent': float(spent.get(m,0) or 0), 'sold': float(sold.get(m,0) or 0)} for m in months]
        conn.close()
        return jsonify({'points': points})
    
class platform():

    def api_platform_overview(db_string):
        # Versione da portare su DB
        ver = "0.7.1"

        conn = db.get_db_connection(db_string)
        cur = conn.cursor()
        # Utenti
        try:
            cur.execute("SELECT COUNT(*) FROM users")
            total_users = cur.fetchone()[0]
        except Exception:
            total_users = None

        # Items
        try:
            cur.execute("SELECT COUNT(*) FROM items")
            total_items = cur.fetchone()[0]
        except Exception:
            total_items = None

        # Top 5 tag (tags può essere JSON array o stringa 'a,b,c')
        top_tags = []
        try:
            cur.execute("SELECT tags FROM items WHERE tags IS NOT NULL AND TRIM(tags)<>''")
            rows = cur.fetchall()
            from collections import Counter
            cnt = Counter()
            import json as _json
            for (t,) in rows:
                try:
                    val = _json.loads(t)
                    if isinstance(val, list):
                        for tag in val:
                            s = str(tag).strip()
                            if s: cnt[s] += 1
                    else:
                        for s in str(val).split('#'):
                            s = s.strip()
                            if s: cnt[s] += 1
                except Exception:
                    for s in str(t).split('#'):
                        s = s.strip()
                        if s: cnt[s] += 1
            for tag, c in cnt.most_common(5):
                top_tags.append({'tag': tag, 'count': c})
        except Exception:
            top_tags = []

        conn.close()
        return jsonify({'total_users': total_users, 'total_items': total_items, 'top_tags': top_tags, 'ver': ver})