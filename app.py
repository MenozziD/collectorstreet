import os
import requests
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
import sqlite3
import csv
import io
from datetime import datetime, date


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

    def get_db_connection():
        """Helper to get a connection to the SQLite database."""
        conn = sqlite3.connect(app.config['DATABASE'])
        # Return rows as dictionaries for easier handling
        conn.row_factory = sqlite3.Row
        return conn

    def init_db():
        """
        Initializes the database by creating necessary tables if they don't exist
        and ensuring a default admin user is present.
        """
        conn = get_db_connection()
        cur = conn.cursor()
        # Create users table
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                nickname TEXT,
                profile_image_path TEXT,
                vinted_link TEXT,
                cardmarket_link TEXT,
                ebay_link TEXT,
                facebook_link TEXT,
                ref_currency TEXT
            )
            """
        )
        # Add missing profile columns if needed
        for column, col_type in [
            ('nickname', 'TEXT'),
            ('profile_image_path', 'TEXT'),
            ('vinted_link', 'TEXT'),
            ('cardmarket_link', 'TEXT'),
            ('ebay_link', 'TEXT'),
            ('facebook_link', 'TEXT'),
            ('ref_currency', 'TEXT')
        ]:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN {column} {col_type}")
            except sqlite3.OperationalError:
                pass
        # Create items table
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT,
                purchase_price REAL,
                purchase_price_curr_ref REAL,
                purchase_date TEXT,
                sale_price REAL,
                sale_date TEXT,
                marketplace_link TEXT,
                tags TEXT,
                image_path TEXT,
                quantity INTEGER,
                condition TEXT
            )
            """
        )
        # Attempt to add missing columns for backward compatibility
        for column, col_type in [
            ('image_path', 'TEXT'),
            ('quantity', 'INTEGER'),
            ('condition', 'TEXT'),
            ('currency', 'TEXT'),
            ('language', 'TEXT'),
            ('purchase_price_curr_ref', 'REAL')
        ]:
            try:
                cur.execute(f"ALTER TABLE items ADD COLUMN {column} {col_type}")
            except sqlite3.OperationalError:
                # Column already exists
                pass
        # Insert default admin user if not exists
        cur.execute("SELECT id FROM users WHERE username = ?", ('admin',))
        if cur.fetchone() is None:
            cur.execute("INSERT INTO users (username, password) VALUES (?, ?)", ('admin', 'admin'))
        conn.commit()
        conn.close()

    # Configure upload folder for images
    upload_folder = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder
    # Initialize database on app creation
    init_db()

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
            'JPY': 0.0057,
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

    def compute_profile_stats(user: dict) -> dict:
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
        total_spent: float = 0.0
        total_sold: float = 0.0
        first_date = None
        # Fetch all items once
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM items")
        items = cur.fetchall()
        conn.close()
        for item in items:
            # Compute purchase amount in the reference currency on the fly.
            purchase_val: float = 0.0
            if item['purchase_price'] is not None:
                try:
                    amt = float(item['purchase_price'])
                except Exception:
                    amt = 0.0
                if item['currency']:
                    try:
                        purchase_val = convert_currency(amt, item['currency'], ref)
                    except Exception:
                        purchase_val = amt
                else:
                    purchase_val = amt
            total_spent += purchase_val
            # Compute sale amount in the reference currency on the fly
            if item['sale_price'] is not None:
                try:
                    s_amt = float(item['sale_price'])
                except Exception:
                    s_amt = 0.0
                sale_val = s_amt
                if item['currency']:
                    try:
                        sale_val = convert_currency(s_amt, item['currency'], ref)
                    except Exception:
                        sale_val = s_amt
                total_sold += sale_val
            # Determine earliest purchase date
            if item['purchase_date']:
                try:
                    dt = datetime.strptime(item['purchase_date'], '%Y-%m-%d').date()
                    if first_date is None or dt < first_date:
                        first_date = dt
                except Exception:
                    pass
        # Compute ROI
        roi = None
        if total_spent > 0:
            roi = (total_sold - total_spent) / total_spent
        start_date_str = None
        days_in_collection = None
        if first_date:
            start_date_str = first_date.isoformat()
            days_in_collection = (date.today() - first_date).days
        return {
            'total_spent': total_spent,
            'total_sold': total_sold,
            'roi': roi,
            'start_date': start_date_str,
            'days_in_collection': days_in_collection,
            'currency': ref
        }

    @app.route('/')
    def home():
        """
        Root route. If user is logged in, render the main application, otherwise show login.
        """
        if not session.get('logged_in'):
            return render_template('login.html')
        return render_template('index.html')

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
        conn = get_db_connection()
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
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM items")
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
            # Compute derived fields
            time_in_collection = None
            roi = None
            if item['purchase_date']:
                try:
                    purchase_date = datetime.strptime(item['purchase_date'], '%Y-%m-%d').date()
                    today = date.today()
                    delta = today - purchase_date
                    time_in_collection = delta.days
                except ValueError:
                    time_in_collection = None
            if item['purchase_price'] and item['sale_price'] and item['purchase_price'] != 0:
                try:
                    roi = (item['sale_price'] - item['purchase_price']) / item['purchase_price']
                except Exception:
                    roi = None
            result.append({
                'id': item['id'],
                'name': item['name'],
                'description': item['description'],
                'language': item['language'],
                'category': item['category'],
                'purchase_price': item['purchase_price'],
                'purchase_price_curr_ref': item['purchase_price_curr_ref'],
                'purchase_date': item['purchase_date'],
                'sale_price': item['sale_price'],
                'sale_date': item['sale_date'],
                'marketplace_link': item['marketplace_link'],
                'tags': item['tags'],
                'image_path': item['image_path'],
                'quantity': item['quantity'],
                'condition': item['condition'],
                'currency': item['currency'],
                'time_in_collection': time_in_collection,
                'roi': roi
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
        marketplace_link = data.get('marketplace_link')
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
                    conn = get_db_connection()
                    ccur = conn.cursor()
                    ccur.execute("SELECT ref_currency FROM users WHERE id = ?", (user_id,))
                    row = ccur.fetchone()
                    conn.close()
                    user_ref = row['ref_currency'] if row else None
                if purchase_price is not None and currency and user_ref:
                    purchase_price_curr_ref = convert_currency(float(purchase_price), currency, user_ref)
        except Exception:
            # leave as None if conversion fails
            purchase_price_curr_ref = None
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO items (name, description, category, purchase_price, purchase_price_curr_ref, purchase_date, sale_price, sale_date, marketplace_link, tags, image_path, quantity, condition, currency, language)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
            """,
            (name, description, category, purchase_price, purchase_price_curr_ref, purchase_date, sale_price, sale_date, marketplace_link, tags, quantity, condition_field, currency, language)
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
        if request.content_type and request.content_type.startswith('multipart/form-data'):
            # Update via form (potentially with image)
            form = request.form
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
                'marketplace_link': form.get('marketplace_link'),
                'tags': form.get('tags'),
                'quantity': int(form.get('quantity')) if form.get('quantity') else None,
                'condition': form.get('condition'),
                'currency': form.get('currency'),
                'language': form.get('language'),
                'purchase_price_curr_ref': float(form.get('purchase_price_curr_ref')) if form.get('purchase_price_curr_ref') else None
            }
            # Compute purchase_price_curr_ref automatically if not provided but purchase_price and currency are present
            try:
                if mapping.get('purchase_price_curr_ref') is None and mapping.get('purchase_price') is not None:
                    # fetch user's reference currency
                    user_ref = None
                    user_id_ses = session.get('user_id')
                    if user_id_ses:
                        conn_ref = get_db_connection()
                        cur_ref = conn_ref.cursor()
                        cur_ref.execute("SELECT ref_currency FROM users WHERE id = ?", (user_id_ses,))
                        row_ref = cur_ref.fetchone()
                        conn_ref.close()
                        user_ref = row_ref['ref_currency'] if row_ref else None
                    if user_ref and mapping.get('currency'):
                        mapping['purchase_price_curr_ref'] = convert_currency(mapping['purchase_price'], mapping.get('currency'), user_ref)
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
            values.append(item_id)
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(f"UPDATE items SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            conn.close()
            return jsonify({'message': 'Item updated'})
        else:
            data = request.get_json() or {}
            fields = []
            values = []
            # Build update list from provided fields
            for key in ['name', 'description', 'category', 'purchase_price', 'purchase_price_curr_ref', 'purchase_date', 'sale_price', 'sale_date', 'marketplace_link', 'tags', 'image_path', 'quantity', 'condition', 'currency', 'language']:
                if key in data and data[key] is not None:
                    fields.append(f"{key} = ?")
                    values.append(data[key])
            # If purchase_price changes and no converted price provided, compute automatically
            try:
                if ('purchase_price_curr_ref' not in data or data.get('purchase_price_curr_ref') is None) and data.get('purchase_price') is not None:
                    user_ref = None
                    user_id_ses = session.get('user_id')
                    if user_id_ses:
                        conn_ref = get_db_connection()
                        c_ref = conn_ref.cursor()
                        c_ref.execute("SELECT ref_currency FROM users WHERE id = ?", (user_id_ses,))
                        row_ref = c_ref.fetchone()
                        conn_ref.close()
                        user_ref = row_ref['ref_currency'] if row_ref else None
                    if user_ref and data.get('currency'):
                        conv_val = convert_currency(float(data['purchase_price']), data.get('currency'), user_ref)
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
            values.append(item_id)
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(f"UPDATE items SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            conn.close()
            return jsonify({'message': 'Item updated'})

    @app.route('/api/items/<int:item_id>', methods=['DELETE'])
    @require_login
    def delete_item(item_id: int):
        """
        Delete an item by ID.
        """
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM items WHERE id = ?", (item_id,))
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
            result = convert_currency(amount, from_cur, to_cur)
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
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, username, nickname, ref_currency FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        conn.close()
        if user:
            # Return user info as dict
            return jsonify({k: user[k] for k in user.keys()})
        return jsonify({'error': 'User not found'}), 404

    @app.route('/api/profile/stats', methods=['GET'])
    @require_login
    def api_profile_stats():
        """
        Endpoint to compute and return the current logged-in user's collection statistics
        in JSON format. Used by the front-end to refresh stats manually.
        """
        user_id = session.get('user_id')
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        conn.close()
        user_dict = dict(user) if user else {}
        stats = compute_profile_stats(user_dict)
        return jsonify(stats)

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
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM items")
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

    @app.route('/profile', methods=['GET', 'POST'])
    @require_login
    def profile():
        """
        Display and edit the logged-in user's profile. Supports GET (view) and POST (update).
        """
        user_id = session.get('user_id')
        conn = get_db_connection()
        cur = conn.cursor()
        if request.method == 'POST':
            form = request.form
            files = request.files
            nickname = form.get('nickname')
            ref_currency = form.get('ref_currency')
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
            # Handle profile image upload
            if profile_image and profile_image.filename:
                ext = os.path.splitext(profile_image.filename)[1].lower()
                if ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
                    unique_name = profile_image.filename
                    save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
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
            stats = compute_profile_stats(user_dict)
            return render_template('profile.html', user=user_dict, updated=True, stats=stats)
        else:
            # GET request: fetch user and compute stats
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cur.fetchone()
            conn.close()
            user_dict = dict(user) if user else {}
            stats = compute_profile_stats(user_dict)
            return render_template('profile.html', user=user_dict, stats=stats)

    return app


if __name__ == '__main__':
    # When executed directly, run the app on localhost for development
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)