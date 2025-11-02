import os
from app import db,hlp
from datetime import datetime, date
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file

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
        cur.execute("SELECT COALESCE(SUM(purchase_price_curr_ref),0) FROM items WHERE user_id=? AND purchase_price_curr_ref IS NOT NULL", (uid,))
        tot_spent = cur.fetchone()[0]

        cur.execute("SELECT COALESCE(SUM(sale_price),0) FROM items WHERE user_id=? AND sale_price IS NOT NULL", (uid,))
        tot_sold = cur.fetchone()[0]

        cur.execute("SELECT COALESCE(SUM(sale_price - COALESCE(purchase_price_curr_ref,0)),0) FROM items WHERE user_id=? AND sale_price IS NOT NULL", (uid,))
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

    def api_dashboard_trend(db_string):
        uid = session.get('user_id')
        conn = db.get_db_connection(db_string)
        cur = conn.cursor()

        cur.execute("""
            SELECT strftime('%Y-%m', purchase_date) AS ym, COALESCE(SUM(purchase_price_curr_ref),0)
            FROM items
            WHERE user_id=? AND purchase_price_curr_ref IS NOT NULL AND purchase_date IS NOT NULL AND purchase_date<>''
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
         

class prf():

    #app.config['UPLOAD_FOLDER']
    def compute_profile_stats(db_string,up_string,user: dict) -> dict:
        """
        Compute summary statistics for the user's collection in their reference currency.

        Args:
            user (dict): Dictionary representing the logged-in user, containing at least 'ref_currency'.

        Returns:
            dict: A dictionary with total_spent, total_sold, roi, start_date, days_in_collection and currency keys.
        """
        ref = user.get('ref_currency') if user else None
        # If no reference currency is set, return zeros without computing totals
        if not ref:
            return {
                'total_spent': 0.0,
                'total_sold': 0.0,
                'roi': None,
                'start_date': None,
                'days_in_collection': None,
                'currency': None
            }
        # Somme per le statistiche
        total_spent_all: float = 0.0  # somma speso su tutti gli oggetti
        total_spent_sold: float = 0.0  # somma speso solo per gli oggetti venduti
        total_sold: float = 0.0        # somma venduto (incasso)
        item_count: int = 0
        first_date = None
        # Fetch only the items belonging to this user
        conn = db.get_db_connection(db_string)
        cur = conn.cursor()
        user_id = user.get('id') if user else None
        if user_id:
            cur.execute("SELECT * FROM items WHERE user_id = ?", (user_id,))
        else:
            cur.execute("SELECT * FROM items WHERE 1=0")  # no items for anonymous user
        items = cur.fetchall()
        conn.close()
        item_count = len(items)
        for item in items:
            # Calcola l'importo di acquisto convertito nella valuta di riferimento
            purchase_val: float = 0.0
            if item['purchase_price'] is not None:
                try:
                    amt = float(item['purchase_price'])
                except Exception:
                    amt = 0.0
                if item['currency']:
                    try:
                        purchase_val = hlp.convert_currency(amt, item['currency'], ref)
                    except Exception:
                        purchase_val = amt
                else:
                    purchase_val = amt
                total_spent_all += purchase_val
            # Se l'oggetto è stato venduto, aggiungi il costo all'ammontare speso per ROI
            if item['sale_price'] is not None:
                if item['purchase_price'] is not None:
                    total_spent_sold += purchase_val
                # Calcola l'importo di vendita convertito
                try:
                    s_amt = float(item['sale_price'])
                except Exception:
                    s_amt = 0.0
                sale_val = s_amt
                if item['currency']:
                    try:
                        sale_val = hlp.convert_currency(s_amt, item['currency'], ref)
                    except Exception:
                        sale_val = s_amt
                total_sold += sale_val
            # Determina la data di acquisto più antica per calcolare la durata della collezione
            if item['purchase_date']:
                try:
                    dt = datetime.strptime(item['purchase_date'], '%Y-%m-%d').date()
                    if first_date is None or dt < first_date:
                        first_date = dt
                except Exception:
                    pass
        # ROI calcolato solo sugli oggetti venduti
        roi = None
        if total_spent_sold > 0:
            roi = (total_sold - total_spent_sold) / total_spent_sold
        start_date_str = None
        days_in_collection = None
        if first_date:
            start_date_str = first_date.isoformat()
            days_in_collection = (date.today() - first_date).days
        return {
            'total_spent': total_spent_sold,      # speso sui venduti
            'total_spent_all': total_spent_all,  # speso complessivo (tutti gli oggetti)
            'total_sold': total_sold,
            'roi': roi,
            'start_date': start_date_str,
            'days_in_collection': days_in_collection,
            'item_count': item_count,
            'currency': ref
        }

    def api_profile_stats(db_string,up_string):
        """
        Endpoint to compute and return the current logged-in user's collection statistics
        in JSON format. Used by the front-end to refresh stats manually.
        """
        user_id = session.get('user_id')
        conn = db.get_db_connection(db_string)
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        conn.close()
        user_dict = dict(user) if user else {}
        stats = prf.compute_profile_stats(db_string,up_string, user_dict)
        return jsonify(stats)

    def profile_info(db_string,up_string):
        """
        Display and edit the logged-in user's profile. Supports GET (view) and POST (update).
        """
        user_id = session.get('user_id')
        conn = db.get_db_connection(db_string)
        cur = conn.cursor()
        if request.method == 'POST':
            form = request.form
            item_view_mode = form.get('item_view_mode')
            files = request.files
            nickname = form.get('nickname')
            ref_currency = form.get('ref_currency')
            theme = form.get('theme')
            vinted_link = form.get('vinted_link')
            cardmarket_link = form.get('cardmarket_link')
            ebay_link = form.get('ebay_link')
            facebook_link = form.get('facebook_link')
            profile_image = files.get('profile_image')
            fields = []
            values = []
            if nickname is not None:
                fields.append('nickname = ?')
                values.append(nickname)
            if ref_currency is not None:
                fields.append('ref_currency = ?')
                values.append(ref_currency)
            if theme:
                fields.append('theme = ?')
                values.append(theme)
            if vinted_link is not None:
                fields.append('vinted_link = ?')
                values.append(vinted_link)
            if cardmarket_link is not None:
                fields.append('cardmarket_link = ?')
                values.append(cardmarket_link)
            if ebay_link is not None:
                fields.append('ebay_link = ?')
                values.append(ebay_link)
            if facebook_link is not None:
                fields.append('facebook_link = ?')
                values.append(facebook_link)
            if item_view_mode is not None:
                fields.append('item_view_mode = ?')
                values.append(item_view_mode)                
            # Handle profile image upload
            if profile_image and profile_image.filename:
                ext = os.path.splitext(profile_image.filename)[1].lower()
                if ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
                    unique_name = profile_image.filename
                    save_path = os.path.join(up_string, unique_name)
                    profile_image.save(save_path)
                    image_rel_path = f"uploads/{unique_name}"
                    fields.append('profile_image_path = ?')
                    values.append(image_rel_path)
            if fields:
                values.append(user_id)
                cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
                conn.commit()
            # Refresh user data after update
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cur.fetchone()
            conn.close()
            user_dict = dict(user) if user else {}
            # Compute statistics for display
            stats = prf.compute_profile_stats(db_string, up_string, user_dict)
            is_admin = user_dict.get('username') == 'admin'
            return render_template('profile.html', user=user_dict, updated=True, stats=stats, is_admin=is_admin)
        else:
            # GET request: fetch user and compute stats
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cur.fetchone()
            conn.close()
            user_dict = dict(user) if user else {}
            stats = prf.compute_profile_stats(db_string, up_string, user_dict)
            is_admin = user_dict.get('username') == 'admin'
            return render_template('profile.html', user=user_dict, stats=stats, is_admin=is_admin)
        

