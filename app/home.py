from flask import jsonify
from app import db
   
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