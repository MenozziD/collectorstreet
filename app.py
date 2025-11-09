import os
import requests
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
import sqlite3
import csv
import io
from dotenv import load_dotenv
from datetime import datetime, date
import json
from app import db, hlp, gc, dashboard, platform, prf 


def create_app(db_path: str = "database.db") -> Flask:
    """
    Factory function to create and configure the Flask application.

    Args:
        db_path (str): Path to the SQLite database file.

    Returns:
        Flask: Configured Flask application.
    """
    app = Flask(__name__, static_folder='static', template_folder='templates')
    # Secret key for session management. In production this should be a strong random value.
    app.config['SECRET_KEY'] = 'replace-this-with-a-secret-key'
    app.config['DATABASE'] = os.path.join(os.path.dirname(__file__), db_path)

    # Configure upload folder for images
    upload_folder = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder
    # Initialize database on app creation
    db.init_db(app.config['DATABASE'])
    dashboard.ensure_finance_snapshots_table(app.config['DATABASE'])
  

    def estimate_valuation(item: sqlite3.Row) -> dict:
        """
        Estimate a fair market value and price range for an item using a simple heuristic.
        For this MVP, the function uses the purchase price or sale price as a base and applies
        multipliers to derive a range. If both prices are missing or zero, returns None values.

        Args:
            item (sqlite3.Row): The database row representing the item.

        Returns:
            dict: A dictionary with keys fair_value, price_p05, price_p95 and valuation_date.
        """
        base_price = None
        # Normalize category to determine which services to query
        try:
            cat = (item['category'] or '').lower()
        except Exception:
            cat = ''
        # Build a list of functions to query based on category
        price_fetchers = []
        if cat == 'trading card':
            price_fetchers.extend([
                get_tcgplayer_market_price,
                get_justtcg_market_price
            ])
        # For video games and similar categories, try PriceCharting and eBay
        if cat in ('videogames', 'video games', 'console', 'cd', 'vynil', 'music', 'other', 'action figure'):
            price_fetchers.extend([
                get_pricecharting_market_price,
                get_ebay_market_price
            ])
        # As a catch-all, always append eBay as last resort if not already in list
        if get_ebay_market_price not in price_fetchers:
            price_fetchers.append(get_ebay_market_price)
        # Attempt each fetcher until a price is found
        for fetch_fn in price_fetchers:
            try:
                m_price = fetch_fn(item['name'])
            except Exception:
                m_price = None
            if m_price:
                base_price = m_price
                break
        # If still no external price, fallback to sale_price or purchase_price
        if base_price is None:
            try:
                if item['sale_price'] is not None and float(item['sale_price']) > 0:
                    base_price = float(item['sale_price'])
                elif item['purchase_price'] is not None and float(item['purchase_price']) > 0:
                    base_price = float(item['purchase_price'])
            except Exception:
                base_price = None
        if not base_price:
            return {
                'fair_value': None,
                'price_p05': None,
                'price_p95': None,
                'valuation_date': None
            }
        # Apply simple multipliers to compute median and range
        fair_value = base_price * 1.2  # assume 20% appreciation
        price_p05 = base_price * 0.8  # -20% low estimate
        price_p95 = base_price * 1.4  # +40% high estimate
        # If we fetched market price from TCGPlayer, it's denominated in USD. Convert to the item's currency if known.
        try:
            if cat == 'trading card':
                item_currency = item['currency']
                if item_currency and item_currency.upper() != 'USD':
                    # Convert each value from USD to the item's currency
                    fair_value = hlp.convert_currency(fair_value, 'USD', item_currency)
                    price_p05 = hlp.convert_currency(price_p05, 'USD', item_currency)
                    price_p95 = hlp.convert_currency(price_p95, 'USD', item_currency)
        except Exception:
            # Ignore conversion errors and keep values in USD
            pass
        val_date = date.today().isoformat()
        return {
            'fair_value': fair_value,
            'price_p05': price_p05,
            'price_p95': price_p95,
            'valuation_date': val_date
        }

    # def compute_profile_stats(user: dict) -> dict:
    #     """
    #     Compute summary statistics for the user's collection in their reference currency.

    #     Args:
    #         user (dict): Dictionary representing the logged-in user, containing at least 'ref_currency'.

    #     Returns:
    #         dict: A dictionary with total_spent, total_sold, roi, start_date, days_in_collection and currency keys.
    #     """
    #     ref = user.get('ref_currency') if user else None
    #     # If no reference currency is set, return zeros without computing totals
    #     if not ref:
    #         return {
    #             'total_spent': 0.0,
    #             'total_sold': 0.0,
    #             'roi': None,
    #             'start_date': None,
    #             'days_in_collection': None,
    #             'currency': None
    #         }
    #     # Somme per le statistiche
    #     total_spent_all: float = 0.0  # somma speso su tutti gli oggetti
    #     total_spent_sold: float = 0.0  # somma speso solo per gli oggetti venduti
    #     total_sold: float = 0.0        # somma venduto (incasso)
    #     item_count: int = 0
    #     first_date = None
    #     # Fetch only the items belonging to this user
    #     conn = db.get_db_connection(app.config['DATABASE'])
    #     cur = conn.cursor()
    #     user_id = user.get('id') if user else None
    #     if user_id:
    #         cur.execute("SELECT * FROM items WHERE user_id = ?", (user_id,))
    #     else:
    #         cur.execute("SELECT * FROM items WHERE 1=0")  # no items for anonymous user
    #     items = cur.fetchall()
    #     conn.close()
    #     item_count = len(items)
    #     for item in items:
    #         # Calcola l'importo di acquisto convertito nella valuta di riferimento
    #         purchase_val: float = 0.0
    #         if item['purchase_price'] is not None:
    #             try:
    #                 amt = float(item['purchase_price'])
    #             except Exception:
    #                 amt = 0.0
    #             if item['currency']:
    #                 try:
    #                     purchase_val = hlp.convert_currency(amt, item['currency'], ref)
    #                 except Exception:
    #                     purchase_val = amt
    #             else:
    #                 purchase_val = amt
    #             total_spent_all += purchase_val
    #         # Se l'oggetto è stato venduto, aggiungi il costo all'ammontare speso per ROI
    #         if item['sale_price'] is not None:
    #             if item['purchase_price'] is not None:
    #                 total_spent_sold += purchase_val
    #             # Calcola l'importo di vendita convertito
    #             try:
    #                 s_amt = float(item['sale_price'])
    #             except Exception:
    #                 s_amt = 0.0
    #             sale_val = s_amt
    #             if item['currency']:
    #                 try:
    #                     sale_val = hlp.convert_currency(s_amt, item['currency'], ref)
    #                 except Exception:
    #                     sale_val = s_amt
    #             total_sold += sale_val
    #         # Determina la data di acquisto più antica per calcolare la durata della collezione
    #         if item['purchase_date']:
    #             try:
    #                 dt = datetime.strptime(item['purchase_date'], '%Y-%m-%d').date()
    #                 if first_date is None or dt < first_date:
    #                     first_date = dt
    #             except Exception:
    #                 pass
    #     # ROI calcolato solo sugli oggetti venduti
    #     roi = None
    #     if total_spent_sold > 0:
    #         roi = (total_sold - total_spent_sold) / total_spent_sold
    #     start_date_str = None
    #     days_in_collection = None
    #     if first_date:
    #         start_date_str = first_date.isoformat()
    #         days_in_collection = (date.today() - first_date).days
    #     return {
    #         'total_spent': total_spent_sold,      # speso sui venduti
    #         'total_spent_all': total_spent_all,  # speso complessivo (tutti gli oggetti)
    #         'total_sold': total_sold,
    #         'roi': roi,
    #         'start_date': start_date_str,
    #         'days_in_collection': days_in_collection,
    #         'item_count': item_count,
    #         'currency': ref
    #     }

    @app.route('/')
    def home():
        """
        Root route. If user is logged in, render the main application, otherwise show login.
        """
        if not session.get('logged_in'):
            return render_template('login.html')
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        user_id = session.get('user_id')
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        conn.close()
        user_dict = dict(user) if user else {}
        return render_template('index.html', user=user_dict)

    @app.route('/login', methods=['POST'])
    def login():
        """
        Handle login requests. Expects JSON payload with 'username' and 'password'.
        On success, sets session and returns 200; on failure returns 401.
        """
        data = request.get_json() or {}
        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return jsonify({'error': 'Missing credentials'}), 400
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password))
        user = cur.fetchone()
        conn.close()
        if user:
            session['logged_in'] = True
            session['user_id'] = user['id']
            session['username'] = user['username']
            return jsonify({'message': 'Login successful'})
        return jsonify({'error': 'Invalid credentials'}), 401

    @app.route('/logout', methods=['POST'])
    def logout():
        """
        Log the user out by clearing the session.
        """
        session.clear()
        return jsonify({'message': 'Logged out'})

    def require_login(f):
        """
        Decorator to ensure that a route requires a logged in user.
        Returns 401 if user is not authenticated.
        """
        from functools import wraps
        @wraps(f)
        def decorated(*args, **kwargs):
            if not session.get('logged_in'):
                return jsonify({'error': 'Unauthorized'}), 401
            return f(*args, **kwargs)
        return decorated

    @app.route('/api/items', methods=['GET'])
    @require_login
    def get_items():
        """
        Retrieve all items or filter them by search query, category or tags.
        Optional query parameters:
            q: text to search within name and description
            category: exact match on category
            tags: comma-separated list of tags to filter (item must include all tags)
        Returns JSON list of items with computed time_in_collection and ROI.
        """
        query = request.args.get('q', '', type=str).strip().lower()
        category = request.args.get('category', '', type=str).strip().lower()
        tags_param = request.args.get('tags', '', type=str).strip().lower()
        tags_filter = [t.strip() for t in tags_param.split(',') if t.strip()] if tags_param else []
        # Only retrieve items belonging to the logged-in user
        user_id = session.get('user_id')
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        if user_id is not None:
            cur.execute("SELECT * FROM items WHERE user_id = ?", (user_id,))
        else:
            # In the unlikely case there is no user_id, return empty list
            items = []
            conn.close()
            return jsonify([])
        items = cur.fetchall()
        conn.close()
        result = []
        for item in items:
            # Apply filters
            if query and query not in (item['name'] or '').lower() and query not in (item['description'] or '').lower():
                continue
            if category and category != (item['category'] or '').lower():
                continue
            item_tags = [t.strip().lower() for t in (item['tags'] or '').split(',') if t.strip()]
            if tags_filter and not all(tag in item_tags for tag in tags_filter):
                continue
            info_links = []
            if item['info_links']:
                try:
                    info_links = json.loads(item['info_links']) if item['info_links'] else []
                except Exception:
                    info_links = [] 
            marketplace_links = [] 
            if item['marketplace_links']:
                try:
                    marketplace_links = json.loads(item['marketplace_links']) if item['marketplace_links'] else []
                except Exception:
                    marketplace_links = [] 
            # Compute derived fields
            time_in_collection = None
            roi = None
            if item['purchase_date']:
                try:
                    purchase_date = datetime.strptime(item['purchase_date'], '%Y-%m-%d').date()
                    if item['sale_date']:
                        delta = datetime.strptime(item['sale_date'], '%Y-%m-%d').date() - purchase_date
                    else:
                        delta = date.today() - purchase_date 
                    time_in_collection = delta.days
                except ValueError:
                    time_in_collection = None
            if item['purchase_price'] and item['sale_price'] and item['purchase_price'] != 0:
                try:
                    roi = (item['sale_price'] - item['purchase_price']) / item['purchase_price']
                except Exception:
                    roi = None
            # Estimate valuation for this item
            # valuation = estimate_valuation(item)
            valuation = {
                'fair_value' : 0,
                'price_p05': 0,
                'price_p95': 0,
                'valuation_date': 0
            }
            try:
                mp = json.loads(item['market_params']) if item['market_params'] else None
            except Exception:
                mp = item['market_params']  # se è già dict o è stringa non-JSON

            result.append({
                'id': item['id'],
                'name': item['name'],
                'description': item['description'],
                'language': item['language'],
                'category': item['category'],
                'market_params': mp,
                'purchase_price': item['purchase_price'],
                'purchase_price_curr_ref': item['purchase_price_curr_ref'],
                'purchase_date': item['purchase_date'],
                'sale_price': item['sale_price'],
                'sale_date': item['sale_date'],
                'marketplace_links': marketplace_links,
                'info_links': info_links,
                'tags': item['tags'],
                'image_path': item['image_path'],
                'quantity': item['quantity'],
                'condition': item['condition'],
                'currency': item['currency'],
                'time_in_collection': time_in_collection,
                'roi': roi,
                'fair_value': valuation.get('fair_value'),
                'price_p05': valuation.get('price_p05'),
                'price_p95': valuation.get('price_p95'),
                'valuation_date': valuation.get('valuation_date'),
                'global_id': item['global_id'],
            })
        return jsonify(result)

    @app.route('/api/items', methods=['POST'])
    @require_login
    def create_item():
        """
        Create a new item. Expects a JSON body with the item fields (no image upload).
        Returns the created item with its ID.
        """
        # Ensure the request contains JSON
        if not request.is_json:
            return jsonify({'error': 'JSON body required for item creation'}), 415
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        description = data.get('description')
        category = data.get('category')
        purchase_price = data.get('purchase_price')
        purchase_date = data.get('purchase_date')
        sale_price = data.get('sale_price')
        sale_date = data.get('sale_date')
        marketplace_links = hlp._parse_links_field(data.get('marketplace_links'))
        info_links = hlp._parse_links_field(data.get('info_links'))
        tags = data.get('tags')
        quantity = data.get('quantity')
        condition_field = data.get('condition')
        currency = data.get('currency')
        language = data.get('language')
        # Determine purchase price in user's reference currency
        # Determine purchase price in user's reference currency if provided, otherwise compute it
        purchase_price_curr_ref = data.get('purchase_price_curr_ref')
        try:
            # Only compute if not provided explicitly and conversion parameters exist
            if purchase_price_curr_ref is None:
                # Fetch the user's reference currency
                user_id = session.get('user_id')
                user_ref = None
                if user_id:
                    conn = db.get_db_connection(app.config['DATABASE'])
                    ccur = conn.cursor()
                    ccur.execute("SELECT ref_currency FROM users WHERE id = ?", (user_id,))
                    row = ccur.fetchone()
                    conn.close()
                    user_ref = row['ref_currency'] if row else None
                if purchase_price is not None and currency and user_ref:
                    purchase_price_curr_ref = hlp.convert_currency(float(purchase_price), currency, user_ref)
        except Exception:
            # leave as None if conversion fails
            purchase_price_curr_ref = None
        # Insert a new item associated with the current user. The image_path is stored as NULL on creation.
        user_id = session.get('user_id')
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO items (
                user_id, name, description, category, purchase_price, purchase_price_curr_ref, purchase_date,
                sale_price, sale_date, marketplace_links, info_links, tags, image_path, quantity, condition, currency, language,market_params
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                name,
                description,
                category,
                purchase_price,
                purchase_price_curr_ref,
                purchase_date,
                sale_price,
                sale_date,
                json.dumps(marketplace_links, ensure_ascii=False),
                json.dumps(info_links, ensure_ascii=False),
                tags,
                None,  # image_path set to NULL on creation
                quantity,
                condition_field,
                currency,
                language,
                json.dumps(data.get('market_params') if isinstance(data.get('market_params'), dict) else (json.loads(data.get('market_params')) if data.get('market_params') else None))
            )
        )
        conn.commit()
        item_id = cur.lastrowid
        conn.close()
        return jsonify({'id': item_id}), 201

    @app.route('/api/items/<int:item_id>', methods=['PUT'])
    @require_login
    def update_item(item_id: int):
        """
        Update an existing item by ID. Expects JSON body with fields to update.
        """
        mp = ''
        cat = ''
        if request.content_type and request.content_type.startswith('multipart/form-data'):
            # Update via form (potentially with image)
            form = request.form
            item_view_mode = form.get('item_view_mode')
            files = request.files
            fields = []
            values = []
            # Standard fields
            mapping = {
                'name': form.get('name'),
                'description': form.get('description'),
                'category': form.get('category'),
                'purchase_price': float(form.get('purchase_price')) if form.get('purchase_price') else None,
                'purchase_date': form.get('purchase_date'),
                'sale_price': float(form.get('sale_price')) if form.get('sale_price') else None,
                'sale_date': form.get('sale_date'),
                'marketplace_links': form.get('marketplace_links'),
                'info_links': form.get('info_links'),
                'tags': form.get('tags'),
                'quantity': int(form.get('quantity')) if form.get('quantity') else None,
                'condition': form.get('condition'),
                'currency': form.get('currency'),
                'language': form.get('language'),
                'market_params': form.get('market_params'),
                'purchase_price_curr_ref': float(form.get('purchase_price_curr_ref')) if form.get('purchase_price_curr_ref') else None
            }
            # Compute purchase_price_curr_ref automatically if not provided but purchase_price and currency are present
            try:
                mp = form.get('market_params')
                cat = mapping.get('category')
                if mapping.get('purchase_price_curr_ref') is None and mapping.get('purchase_price') is not None:
                    # fetch user's reference currency
                    user_ref = None
                    user_id_ses = session.get('user_id')
                    if user_id_ses:
                        conn_ref = db.get_db_connection(app.config['DATABASE'])
                        cur_ref = conn_ref.cursor()
                        cur_ref.execute("SELECT ref_currency FROM users WHERE id = ?", (user_id_ses,))
                        row_ref = cur_ref.fetchone()
                        conn_ref.close()
                        user_ref = row_ref['ref_currency'] if row_ref else None
                    if user_ref and mapping.get('currency'):
                        mapping['purchase_price_curr_ref'] = hlp.convert_currency(mapping['purchase_price'], mapping.get('currency'), user_ref)
                    else:
                        # leave as None when no conversion possible
                        mapping['purchase_price_curr_ref'] = None
            except Exception:
                # If conversion fails, leave as None (do not fallback to purchase_price)
                mapping['purchase_price_curr_ref'] = None
            for key, value in mapping.items():
                if value is not None and value != '':
                    fields.append(f"{key} = ?")
                    values.append(value)
            # Image handling
            image_file = files.get('image')
            if image_file and image_file.filename:
                ext = os.path.splitext(image_file.filename)[1].lower()
                if ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
                    unique_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}{ext}"
                    save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
                    image_file.save(save_path)
                    image_rel_path = os.path.relpath(save_path, os.path.join(os.path.dirname(__file__), 'static'))
                    fields.append("image_path = ?")
                    values.append(image_rel_path)
            if not fields:
                return jsonify({'error': 'No fields to update'}), 400
            # Append conditions for item id and user ownership
            values.append(item_id)
            # Ensure only the owner can update the item
            user_id_ses = session.get('user_id')
            values.append(user_id_ses)
            conn = db.get_db_connection(app.config['DATABASE'])
            cur = conn.cursor()
            cur.execute(f"UPDATE items SET {', '.join(fields)} WHERE id = ? AND user_id = ?", values)
            if cur.rowcount == 0:
                # No rows updated implies item does not belong to user or does not exist
                conn.close()
                return jsonify({'error': 'Item not found or unauthorized'}), 404
            conn.commit()
            conn.close()
            return jsonify({'message': 'Item updated'})
        else:
            data = request.get_json() or {}
            fields = []
            values = []
            # Build update list from provided fields
            for key in ['name', 'description', 'category', 'purchase_price', 'purchase_price_curr_ref', 'purchase_date', 'sale_price', 'sale_date', 'marketplace_links', 'info_links', 'tags', 'image_path', 'quantity', 'condition', 'currency', 'language', 'market_params','global_id']:
                if key in data and data[key] is not None:
                    fields.append(f"{key} = ?")
                    values.append(data[key])
            mp = data.get('market_params') 
            cat = data.get('category')                 
            # If purchase_price changes and no converted price provided, compute automatically
            try:
                if ('purchase_price_curr_ref' not in data or data.get('purchase_price_curr_ref') is None) and data.get('purchase_price') is not None:
                    user_ref = None
                    user_id_ses = session.get('user_id')
                    if user_id_ses:
                        conn_ref = db.get_db_connection(app.config['DATABASE'])
                        c_ref = conn_ref.cursor()
                        c_ref.execute("SELECT ref_currency FROM users WHERE id = ?", (user_id_ses,))
                        row_ref = c_ref.fetchone()
                        conn_ref.close()
                        user_ref = row_ref['ref_currency'] if row_ref else None
                    if user_ref and data.get('currency'):
                        conv_val = hlp.convert_currency(float(data['purchase_price']), data.get('currency'), user_ref)
                        fields.append("purchase_price_curr_ref = ?")
                        values.append(conv_val)
                    else:
                        # set to NULL when no conversion possible
                        fields.append("purchase_price_curr_ref = ?")
                        values.append(None)
            except Exception:
                # on error, set to NULL rather than copying purchase_price
                fields.append("purchase_price_curr_ref = ?")
                values.append(None)
            if not fields:
                return jsonify({'error': 'No fields to update'}), 400
            # Append conditions for item id and user ownership
            values.append(item_id)
            user_id_ses = session.get('user_id')
            values.append(user_id_ses)
            conn = db.get_db_connection(app.config['DATABASE'])
            cur = conn.cursor()
            cur.execute(f"UPDATE items SET {', '.join(fields)} WHERE id = ? AND user_id = ?", values)
            if cur.rowcount == 0:
                conn.close()
                return jsonify({'error': 'Item not found or unauthorized'}), 404
            conn.commit()
            conn.close()
            return jsonify({'message': 'Item updated'})

    @app.route('/api/items/<int:item_id>', methods=['DELETE'])
    @require_login
    def delete_item(item_id: int):
        """
        Delete an item by ID.
        """
        # Delete only if the item belongs to the current user
        user_id = session.get('user_id')
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("DELETE FROM items WHERE id = ? AND user_id = ?", (item_id, user_id))
        if cur.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Item not found or unauthorized'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Item deleted'})

    @app.route('/api/convert')
    @require_login
    def api_convert():
        """
        Convert a monetary amount from one currency to another. Requires query parameters:
        - amount: numeric amount to convert
        - from: source currency code (e.g., EUR)
        - to: target currency code (e.g., USD)
        Returns JSON with {'result': converted_amount} on success.
        """
        amount = request.args.get('amount', type=float)
        from_cur = request.args.get('from', type=str)
        to_cur = request.args.get('to', type=str)
        if amount is None or not from_cur or not to_cur:
            return jsonify({'error': 'Missing parameters'}), 400
        try:
            result = hlp.convert_currency(amount, from_cur, to_cur)
            return jsonify({'result': result})
        except Exception:
            return jsonify({'error': 'Conversion failed'}), 500

    @app.route('/api/user')
    @require_login
    def api_user():
        """
        Return basic information about the currently logged-in user, including
        reference currency. Useful for front-end logic.
        """
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT id, username, nickname, ref_currency, theme, item_view_mode FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        conn.close()
        if user:
            # Return user info as dict
            return jsonify({k: user[k] for k in user.keys()})
        return jsonify({'error': 'User not found'}), 404

    @app.route('/api/profile/stats', methods=['GET'])
    @require_login
    def api_profile_stats():
        return prf.api_profile_stats(app.config['DATABASE'],app.config['UPLOAD_FOLDER'])

    @app.route('/api/items/<int:item_id>/valuation', methods=['GET'])
    @require_login
    def get_item_valuation(item_id: int):
        """
        Compute and return the estimated valuation for a specific item. The item must belong
        to the logged-in user. Returns 404 if the item is not found.

        Args:
            item_id (int): ID of the item to valuate.

        Returns:
            JSON: A dictionary with fair_value, price_p05, price_p95, valuation_date and currency.
        """
        user_id = session.get('user_id')
        if user_id is None:
            return jsonify({'error': 'Unauthorized'}), 401
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id = ? AND user_id = ?", (item_id, user_id))
        item = cur.fetchone()
        conn.close()
        if not item:
            return jsonify({'error': 'Item not found'}), 404
        valuation = estimate_valuation2(item)
        # valuation = estimate_valuation(item)
        # Include the item's currency for clarity
        valuation['currency'] = item['currency']
        return jsonify(valuation)

    @app.route('/register', methods=['GET', 'POST'])
    def register():
        """
        Visualizza il form di registrazione e gestisce l'inserimento di un nuovo utente.
        Le richieste GET restituiscono il template del form, mentre le richieste POST
        si aspettano un payload JSON con i campi dell'utente. Viene verificata
        l'unicità dello username e che username e password siano valorizzati.
        """
        if request.method == 'POST':
            # Accetta sia JSON che dati form. Prevale JSON se inviato.
            data = request.get_json(silent=True) or request.form
            username = (data.get('username') or '').strip()
            password = (data.get('password') or '').strip()
            nickname = (data.get('nickname') or '').strip() or None
            ref_currency = (data.get('ref_currency') or '').strip() or None
            vinted_link = (data.get('vinted_link') or '').strip() or None
            cardmarket_link = (data.get('cardmarket_link') or '').strip() or None
            ebay_link = (data.get('ebay_link') or '').strip() or None
            facebook_link = (data.get('facebook_link') or '').strip() or None
            # Controlla campi obbligatori
            if not username or not password:
                return jsonify({'error': 'Username e password sono obbligatori.'}), 400
            # Verifica unicità username
            conn = db.get_db_connection(app.config['DATABASE'])
            cur = conn.cursor()
            cur.execute("SELECT id FROM users WHERE username = ?", (username,))
            if cur.fetchone():
                conn.close()
                return jsonify({'error': 'Username già esistente.'}), 400
            # Inserisci nuovo utente
            cur.execute(
                "INSERT INTO users (username, password, nickname, ref_currency, vinted_link, cardmarket_link, ebay_link, facebook_link) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (username, password, nickname, ref_currency, vinted_link, cardmarket_link, ebay_link, facebook_link)
            )
            conn.commit()
            conn.close()
            return jsonify({'message': 'Utente registrato con successo'}), 201
        # Metodo GET: mostra il form di registrazione
        return render_template('register.html')

    # Admin endpoints to manage users. Only the admin user (username 'admin') can perform these operations.
    def require_admin(f):
        """Decorator to restrict access to admin-only endpoints."""
        from functools import wraps
        @wraps(f)
        def decorated(*args, **kwargs):
            if not session.get('logged_in'):
                return jsonify({'error': 'Unauthorized'}), 401
            if session.get('username') != 'admin':
                return jsonify({'error': 'Forbidden'}), 403
            return f(*args, **kwargs)
        return decorated

    @app.route('/api/admin/users', methods=['GET'])
    @require_login
    @require_admin
    def admin_get_users():
        """
        Return a list of all users for administration purposes. Visible only to admin.
        """
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT id, username, nickname, ref_currency FROM users")
        users = [dict(row) for row in cur.fetchall()]
        conn.close()
        return jsonify(users)

    @app.route('/api/admin/users', methods=['POST'])
    @require_login
    @require_admin
    def admin_create_user():
        """
        Create a new user. Expects JSON body with 'username' and 'password' fields.
        Optionally accepts 'nickname' and 'ref_currency'.
        """
        data = request.get_json() or {}
        username = (data.get('username') or '').strip()
        password = (data.get('password') or '').strip()
        nickname = data.get('nickname')
        ref_currency = data.get('ref_currency')
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO users (username, password, nickname, ref_currency) VALUES (?, ?, ?, ?)",
                (username, password, nickname, ref_currency)
            )
            conn.commit()
            user_id = cur.lastrowid
            conn.close()
            return jsonify({'id': user_id}), 201
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': 'Username already exists'}), 400

    @app.route('/api/admin/users/<int:uid>', methods=['PUT'])
    @require_login
    @require_admin
    def admin_update_user(uid: int):
        """
        Update an existing user. Expects JSON with fields to update: 'username', 'password', 'nickname', 'ref_currency'.
        Username uniqueness is enforced. Password update is optional.
        """
        data = request.get_json() or {}
        fields = []
        values = []
        if 'username' in data and data['username']:
            fields.append("username = ?")
            values.append(data['username'])
        if 'password' in data and data['password']:
            fields.append("password = ?")
            values.append(data['password'])
        if 'nickname' in data:
            fields.append("nickname = ?")
            values.append(data['nickname'])
        if 'ref_currency' in data:
            fields.append("ref_currency = ?")
            values.append(data['ref_currency'])
        if not fields:
            return jsonify({'error': 'No fields to update'}), 400
        values.append(uid)
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        try:
            cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
            if cur.rowcount == 0:
                conn.close()
                return jsonify({'error': 'User not found'}), 404
            conn.commit()
            conn.close()
            return jsonify({'message': 'User updated'})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': 'Username already exists'}), 400

    @app.route('/api/admin/users/<int:uid>', methods=['DELETE'])
    @require_login
    @require_admin
    def admin_delete_user(uid: int):
        """
        Delete a user by ID. Admin cannot delete themselves.
        Deleting a user also deletes their items.
        """
        # Prevent admin from deleting themselves
        admin_id = session.get('user_id')
        if uid == admin_id:
            return jsonify({'error': 'Cannot delete currently logged in admin'}), 400
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        # Delete user and cascade delete items
        cur.execute("DELETE FROM users WHERE id = ?", (uid,))
        # Also delete items belonging to this user
        cur.execute("DELETE FROM items WHERE user_id = ?", (uid,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'User deleted'})


    @app.route('/api/export/csv', methods=['GET'])
    @require_login
    def export_csv():
        """
        Export all items as a CSV file. Optional query parameters for filters similar to get_items.
        Returns a downloadable CSV file.
        """
        # Reuse get_items filtering logic
        query = request.args.get('q', '', type=str).strip().lower()
        category = request.args.get('category', '', type=str).strip().lower()
        tags_param = request.args.get('tags', '', type=str).strip().lower()
        tags_filter = [t.strip() for t in tags_param.split(',') if t.strip()] if tags_param else []
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        # Filter items by logged-in user
        user_id = session.get('user_id')
        if user_id is None:
            return jsonify({'error': 'Unauthorized'}), 401
        cur.execute("SELECT * FROM items WHERE user_id = ?", (user_id,))
        items = cur.fetchall()
        conn.close()
        output = io.StringIO()
        writer = csv.writer(output)
        # Write header
        writer.writerow([
            'ID', 'Name', 'Description', 'Language', 'Category', 'Purchase Price', 'Purchase Price (Ref)', 'Currency', 'Purchase Date', 'Sale Price', 'Sale Date', 'Marketplace Link',
            'Tags', 'Image Path', 'Quantity', 'Condition', 'Time in Collection (days)', 'ROI'
        ])
        for item in items:
            # Apply filters
            if query and query not in (item['name'] or '').lower() and query not in (item['description'] or '').lower():
                continue
            if category and category != (item['category'] or '').lower():
                continue
            item_tags = [t.strip().lower() for t in (item['tags'] or '').split(',') if t.strip()]
            if tags_filter and not all(tag in item_tags for tag in tags_filter):
                continue
            # Derived fields
            time_in_collection = ''
            roi = ''
            if item['purchase_date']:
                try:
                    purchase_date = datetime.strptime(item['purchase_date'], '%Y-%m-%d').date()
                    delta = date.today() - purchase_date
                    time_in_collection = delta.days
                except Exception:
                    time_in_collection = ''
            if item['purchase_price'] and item['sale_price'] and item['purchase_price'] != 0:
                try:
                    roi_value = (item['sale_price'] - item['purchase_price']) / item['purchase_price']
                    roi = f"{roi_value:.2f}"
                except Exception:
                    roi = ''
            writer.writerow([
                item['id'], item['name'], item['description'], item['language'], item['category'],
                item['purchase_price'], item['purchase_price_curr_ref'], item['currency'], item['purchase_date'], item['sale_price'], item['sale_date'],
                item['marketplace_link'], item['tags'], item['image_path'], item['quantity'], item['condition'],
                time_in_collection, roi
            ])
        output.seek(0)
        return send_file(
            io.BytesIO(output.getvalue().encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name='collezione.csv'
        )

    # PDF export is optional and requires installing extra dependencies. Here we provide a simple placeholder.
    @app.route('/api/export/pdf', methods=['GET'])
    @require_login
    def export_pdf():
        """
        Placeholder for PDF export functionality. Not implemented.
        """
        return jsonify({'error': 'PDF export not implemented yet'}), 501

    @app.route('/home')
    @require_login
    def home_page():
        """
        Display the home page for the logged-in user. This shows a summary
        of collection statistics similar to the profile page without the edit form.
        """
        user_id = session.get('user_id')
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        conn.close()
        user_dict = dict(user) if user else {}
        stats = prf.compute_profile_stats(app.config['DATABASE'],app.config['UPLOAD_FOLDER'],user_dict)
        return render_template('home.html', user=user_dict, stats=stats)

    @app.route('/profile', methods=['GET', 'POST'])
    @require_login
    def profile():
        return prf.profile_info(app.config['DATABASE'],app.config['UPLOAD_FOLDER'])


    @app.route('/api/ebay-estimate')
    @require_login
    def ebay_estimate():
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error': 'Missing item_id'}), 400

        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Item not found'}), 404
        item = dict(row)

        parts = [item.get('name') or '']
        if item.get('language'): parts.append(item['language'])
        if item.get('category'): parts.append(item['category'])
        if item.get('condition'): parts.append(item['condition'])
        keywords = " ".join([p for p in parts if p]).strip() or "collectible"

        import requests, statistics, os as _os, datetime as _dt
        EBAY_APP_ID = os.environ.get("EBAY_CLIENT_ID")
        site_id = _os.getenv('EBAY_SITE_ID', '101')

        payload = {
            'OPERATION-NAME': 'findCompletedItems',
            'SERVICE-VERSION': '1.13.0',
            'SECURITY-APPNAME': EBAY_APP_ID or '',
            'RESPONSE-DATA-FORMAT': 'JSON',
            'REST-PAYLOAD': 'true',
            'keywords': keywords,
            'paginationInput.entriesPerPage': '25',
            'itemFilter(0).name': 'SoldItemsOnly',
            'itemFilter(0).value': 'true',
            'siteid': site_id,
        }
        url = 'https://svcs.ebay.com/services/search/FindingService/v1'
        result = {'source':'eBay Finding API - findCompletedItems','query':{'url':url,'params':payload},'stats':None,'samples':[]}

        try:
            if not EBAY_APP_ID:
                raise RuntimeError('Missing EBAY_APP_ID')
            r = requests.get(url, params=payload, timeout=8)
            r.raise_for_status()
            data = r.json()
            items = (((data or {}).get('findCompletedItemsResponse') or [{}])[0].get('searchResult') or [{}])[0].get('item', [])
            prices, samples = [], []
            currency = item.get('currency') or 'EUR'
            for it in items:
                selling = ((it.get('sellingStatus') or [{}])[0])
                state   = (selling.get('sellingState') or [''])[0]
                if state != 'EndedWithSales':
                    continue
                curr_price = ((it.get('sellingStatus') or [{}])[0].get('currentPrice') or [{}])[0]
                price_val  = float(curr_price.get('__value__', '0') or 0)
                currency   = curr_price.get('@currencyId', currency)
                conv = ((it.get('sellingStatus') or [{}])[0].get('convertedCurrentPrice') or [{}])[0]
                if conv and conv.get('__value__'):
                    price_val = float(conv.get('__value__', price_val) or price_val)
                    currency  = conv.get('@currencyId', currency)
                title    = (it.get('title') or [''])[0]
                view_url = (it.get('viewItemURL') or [''])[0]
                end_time = (((it.get('listingInfo') or [{}])[0]).get('endTime') or [''])[0]
                prices.append(price_val)
                if len(samples) < 5:
                    samples.append({'title': title, 'price': price_val, 'currency': currency, 'url': view_url, 'endTime': end_time})

            today = _dt.date.today().isoformat()

            if prices:
                avg = sum(prices)/len(prices)
                med = statistics.median(prices)
                mn, mx = min(prices), max(prices)
                stats = {'count': len(prices), 'avg': round(avg,2), 'median': round(med,2), 'min': round(mn,2), 'max': round(mx,2), 'currency': currency}
            else:
                stats = {'count': 0, 'currency': item.get('currency') or 'EUR'}

            result['stats'] = stats
            result['samples'] = samples
            conn.close()
            return jsonify(result), 200

        except Exception:
            base_val = float(item.get('purchase_price') or 0) or 50.0
            est = base_val * 1.1
            today = _dt.date.today().isoformat()
            stats = {'count': 0, 'avg': round(est,2), 'median': round(est,2), 'min': round(base_val*0.9,2), 'max': round(base_val*1.3,2), 'currency': item.get('currency') or 'EUR', 'stub': True}
            result['stats'] = stats
            return jsonify(result), 200

    @app.route('/api/ebay-history')
    @require_login
    def ebay_history():
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error':'Missing item_id'}), 400
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT date, avg, median, min, max, count, currency, keywords FROM ebay_price_history WHERE item_id = ? ORDER BY date ASC", (item_id,))
        rows = cur.fetchall(); conn.close()
        return jsonify([dict(r) for r in rows]), 200

    @app.route('/api/pricecharting-estimate')
    @require_login
    def pricecharting_estimate():
        """Estimate from PriceCharting Prices API using /api/product with q.
        Env: PRICECHARTING_TOKEN or PRICECHARTING_T
        """
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error':'Missing item_id'}), 400
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
        row = cur.fetchone(); conn.close()
        if not row: return jsonify({'error':'Item not found'}), 404
        item = dict(row)
        #parts = [item.get('name').split() or '']
        #if item.get('category'): parts.append(item['category'])
        #if item.get('language'): parts.append(item['language'])
        #if item.get('condition'): parts.append(item['condition'])
        #q = " ".join([p for p in parts if p]).strip() or "mario"
        q = " ".join(item.get('name').split()[0:3]) or item.get('name')
        import os, requests
        token = os.getenv('PRICECHARTING_TOKEN') or os.getenv('PRICECHARTING_T')
        url = "https://www.pricecharting.com/api/product"
        params = {'t': token or '', 'q': q}
        result = {'source':'PriceCharting Prices API - /api/product','query':{'url':url,'params':{'t':('***' if token else ''),'q':q}},'product':None,'prices':None}
        try:
            if not token: raise RuntimeError('Missing PRICECHARTING_TOKEN')
            r = requests.get(url, params=params, timeout=8); r.raise_for_status(); data = r.json()
            if data.get('status') != 'success': raise RuntimeError(data.get('error-message') or 'API error')
            def cents(x):
                try: return round(int(x)/100.0,2)
                except: return None
            product = {'id': data.get('id'), 'product_name': data.get('product-name'), 'console_name': data.get('console-name'), 'upc': data.get('upc')}
            prices = {
                'loose': cents(data.get('loose-price')),
                'cib': cents(data.get('cib-price')),
                'new': cents(data.get('new-price')),
                'retail_loose_sell': cents(data.get('retail-loose-sell')),
                'retail_cib_sell': cents(data.get('retail-cib-sell')),
                'retail_new_sell': cents(data.get('retail-new-sell')),
                'currency': 'USD'
            }
            result['product'] = product
            result['prices'] = prices
            return jsonify(result), 200
        except Exception as e:
            base_val = float(item.get('purchase_price') or 0) or None
            result['prices'] = {'loose': base_val, 'currency': item.get('currency') or 'EUR', 'stub': True}
            return jsonify(result), 200

    @app.route('/api/discogs-estimate')
    @require_login
    def discogs_estimate():
        """
        Stima Discogs per un item:
        - Se presente discogs_release_id in market_params → lookup diretto
        - Altrimenti ricerca strutturata su /database/search (type=release) usando i campi market
        - Poi:
            /marketplace/price_suggestions/{release_id}  → suggerimenti per condizione (avg/median/min/max)
            /marketplace/stats/{release_id}              → num_for_sale, lowest_price, ecc.
        - Ritorna: source, query, release scelto, suggestions, stats (prezzi), market_stats (annunci attivi)
        """
        import os, json, requests, statistics as _st

        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error': 'Missing item_id'}), 400

        # --- carica item ---
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Item not found'}), 404

        # sqlite Row → dict
        try:
            item = dict(row)
        except Exception:
            item = row

        # --- market_params ---
        mp = {}
        try:
            raw_mp = item.get('market_params')
            if raw_mp:
                mp = json.loads(raw_mp) if isinstance(raw_mp, str) else raw_mp
        except Exception:
            mp = {}
        if not isinstance(mp, dict):
            mp = {}

        discogs_release_id = mp.get('discogs_release_id') or mp.get('release_id')

        # categoria → formato desiderato
        cat = (item.get('category') or '').lower()
        desired_format = None
        if any(x in cat for x in ('vinyl', 'vinile', 'lp')):
            desired_format = 'LP'
        elif 'cd' in cat or 'compact disc' in cat:
            desired_format = 'CD'

        # ricerca strutturata per /database/search
        search_params = {}
        if mp.get('artist'):  search_params['artist'] = mp['artist']
        if mp.get('album'):   search_params['release_title'] = mp['album']
        if mp.get('year'):    search_params['year'] = mp['year']
        if mp.get('label'):   search_params['label'] = mp['label']
        if mp.get('catno'):   search_params['catno'] = mp['catno']
        if mp.get('barcode'): search_params['barcode'] = mp['barcode']
        if mp.get('country'): search_params['country'] = mp['country']
        if mp.get('format'):  search_params['format'] = mp['format']  # se già specificato

        # fallback testo libero
        free_q = ' '.join([str(item.get(k) or '') for k in ('name','description','category','tags')]).strip()

        # --- Discogs setup ---
        token = os.getenv('DISCOGS_TOKEN') or os.getenv('DISCOGS_API_TOKEN')
        key   = os.getenv('DISCOGS_KEY')
        sec   = os.getenv('DISCOGS_SECRET')
        headers = {
            'User-Agent': os.getenv('DISCOGS_UA', 'CollectorStreet/1.2 (+https://collectorstreet)')
        }
        if token:
            headers['Authorization'] = f'Discogs token={token}'

        base_api = 'https://api.discogs.com'
        result = {
            'source': 'Discogs API',
            'query': {},
            'release': None,
            'suggestions': None,   # raw map per condizione
            'stats': None,         # media/mediana/min/max dai suggestions
            'market_stats': None   # num_for_sale, lowest_price ecc.
        }

        # ---- 1) Trova release_id ----
        release_id = None
        used_search = False

        try:
            if discogs_release_id:
                # Verifica che la release esista
                url = f"{base_api}/releases/{discogs_release_id}"
                params = {}
                if not token and key and sec:
                    params.update({'key': key, 'secret': sec})
                rr = requests.get(url, headers=headers, params=params, timeout=12)
                rr.raise_for_status()
                rel = rr.json()
                release_id = rel.get('id')
                result['release'] = {
                    'id': release_id,
                    'title': rel.get('title'),
                    'artist_names' : [a.get("name") for a in rel.get("artists", [])],
                    'year': rel.get('year'),
                    'country': rel.get('country'),
                    'labels': [l.get('name') for l in rel.get('labels', []) if l.get('name')],
                    'formats': [f.get('name') for f in rel.get('formats', []) if f.get('name')],
                }
                result['query']['releases_lookup'] = {'url': url, 'id': discogs_release_id}
            else:
                # database/search
                url = f"{base_api}/database/search"
                params = {'type': 'release'}
                if free_q: params['q'] = free_q
                if desired_format and 'format' not in search_params:
                    params['format'] = desired_format
                # merge dei parametri strutturati
                for k, v in (search_params or {}).items():
                    if v: params[k] = v
                if not token and key and sec:
                    params.update({'key': key, 'secret': sec})

                result['query']['search'] = {
                    'url': url,
                    'params': {k: ('***' if k in ('key','secret') else v) for k, v in params.items()}
                }

                rs = requests.get(url, params=params, headers=headers, timeout=12)
                rs.raise_for_status()
                data = rs.json() or {}
                rels = data.get('results') or []
                if not rels:
                    return jsonify({**result, 'error': 'Nessuna release trovata'}), 200

                # preferisci formato/anno se possibile
                def score(r):
                    s = 0
                    fmts = r.get('format') or []
                    if desired_format and any(desired_format.lower() == (f or '').lower() for f in fmts):
                        s -= 10
                    try:
                        y_req = int(mp.get('year')) if mp.get('year') else None
                        y_rel = int(r.get('year')) if r.get('year') else None
                        if y_req and y_rel:
                            s += abs(y_req - y_rel)  # più vicino all'anno
                    except Exception:
                        pass
                    if mp.get('catno') and (r.get('catno') or '').lower() == mp['catno'].lower():
                        s -= 5
                    if mp.get('label') and (r.get('label') or [''])[0].lower() == mp['label'].lower():
                        s -= 3
                    return s

                rels = sorted(rels, key=score)
                top = rels[0]
                release_id = top.get('id')
                result['release'] = {
                    'id': release_id,
                    'title': top.get('title'),
                    'year': top.get('year'),
                    'country': top.get('country'),
                    'labels': top.get('label'),
                    'formats': top.get('format') or []
                }
                used_search = True

            if not release_id:
                return jsonify({**result, 'error': 'Release ID non determinato'}), 200

            # ---- 2) Price suggestions ----
            ps_url = f"{base_api}/marketplace/price_suggestions/{release_id}"
            ps_headers = dict(headers)
            ps_params = {}
            if not token and key and sec:
                ps_params.update({'key': key, 'secret': sec})

            result['query']['price_suggestions'] = {
                'url': ps_url,
                'auth': 'token' if token else ('key/secret' if (key and sec) else 'none')
            }

            suggestions = None
            try:
                pr = requests.get(ps_url, headers=ps_headers, params=ps_params, timeout=12)
                pr.raise_for_status()
                suggestions = pr.json()  # { "Mint (M)": {"currency":"USD","value":xx}, ... }
            except Exception as e:
                # non bloccare il flusso: alcuni ID non hanno suggestions
                result['query']['price_suggestions_error'] = str(e)

            # ---- 3) Marketplace stats (num_for_sale, lowest_price) ----
            stats_url = f"{base_api}/marketplace/stats/{release_id}"
            st_params = {}
            if not token and key and sec:
                st_params.update({'key': key, 'secret': sec})

            result['query']['marketplace_stats'] = {
                'url': stats_url,
                'auth': 'token' if token else ('key/secret' if (key and sec) else 'none')
            }

            market_stats = None
            try:
                sr = requests.get(stats_url, headers=headers, params=st_params, timeout=12)
                sr.raise_for_status()
                market_stats = sr.json()  # {'num_for_sale':..., 'lowest_price':{'value','currency'}, ...}
            except Exception as e:
                result['query']['marketplace_stats_error'] = str(e)

            # ---- 4) Sintesi prezzi (media/min/max/mediana) ----
            price_stats = None
            if isinstance(suggestions, dict) and suggestions:
                vals = [v.get('value') for v in suggestions.values()
                        if isinstance(v, dict) and v.get('value') is not None]
                cur = None
                for v in suggestions.values():
                    if isinstance(v, dict) and v.get('currency'):
                        cur = v['currency']; break
                if vals:
                    price_stats = {
                        'count': len(vals),
                        'avg': round(sum(vals)/len(vals), 2),
                        'median': round(_st.median(vals), 2),
                        'min': round(min(vals), 2),
                        'max': round(max(vals), 2),
                        'currency': cur or (market_stats or {}).get('lowest_price', {}).get('currency') or 'USD'
                    }

            # ---- 5) Componi risposta ----
            result['suggestions'] = suggestions
            result['stats'] = price_stats
            result['market_stats'] = {
                'num_for_sale': (market_stats or {}).get('num_for_sale'),
                'lowest_price': (market_stats or {}).get('lowest_price'),
                'median_price': (market_stats or {}).get('median_price'),
                'currency': (market_stats or {}).get('lowest_price', {}).get('currency')
            }

            # opzionale: breve riassunto per UI
            result['summary'] = {
                'prezzo_medio_suggerito': (price_stats or {}).get('avg'),
                'annunci_attivi': (result['market_stats'] or {}).get('num_for_sale'),
                'currency': (price_stats or {}).get('currency') or (result['market_stats'] or {}).get('currency')
            }

            return jsonify(result), 200

        except requests.HTTPError as e:
            result['error'] = f"HTTP {e.response.status_code}: {e.response.text[:300]}"
            return jsonify(result), 200
        except Exception as e:
            result['error'] = str(e)
            return jsonify(result), 200

    @app.route('/api/lego-estimate')
    @require_login
    def lego_estimate():
        import os, re, requests
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error': 'Missing item_id'}), 400
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
        row = cur.fetchone(); conn.close()
        if not row: return jsonify({'error':'Item not found'}), 404
        item = dict(row)

        name = (item.get('name') or '').strip()
        category = (item.get('category') or '').strip().lower()

        # infer numeric code from name if present (3-7 digits)
        inferred = None
        m = re.search(r'(?:lego\s*)?(\d{3,7})(?!\d)', name.lower())
        if m: inferred = m.group(1)

        result = {'source':'Rebrickable API','query':None,'best':None,'results':[],'inferred':inferred}
        api_key = os.getenv('REBRICKABLE_API_KEY')
        base_url = 'https://rebrickable.com/api/v3/lego/sets/'
        params = {'search': name, 'page_size': 10}

        if not api_key:
            result['query'] = {'url': base_url, 'params': params, 'note':'Missing REBRICKABLE_API_KEY'}
            if inferred: result['best'] = {'set_num': f'{inferred}-1', 'set_number': inferred, 'name': name, 'source':'inferred'}
            return jsonify(result), 200

        try:
            headers = {'Authorization': f'key {api_key}'}
            r = requests.get(base_url, headers=headers, params=params, timeout=8)
            r.raise_for_status()
            data = r.json()
            items = data.get('results') or []
            simplified, best = [], None
            for it in items:
                set_num = it.get('set_num')
                set_number = set_num.split('-')[0] if set_num else None
                entry = {'set_num': set_num, 'set_number': set_number, 'name': it.get('name'),
                        'year': it.get('year'), 'num_parts': it.get('num_parts'), 'theme_id': it.get('theme_id'),
                        'img': it.get('set_img_url'), 'url': f"https://rebrickable.com/sets/{set_num}/" if set_num else None}
                simplified.append(entry)
                if inferred and set_number == inferred and best is None: best = entry
            if not best and simplified: best = simplified[0]
            result['query'] = {'url': base_url, 'params': params}
            result['results'] = simplified
            result['best'] = best or ({'set_num': f'{inferred}-1', 'set_number': inferred, 'name': name, 'source':'inferred'} if inferred else None)
            return jsonify(result), 200
        except Exception as e:
            result['query'] = {'url': base_url, 'params': params, 'error': str(e)}
            if inferred: result['best'] = {'set_num': f'{inferred}-1', 'set_number': inferred, 'name': name, 'source':'inferred'}
            return jsonify(result), 200

    @app.route('/api/justtcg-estimate')
    @require_login
    def justtcg_estimate():
        """
        TCG pricing via JustTCG.
        Env: JUSTTCG_API_KEY
        Docs: https://api.justtcg.com/v1  (cards endpoint)
        """
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error': 'Missing item_id'}), 400

        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id=?", (item_id,))
        row = cur.fetchone(); conn.close()
        if not row: return jsonify({'error':'Item not found'}), 404
        item = dict(row)

        import os, re, requests, statistics as _st
        API = os.getenv('JUSTTCG_API_KEY')
        base_url = 'https://api.justtcg.com/v1/cards'
        if not API:
            return jsonify({
                'source':'JustTCG Cards API',
                'error':'Missing JUSTTCG_API_KEY',
                'query': {'url': base_url}
            }), 200

        name = (item.get('name') or '').strip()
        cat  = (item.get('category') or '').lower()
        tags = (item.get('tags') or '').lower()
        cond = (item.get('condition') or '').strip()

        # infer game
        txt = " ".join([name.lower(), cat, tags])
        game = None
        if 'pokemon' in txt or 'pokémon' in txt: game = 'pokemon'
        elif 'mtg' in txt or 'magic' in txt:     game = 'mtg'
        elif 'yu-gi-oh' in txt or 'yugioh' in txt: game = 'yugioh'
        elif 'lorcana' in txt:                   game = 'disney-lorcana'
        elif 'one piece' in txt or 'onepiece' in txt: game = 'one-piece-card-game'
        elif 'digimon' in txt:                   game = 'digimon-card-game'

        # map condition → abbreviations JustTCG (NM/LP/…)
        def map_condition(c):
            c = (c or '').lower()
            if 'sealed' in c: return 'S'
            if 'nm' in c or 'near' in c: return 'NM'
            if 'lp' in c or 'light' in c: return 'LP'
            if 'mp' in c or 'moderate' in c: return 'MP'
            if 'hp' in c or 'heavy' in c: return 'HP'
            if 'dmg' in c or 'damag' in c: return 'DMG'
            return None
        condition = map_condition(cond)

        # hint “printing”
        printing = None
        if re.search(r'foil|holo|reverse holo|rev holo', txt): printing = 'Foil'
        elif re.search(r'first edition|1st ed', txt):          printing = 'First Edition'
        elif 'unlimited' in txt:                               printing = 'Unlimited'

        # Costruisco query: se hai un campo tcgplayer_id in DB, passalo come tcgplayerId (prioritario)
        params = {}
        tcgplayer_id = item.get('tcgplayer_id')
        if tcgplayer_id:
            params['tcgplayerId'] = str(tcgplayer_id)
        else:
            # ricerca “flessibile”: gioco + stringa libera
            if game: params['game'] = game
            # molti client usano `q` o il tris game/set/number; partiamo da q (fallback ok)
            params['q'] = name

        if condition: params['condition'] = condition
        if printing:  params['printing']  = printing
        params['include_statistics'] = '7d,30d,90d,1y'

        result = {'source':'JustTCG Cards API', 'query': {'url': base_url, 'params': params},
                'card': None, 'variants': [], 'stats': None}

        try:
            r = requests.get(base_url, headers={'x-api-key': API}, params=params, timeout=10)
            r.raise_for_status()
            js = r.json() or {}
            data = js.get('data') or []
            # Se non trova nulla, rilasso i filtri di printing/condition
            if not data and not tcgplayer_id:
                alt = dict(params); alt.pop('printing', None); alt.pop('condition', None)
                rr = requests.get(base_url, headers={'x-api-key': API}, params=alt, timeout=10)
                rr.raise_for_status()
                data = (rr.json() or {}).get('data') or []
                result['query']['alt_params'] = alt

            if data:
                card = data[0]
                result['card'] = {
                    'id': card.get('id'), 'name': card.get('name'),
                    'game': card.get('game'), 'set_name': card.get('set_name'),
                    'number': card.get('number'), 'tcgplayerId': card.get('tcgplayerId')
                }
                variants = card.get('variants') or []
                # snellisco le varianti e calcolo stat su prezzi
                slim, prices = [], []
                for v in variants:
                    entry = {
                        'variant_id': v.get('id'),
                        'printing':   v.get('printing'),
                        'condition':  v.get('condition'),
                        'language':   v.get('language'),
                        'price':      v.get('price'),
                        'low':        v.get('low'),
                        'high':       v.get('high')
                    }
                    slim.append(entry)
                    if v.get('price') is not None:
                        try: prices.append(float(v['price']))
                        except: pass
                result['variants'] = slim
                if prices:
                    avg = sum(prices)/len(prices)
                    import statistics as _st
                    result['stats'] = {
                        'count': len(prices),
                        'avg':   round(avg,2),
                        'median':round(_st.median(prices),2),
                        'min':   round(min(prices),2),
                        'max':   round(max(prices),2),
                        'currency': 'USD'
                    }
            return jsonify(result), 200
        except Exception as e:
            result['error'] = str(e)
            return jsonify(result), 200

    @app.route('/api/stockx-estimate')
    @require_login
    def stockx_estimate():
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error':'Missing item_id'}), 400
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
        row = conn.fetchone(); conn.close()
        if not row: return jsonify({'error':'Item not found'}), 404
        item = dict(row)

        import os, requests, statistics as _st
        q_parts = [item.get('name') or '']
        if item.get('brand'): q_parts.append(item['brand'])
        if item.get('condition'): q_parts.append(item['condition'])
        q = " ".join([p for p in q_parts if p]).strip()

        def _stats(m):
            try:
                vals = [float(v) for k,v in m.items() if k in ('lastSale','lowestAsk','highestBid') and v is not None]
                if not vals: return None
                mn, mx = min(vals), max(vals); avg = sum(vals)/len(vals); med = _st.median(vals)
                return {'count': len(vals), 'avg': round(avg,2), 'median': round(med,2), 'min': round(mn,2), 'max': round(mx,2), 'currency': 'USD'}
            except: return None

        result = {'source':'StockX Market Data','query':{},'product':None,'market':None,'stats':None}

        # 1) RapidAPI
        RAPID_KEY = os.getenv('STOCKX_RAPIDAPI_KEY')
        RAPID_HOST = os.getenv('STOCKX_RAPIDAPI_HOST','stockx-data.p.rapidapi.com')
        if RAPID_KEY and q:
            try:
                h = {'X-RapidAPI-Key': RAPID_KEY, 'X-RapidAPI-Host': RAPID_HOST}
                s_url = f'https://{RAPID_HOST}/search'; s_params={'query': q}
                sr = requests.get(s_url, headers=h, params=s_params, timeout=10); sr.raise_for_status(); sjs = sr.json()
                items = sjs.get('data') or sjs.get('products') or sjs.get('hits') or (sjs if isinstance(sjs, list) else [])
                if not items: raise RuntimeError('no search result')
                top = items[0]
                pid = top.get('id') or top.get('uuid') or top.get('productId') or top.get('_id')
                urlKey = top.get('urlKey') or top.get('url') or top.get('slug')
                name = top.get('name') or top.get('title')
                product = {'id': pid, 'urlKey': urlKey, 'name': name}

                market = None; used_ep=None; used_params=None
                for ep, params in [('product-details', {'productId': pid} if pid else None), ('product', {'urlKey': urlKey} if urlKey else None)]:
                    if not params: continue
                    d_url = f'https://{RAPID_HOST}/{ep}'
                    dr = requests.get(d_url, headers=h, params=params, timeout=10)
                    if dr.status_code >= 400: continue
                    dj = dr.json()
                    m = dj.get('market') or dj.get('Product') or dj.get('data') or dj
                    cand = {
                        'lastSale': m.get('lastSale') if isinstance(m,dict) else None,
                        'lowestAsk': m.get('lowestAsk') if isinstance(m,dict) else None,
                        'highestBid': m.get('highestBid') if isinstance(m,dict) else None,
                        'deadstockSold': m.get('deadstockSold') if isinstance(m,dict) else None,
                        'volatility': m.get('volatility') if isinstance(m,dict) else None,
                        'pricePremium': m.get('pricePremium') if isinstance(m,dict) else None,
                    }
                    for k in list(cand.keys()):
                        try: cand[k] = float(cand[k]) if cand[k] is not None else None
                        except: 
                            try: cand[k] = float(str(cand[k]).replace('$','').replace(',',''))
                            except: pass
                    market = cand; used_ep=ep; used_params=params; break

                if market:
                    result['query']={'via':'RapidAPI','search':{'url':s_url,'params':s_params},'detail_endpoint':used_ep,'detail_params':used_params}
                    result['product']=product; result['market']=market; result['stats']=_stats(market) or {'count':0,'currency':'USD'}
                    return jsonify(result), 200
            except Exception as e:
                result['rapidapi_error'] = str(e)

        # 2) Browse best-effort
        try:
            if q:
                headers={'User-Agent':'Mozilla/5.0','Accept':'application/json, text/plain, */*','x-requested-with':'XMLHttpRequest'}
                s_url='https://stockx.com/api/browse'; s_params={'_search': q}
                sr=requests.get(s_url, headers=headers, params=s_params, timeout=10); sr.raise_for_status(); sjs=sr.json()
                prods = sjs.get('Products') or []
                if prods:
                    top=prods[0]; urlKey=top.get('urlKey') or top.get('url') or top.get('slug'); name=top.get('title') or top.get('name')
                    if urlKey:
                        d_url=f'https://stockx.com/api/products/{urlKey}'; d_params={'includes':'market'}
                        dr=requests.get(d_url, headers=headers, params=d_params, timeout=10); dr.raise_for_status(); dj=dr.json()
                        p=dj.get('Product') or {}; market=p.get('market') or {}
                        cand={'lastSale':market.get('lastSale'),'lowestAsk':market.get('lowestAsk'),'highestBid':market.get('highestBid'),
                            'deadstockSold':market.get('deadstockSold'),'volatility':market.get('volatility'),'pricePremium':market.get('pricePremium')}
                        for k in list(cand.keys()):
                            try: cand[k] = float(cand[k]) if cand[k] is not None else None
                            except:
                                try: cand[k] = float(str(cand[k]).replace('$','').replace(',',''))
                                except: pass
                        result['query']={'via':'browse','search':{'url':s_url,'params':s_params},'detail':{'url':d_url,'params':d_params}}
                        result['product']={'urlKey':urlKey,'name':name}; result['market']=cand; result['stats']=_stats(cand) or {'count':0,'currency':'USD'}
                        return jsonify(result), 200
        except Exception as e:
            result['browse_error']=str(e)

        # 3) Fallback
        base_val = float(item.get('purchase_price') or 0) or None
        if base_val is not None:
            market={'lastSale': base_val*1.05, 'lowestAsk': base_val*1.1, 'highestBid': base_val*0.95}
            result['market']=market; result['stats']=_stats(market)
        return jsonify(result), 200

    @app.route('/api/code-resolve', methods=['POST'])
    @require_login
    def api_code_resolve():
        """
        Risolve 'code_type' + 'code' per ottenere market_params normalizzati,
        puntando (per ora) a PriceCharting (videogiochi, focus Game Boy).
        Body: { category, code_type, code, platform? }
        """
        import os, requests, datetime as dt

        data = request.get_json(silent=True) or {}
        category = (data.get('category') or '').lower()
        code_type = (data.get('code_type') or '').upper()
        code = (data.get('code') or '').strip()
        platform = (data.get('platform') or '').strip()

        if not code_type or not code:
            return jsonify({'error': 'Missing code_type or code'}), 400

        # Sorgente
        token = os.getenv('PRICECHARTING_TOKEN') or os.getenv('PRICE_CHARTING_TOKEN') or 'demo'

        # Costruzione query verso PriceCharting
        # 1) se EAN/UPC → endpoint "product by barcode"
        # 2) se DMG/Serial → search q=... + console=Game Boy (se dedotta)
        # NB: gli endpoint possono variare: adattati alla tua implementazione corrente
        base = "https://www.pricecharting.com/api"
        query_used = {'source': 'PriceCharting'}

        try:
            normalized = {'title': None, 'platform': None, 'year': None, 'region': None, 'market_params': {}}

            def to_year(s):
                try:
                    if not s: return None
                    return int(str(s)[:4])
                except Exception:
                    return None

            # 1) Barcode diretto
            if code_type in ('EAN','UPC'):
                url = f"{base}/product"
                params = {'t': token, 'barcode': code}
                r = requests.get(url, params=params, timeout=12)
                query_used.update({'endpoint': 'product', 'params': {'barcode': code}})
                r.raise_for_status()
                p = r.json() if r.text else None
                if not p or not isinstance(p, dict):
                    return jsonify({'error':'Nessun prodotto per barcode', 'query': query_used}), 200

                normalized['title'] = p.get('product-name') or p.get('title')
                normalized['platform'] = p.get('console-name') or p.get('console')
                normalized['year'] = to_year(p.get('release-date'))
                normalized['region'] = p.get('region')

                market_params = {
                    'platform': normalized['platform'],
                    'title': normalized['title'],
                    'year': normalized['year'],
                    'region': normalized['region'],
                    'barcode': code,
                    'serial': code,   # memorizziamo anche in serial per coerenza schema
                    'pricecharting_id': p.get('id')
                }
                normalized['market_params'] = {k:v for k,v in market_params.items() if v not in (None,'')}
                return jsonify({'normalized': normalized, 'query': query_used})

            # 2) DMG / SERIAL → search
            # Deduci console “Game Boy” per DMG
            console = platform or ('Game Boy' if code_type == 'DMG' else '')
            url = f"{base}/search"
            params = {'t': token, 'q': code}
            if console: params['console'] = console
            r = requests.get(url, params=params, timeout=12)
            query_used.update({'endpoint': 'search', 'params': {'q': code, 'console': console or None}})

            r.raise_for_status()
            arr = r.json() if r.text else []
            if not arr:
                return jsonify({'error':'Nessun risultato dalla ricerca', 'query': query_used}), 200

            # pick best (primo)
            top = arr[0] if isinstance(arr, list) else None
            if not top or not isinstance(top, dict):
                return jsonify({'error':'Risultato inaspettato', 'query': query_used}), 200

            # eventuale dettaglio prodotto
            prod_id = top.get('id')
            if prod_id:
                url2 = f"{base}/products"
                r2 = requests.get(url2, params={'t': token, 'id': prod_id}, timeout=12)
                # /products può restituire array o singolo — gestiamo entrambi
                det = r2.json() if r2.text else {}
                p = (det[0] if isinstance(det, list) and det else (det if isinstance(det, dict) else {}))
            else:
                p = top

            normalized['title']    = p.get('product-name') or p.get('title') or top.get('title')
            normalized['platform'] = p.get('console-name') or p.get('console') or console or 'Game Boy'
            normalized['year']     = to_year(p.get('release-date'))
            normalized['region']   = p.get('region')

            market_params = {
                'platform': normalized['platform'],
                'title': normalized['title'],
                'year': normalized['year'],
                'region': normalized['region'],
                'serial': code,  # <— qui salviamo il DMG o serial generico
                'pricecharting_id': p.get('id') or top.get('id')
            }
            normalized['market_params'] = {k:v for k,v in market_params.items() if v not in (None,'')}

            # conserva per il pulsante "Applica"
            return jsonify({'normalized': normalized, 'query': query_used})

        except requests.HTTPError as e:
            return jsonify({'error': f"HTTP {e.response.status_code}: {e.response.text[:160]}", 'query': query_used}), 200
        except Exception as e:
            return jsonify({'error': str(e), 'query': query_used}), 200

    # GLOBAL CATALOG

    @app.route('/api/global-catalog/ensure-or-resolve', methods=['POST'])
    @require_login
    def api_gc_ensure_or_resolve():
        # verifica se valido ed esiste già in global_catalog
        # if(data.get('market_params') and data.get('category')):
        data = request.get_json(silent=True) or {}
        category = data.get('category') or ''
        market_params = json.dumps(data.get('market_params') or {}, ensure_ascii=False)
        hint_name = data.get('hint_name') or None
        gid = gc.ensure_global_by_identifiers(app.config['DATABASE'],market_params, category, hint_name)
        return jsonify({'global_id': gid}), 200

    @app.route('/api/global-catalog/info', methods=['POST'])
    @require_login
    def api_gc_info():
        data = request.get_json(silent=True) or {}
        gid = data.get('gid') or ''
        # Legge market_params & category dal GC
        conn = db.get_db_connection(app.config['DATABASE'])
        cur = conn.cursor()
        cur.execute("SELECT category, market_params, canonical_name, catalog_key FROM global_catalog WHERE id=?", (gid,))
        row = cur.fetchone(); conn.close()
        if not row:
            return jsonify({'error':'Global not found'}), 404
        category = row['category'] if isinstance(row, dict) else row[0]
        canonical_name = row['canonical_name'] if isinstance(row, dict) else row[2]
        catalog_key = row['catalog_key'] if isinstance(row, dict) else row[3]
        mp = json.loads((row['market_params'] if isinstance(row, dict) else row[1]) or "{}")
        name_hint = (mp.get('title') or mp.get('name') or '').strip()
        
        return jsonify({'mp': mp,'category':category,'canonical_name': canonical_name,'gid': gid, 'catalog_key': catalog_key}), 200
        results = {}

        # --- eBay (derivato dal tuo /api/ebay-estimate) ---
        try:
            EBAY_APP_ID = os.environ.get("EBAY_CLIENT_ID") or ''
            site_id = os.getenv('EBAY_SITE_ID', '101')
            keywords = " ".join([x for x in [
                name_hint, mp.get('language'), category, mp.get('condition')
            ] if x]).strip() or "collectible"

            payload = {
                'OPERATION-NAME': 'findCompletedItems',
                'SERVICE-VERSION': '1.13.0',
                'SECURITY-APPNAME': EBAY_APP_ID,
                'RESPONSE-DATA-FORMAT': 'JSON',
                'REST-PAYLOAD': 'true',
                'keywords': keywords,
                'paginationInput.entriesPerPage': '50',
                'itemFilter(0).name':'SoldItemsOnly',
                'itemFilter(0).value':'true',
                'siteid': site_id
            }
            r = requests.get("https://svcs.ebay.com/services/search/FindingService/v1", params=payload, timeout=8)
            r.raise_for_status()
            data = r.json()
            items = (((data or {}).get('findCompletedItemsResponse') or [{}])[0].get('searchResult') or [{}])[0].get('item', [])
            prices = []
            for it in items:
                selling = ((it.get('sellingStatus') or [{}])[0])
                if (selling.get('sellingState') or [''])[0] != 'EndedWithSales':
                    continue
                curr_price = ((it.get('sellingStatus') or [{}])[0].get('currentPrice') or [{}])[0]
                price_val  = float(curr_price.get('__value__', '0') or 0)
                conv       = ((it.get('sellingStatus') or [{}])[0].get('convertedCurrentPrice') or [{}])[0]
                if conv and conv.get('__value__'):
                    price_val = float(conv.get('__value__', price_val) or price_val)
                prices.append(price_val)
            if prices:
                import statistics
                stats = {
                    'avg': sum(prices)/len(prices),
                    'median': statistics.median(prices),
                    'min': min(prices),
                    'max': max(prices),
                    'samples_count': len(prices)
                }
                hlp.record_price_snapshot(gid, 'ebay', stats, {'url':'FindingService', 'params': payload})
                results['ebay'] = stats
        except Exception:
            pass

        # --- PriceCharting (derivato dal tuo /api/pricecharting-estimate) ---
        try:
            tok = os.environ.get('PRICECHARTING_TOKEN') or ''
            q = (name_hint or '').strip()
            if q:
                r = requests.get('https://www.pricecharting.com/api/product', params={'q': q, 't': tok}, timeout=8)
                r.raise_for_status()
                jsn = r.json() if r.headers.get('Content-Type','').startswith('application/json') else {}
                # calcolo semplice (es. loose/complete/new se presenti)
                vals = [float(jsn.get(k) or 0) for k in ['loose-price','cib-price','new-price'] if jsn.get(k)]
                if vals:
                    import statistics
                    stats = {
                        'avg': sum(vals)/len(vals),
                        'median': statistics.median(vals),
                        'min': min(vals),
                        'max': max(vals),
                        'samples_count': len(vals)
                    }
                    hlp.record_price_snapshot(gid, 'pricecharting', stats, {'endpoint':'/api/product','q':q})
                    results['pricecharting'] = stats
        except Exception:
            pass

        return jsonify({'global_id': gid, 'results': results}), 200

    @app.route('/api/global-catalog/<int:gid>/prices', methods=['GET'])
    @require_login
    def api_gc_prices(gid):
        source = request.args.get('source')  # opzionale
        since  = request.args.get('since')   # 'YYYY-MM-DD' opzionale
        conn = db.get_db_connection(); cur = conn.cursor()
        sql = "SELECT ref_date, source, samples_count, avg, median, min, max FROM global_catalog_prices WHERE global_id=?"
        params = [gid]
        if source:
            sql += " AND source=?"; params.append(source)
        if since:
            sql += " AND ref_date>=?"; params.append(since)
        sql += " ORDER BY ref_date ASC"
        cur.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return jsonify(rows), 200

    @app.route('/api/global-catalog/search', methods=['GET'])
    @require_login
    def api_gc_search():
        q = (request.args.get('q') or '').strip().lower()
        cat = (request.args.get('category') or '').strip().lower()
        conn = db.get_db_connection(); cur = conn.cursor()
        sql = "SELECT id, canonical_name, category, catalog_key FROM global_catalog WHERE 1=1"
        params = []
        if q:
            sql += " AND (LOWER(canonical_name) LIKE ? OR LOWER(catalog_key) LIKE ?)"
            params.extend([f'%{q}%', f'%{q}%'])
        if cat:
            sql += " AND LOWER(category)=?"; params.append(cat)
        sql += " ORDER BY updated_at DESC LIMIT 50"
        cur.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return jsonify(rows), 200

    @app.route('/api/global-catalog/<int:gid>/summary', methods=['GET'])
    @require_login
    def api_gc_summary(gid):
        conn = db.get_db_connection(); cur = conn.cursor()
        cur.execute("SELECT id, canonical_name, category, identifiers, market_params, info_links FROM global_catalog WHERE id=?", (gid,))
        gc = cur.fetchone()
        if not gc: conn.close(); return jsonify({'error':'Not found'}), 404
        cur.execute("""
            SELECT source, ref_date, samples_count, avg, median, min, max
            FROM global_catalog_prices WHERE global_id=? ORDER BY ref_date DESC, source ASC
        """, (gid,))
        prices = [dict(r) for r in cur.fetchall()]
        conn.close()
        return jsonify({
            'id': gc['id'], 'canonical_name': gc['canonical_name'], 'category': gc['category'],
            'identifiers': json.loads(gc['identifiers'] or '{}'),
            'market_params': json.loads(gc['market_params'] or '{}'),
            'info_links': json.loads(gc['info_links'] or '[]'),
            'prices': prices
        }), 200

    @app.route('/api/global-catalog/<int:gid>/info-links', methods=['PUT'])
    @require_login
    def put_global_info_links(gid):
        if not hlp.is_admin_user():
            return jsonify({'error':'Only admin can update global catalog'}), 403
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
        conn = db.get_db_connection(); cur = conn.cursor()
        cur.execute("UPDATE global_catalog SET info_links=?, updated_at=? WHERE id=?",
                    (json.dumps(clean, ensure_ascii=False), datetime.utcnow().isoformat(), gid))
        conn.commit(); conn.close()
        return jsonify({'ok': True, 'links': clean})

    # HOME
    @app.route('/api/dashboard/summary')
    def api_dashboard_summary():
        uid = session.get('user_id')
        if not uid:
            return jsonify({'error': 'Unauthorized'}), 401
        return dashboard.api_dashboard_summary(uid,app.config['DATABASE'])

    @app.route('/api/dashboard/trend')
    def api_dashboard_trend():
        uid = session.get('user_id')
        if not uid:
            return jsonify({'error': 'Unauthorized'}), 401
        return dashboard.api_dashboard_trend(app.config['DATABASE'])

   
    


    # PLATFORM INFO
    @app.route('/api/platform/overview')
    def api_platform_overview():
        return platform.api_platform_overview(app.config['DATABASE'])

    return app



if __name__ == '__main__':
    # When executed directly, run the app on localhost for development
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)



