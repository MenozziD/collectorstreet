import os
import requests
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
import sqlite3
import csv
import io
from dotenv import load_dotenv
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
        
            ,('theme', 'TEXT')]:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN {column} {col_type}")
            except sqlite3.OperationalError:
                pass
        # Create items table. Each item is linked to the user who created it via the user_id field.
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
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
                condition TEXT,
                currency TEXT,
                language TEXT,
                fair_value REAL,
                price_p05 REAL,
                price_p95 REAL,
                valuation_date TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        # eBay price history per-item (one record per day)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ebay_price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                avg REAL,
                median REAL,
                min REAL,
                max REAL,
                count INTEGER,
                currency TEXT,
                keywords TEXT,
                site_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(item_id, date)
            )
            """
        )
        # Attempt to add missing columns for backward compatibility. This ensures that
        # databases created before new fields were introduced continue to work.
        for column, col_type in [
            ('user_id', 'INTEGER'),
            ('image_path', 'TEXT'),
            ('quantity', 'INTEGER'),
            ('condition', 'TEXT'),
            ('currency', 'TEXT'),
            ('language', 'TEXT'),
            ('purchase_price_curr_ref', 'REAL')
            ,('fair_value', 'REAL'),
            ('price_p05', 'REAL'),
            ('price_p95', 'REAL'),
            ('valuation_date', 'TEXT')
        ]:
            try:
                cur.execute(f"ALTER TABLE items ADD COLUMN {column} {col_type}")
            except sqlite3.OperationalError:
                # Column already exists
                pass
        # Insert default admin user if not exists
        cur.execute("SELECT id FROM users WHERE username = ?", ('admin',))
        admin_row = cur.fetchone()
        if admin_row is None:
            cur.execute("INSERT INTO users (username, password) VALUES (?, ?)", ('admin', 'admin'))
            admin_id = cur.lastrowid
        else:
            admin_id = admin_row['id'] if isinstance(admin_row, sqlite3.Row) else admin_row[0]
        # For existing items created before user_id column existed, assign them to the admin user
        try:
            cur.execute("UPDATE items SET user_id = ? WHERE user_id IS NULL", (admin_id,))
        except Exception:
            # If the column doesn't exist yet, ignore
            pass
        conn.commit()
        conn.close()

    # Configure upload folder for images
    upload_folder = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder
    # Initialize database on app creation
    init_db()

    # ----------------------------------------------------------------------
    # TCGPlayer API integration
    #
    # To enable fetching market prices for trading cards, set the environment
    # variables TCGPLAYER_PUBLIC_KEY and TCGPLAYER_PRIVATE_KEY with your
    # developer credentials. The API requires obtaining an access token via
    # client credentials and then using the catalog and pricing endpoints.
    # See https://docs.tcgplayer.com/docs/getting-started for details.
    tcgplayer_public_key = os.environ.get('TCGPLAYER_PUBLIC_KEY')
    tcgplayer_private_key = os.environ.get('TCGPLAYER_PRIVATE_KEY')
    # Token cache to avoid requesting a new token on every call
    token_cache = {'token': None, 'expires_at': 0}

    def get_tcgplayer_token() -> str | None:
        """
        Obtain an OAuth token from TCGPlayer. Caches the token until expiry.

        Returns:
            str or None: Bearer token string if credentials are configured and token retrieval succeeds, else None.
        """
        import base64
        import time
        if not tcgplayer_public_key or not tcgplayer_private_key:
            return None
        # Return cached token if still valid
        if token_cache['token'] and token_cache['expires_at'] > time.time() + 60:
            return token_cache['token']
        # Compose basic auth header
        creds = f"{tcgplayer_public_key}:{tcgplayer_private_key}"
        b64_creds = base64.b64encode(creds.encode('utf-8')).decode('utf-8')
        headers = {
            'Authorization': f"Basic {b64_creds}",
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        data = {'grant_type': 'client_credentials'}
        try:
            resp = requests.post('https://api.tcgplayer.com/token', headers=headers, data=data, timeout=10)
            if resp.status_code != 200:
                return None
            token_json = resp.json()
            access_token = token_json.get('access_token')
            expires_in = token_json.get('expires_in', 0)
            if access_token:
                token_cache['token'] = access_token
                token_cache['expires_at'] = time.time() + int(expires_in)
                return access_token
        except Exception:
            return None
        return None

    def get_tcgplayer_market_price(item_name: str) -> float | None:
        """
        Query TCGPlayer for market price of a card given its name. This function
        searches for the product by name and retrieves the market price from
        pricing endpoints. Requires valid API credentials.

        Args:
            item_name (str): Name of the card to search.

        Returns:
            float or None: Market price in USD if available; otherwise None.
        """
        # Without credentials, skip API call
        token = get_tcgplayer_token()
        if not token:
            return None
        # Search for the product
        try:
            search_headers = {'Authorization': f"Bearer {token}"}
            params = {'productName': item_name, 'limit': 1, 'getExtendedFields': 'true'}
            search_resp = requests.get('https://api.tcgplayer.com/catalog/products', headers=search_headers, params=params, timeout=10)
            if search_resp.status_code != 200:
                return None
            search_data = search_resp.json()
            results = search_data.get('results') or []
            if not results:
                return None
            product = results[0]
            product_id = product.get('productId')
            if not product_id:
                return None
            # Fetch pricing for this product
            price_resp = requests.get(f'https://api.tcgplayer.com/pricing/product/{product_id}', headers=search_headers, timeout=10)
            if price_resp.status_code != 200:
                return None
            price_data = price_resp.json()
            prices = price_data.get('results') or []
            # The pricing results may include multiple entries; take the marketPrice of the first if present
            for p in prices:
                market = p.get('marketPrice')
                if market is not None:
                    try:
                        return float(market)
                    except Exception:
                        continue
            return None
        except Exception:
            return None

    # ----------------------------------------------------------------------
    # eBay API integration
    #
    # These functions allow fetching price data from eBay's Browse API. To use
    # them, set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET environment variables.
    # The API uses OAuth2.0 to obtain an access token. Rate limits apply.
    ebay_client_id = os.environ.get('EBAY_CLIENT_ID')
    ebay_client_secret = os.environ.get('EBAY_CLIENT_SECRET')
    ebay_token_cache = {'token': None, 'expires_at': 0}

    def get_ebay_token() -> str | None:
        """Obtain an OAuth2 bearer token from eBay using client credentials."""
        import time
        import base64
        if not ebay_client_id or not ebay_client_secret:
            return None
        # Return cached token if still valid
        if ebay_token_cache['token'] and ebay_token_cache['expires_at'] > time.time() + 60:
            return ebay_token_cache['token']
        creds = f"{ebay_client_id}:{ebay_client_secret}"
        b64_creds = base64.b64encode(creds.encode('utf-8')).decode('utf-8')
        headers = {
            'Authorization': f"Basic {b64_creds}",
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        data = {'grant_type': 'client_credentials', 'scope': 'https://api.ebay.com/oauth/api_scope/buy.browse'}
        try:
            resp = requests.post('https://api.ebay.com/identity/v1/oauth2/token', headers=headers, data=data, timeout=10)
            if resp.status_code != 200:
                return None
            json_resp = resp.json()
            token = json_resp.get('access_token')
            expires_in = json_resp.get('expires_in', 0)
            if token:
                ebay_token_cache['token'] = token
                ebay_token_cache['expires_at'] = time.time() + int(expires_in)
                return token
        except Exception:
            return None
        return None

    def get_ebay_market_price(item_name: str) -> float | None:
        """
        Search eBay for the given item and return an approximate market price in
        the item's listed currency. Uses the Browse API search endpoint.
        """
        token = get_ebay_token()
        if not token:
            return None
        headers = {
            'Authorization': f"Bearer {token}",
            'Content-Type': 'application/json'
        }
        params = {
            'q': item_name,
            'limit': 10,
            # filter: sold items only or buyNow available, etc.
            # we do not restrict to sold items because we want current listings
        }
        try:
            resp = requests.get('https://api.ebay.com/buy/browse/v1/item_summary/search', headers=headers, params=params, timeout=10)
            if resp.status_code != 200:
                return None
            data = resp.json()
            summaries = data.get('itemSummaries') or []
            # Extract prices; choose median of first few items
            prices = []
            for s in summaries:
                price_info = s.get('price')
                if price_info and price_info.get('value') is not None:
                    try:
                        prices.append(float(price_info['value']))
                    except Exception:
                        pass
            if not prices:
                return None
            # Return median of collected prices
            prices.sort()
            mid = len(prices) // 2
            return prices[mid]
        except Exception:
            return None

    # ----------------------------------------------------------------------
    # PriceCharting API integration
    #
    # PriceCharting offers an API for video game prices. To use it, set
    # PRICECHARTING_TOKEN in your environment. Note that this API is rate limited.
    pricecharting_token = os.environ.get('PRICECHARTING_TOKEN')

    def get_pricecharting_market_price(item_name: str) -> float | None:
        """
        Query PriceCharting for a given item and return its loose price in USD.
        Requires a valid API token via PRICECHARTING_TOKEN.
        """
        if not pricecharting_token:
            return None
        try:
            # Search for the product by name
            search_params = {'t': pricecharting_token, 'q': item_name}
            resp = requests.get('https://www.pricecharting.com/api/search', params=search_params, timeout=10)
            if resp.status_code != 200:
                return None
            data = resp.json()
            products = data.get('products') or []
            if not products:
                return None
            product = products[0]
            product_id = product.get('product_id') or product.get('productId')
            if not product_id:
                return None
            # Fetch product details to get price
            detail_params = {'t': pricecharting_token, 'id': product_id}
            detail_resp = requests.get('https://www.pricecharting.com/api/product', params=detail_params, timeout=10)
            if detail_resp.status_code != 200:
                return None
            detail = detail_resp.json()
            # Choose loose price if available; otherwise use new price
            loose_price = detail.get('loose_price') or detail.get('lowest_price')
            if loose_price:
                return float(loose_price)
            return None
        except Exception:
            return None

    # ----------------------------------------------------------------------
    # JustTCG (or similar) API integration
    #
    # JustTCG provides pricing data for various trading card games. You must
    # obtain an API key and set JUSTTCG_API_KEY. See justtcg.com for docs.
    justtcg_api_key = os.environ.get('JUSTTCG_API_KEY')

    def get_justtcg_market_price(item_name: str) -> float | None:
        """
        Query JustTCG for the market price of a trading card. Returns price in USD.
        Requires a valid API key via JUSTTCG_API_KEY.
        """
        if not justtcg_api_key:
            return None
        try:
            headers = {'Authorization': f"Bearer {justtcg_api_key}"}
            params = {'q': item_name, 'limit': 1}
            resp = requests.get('https://api.justtcg.com/v1/prices', headers=headers, params=params, timeout=10)
            if resp.status_code != 200:
                return None
            data = resp.json()
            results = data.get('results') or []
            if not results:
                return None
            price_info = results[0]
            price = price_info.get('price') or price_info.get('marketPrice')
            if price:
                return float(price)
            return None
        except Exception:
            return None


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
                    fair_value = convert_currency(fair_value, 'USD', item_currency)
                    price_p05 = convert_currency(price_p05, 'USD', item_currency)
                    price_p95 = convert_currency(price_p95, 'USD', item_currency)
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
        # Somme per le statistiche
        total_spent_all: float = 0.0  # somma speso su tutti gli oggetti
        total_spent_sold: float = 0.0  # somma speso solo per gli oggetti venduti
        total_sold: float = 0.0        # somma venduto (incasso)
        item_count: int = 0
        first_date = None
        # Fetch only the items belonging to this user
        conn = get_db_connection()
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
                        purchase_val = convert_currency(amt, item['currency'], ref)
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
                        sale_val = convert_currency(s_amt, item['currency'], ref)
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

    @app.route('/')
    def home():
        """
        Root route. If user is logged in, render the main application, otherwise show login.
        """
        if not session.get('logged_in'):
            return render_template('login.html')
        conn = get_db_connection()
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
        # Only retrieve items belonging to the logged-in user
        user_id = session.get('user_id')
        conn = get_db_connection()
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
            # Estimate valuation for this item
            valuation = estimate_valuation(item)
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
                'roi': roi,
                'fair_value': valuation.get('fair_value'),
                'price_p05': valuation.get('price_p05'),
                'price_p95': valuation.get('price_p95'),
                'valuation_date': valuation.get('valuation_date')
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
        # Insert a new item associated with the current user. The image_path is stored as NULL on creation.
        user_id = session.get('user_id')
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO items (
                user_id, name, description, category, purchase_price, purchase_price_curr_ref, purchase_date,
                sale_price, sale_date, marketplace_link, tags, image_path, quantity, condition, currency, language
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                marketplace_link,
                tags,
                None,  # image_path set to NULL on creation
                quantity,
                condition_field,
                currency,
                language
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
            # Append conditions for item id and user ownership
            values.append(item_id)
            # Ensure only the owner can update the item
            user_id_ses = session.get('user_id')
            values.append(user_id_ses)
            conn = get_db_connection()
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
            # Append conditions for item id and user ownership
            values.append(item_id)
            user_id_ses = session.get('user_id')
            values.append(user_id_ses)
            conn = get_db_connection()
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
        conn = get_db_connection()
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
        cur.execute("SELECT id, username, nickname, ref_currency, theme FROM users WHERE id = ?", (user_id,))
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
        conn = get_db_connection()
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
            conn = get_db_connection()
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
        conn = get_db_connection()
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
        conn = get_db_connection()
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
        conn = get_db_connection()
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
        conn = get_db_connection()
        cur = conn.cursor()
        # Delete user and cascade delete items
        cur.execute("DELETE FROM users WHERE id = ?", (uid,))
        # Also delete items belonging to this user
        cur.execute("DELETE FROM items WHERE user_id = ?", (uid,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'User deleted'})

    @app.route('/home')
    @require_login
    def home_page():
        """
        Display the home page for the logged-in user. This shows a summary
        of collection statistics similar to the profile page without the edit form.
        """
        user_id = session.get('user_id')
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cur.fetchone()
        conn.close()
        user_dict = dict(user) if user else {}
        stats = compute_profile_stats(user_dict)
        return render_template('home.html', user=user_dict, stats=stats)

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
            is_admin = user_dict.get('username') == 'admin'
            return render_template('profile.html', user=user_dict, updated=True, stats=stats, is_admin=is_admin)
        else:
            # GET request: fetch user and compute stats
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cur.fetchone()
            conn.close()
            user_dict = dict(user) if user else {}
            stats = compute_profile_stats(user_dict)
            is_admin = user_dict.get('username') == 'admin'
            return render_template('profile.html', user=user_dict, stats=stats, is_admin=is_admin)

    @app.route('/api/ebay-estimate')
    @require_login
    def ebay_estimate():
        """Stima prezzo a mercato dai venduti recenti su eBay (Finding API)."""
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error': 'Missing item_id'}), 400

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM items WHERE id = ?", (item_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Item not found'}), 404

        item = dict(row)

        # Costruzione keywords: nome + lingua + categoria + condizione
        keywords_parts = [item.get('name') or '']
        if item.get('language'):   keywords_parts.append(item['language'])
        if item.get('category'):   keywords_parts.append(item['category'])
        if item.get('condition'):  keywords_parts.append(item['condition'])
        keywords = " ".join([k for k in keywords_parts if k]).strip() or "collectible"

        import os, requests, statistics
        EBAY_APP_ID = os.environ.get("EBAY_CLIENT_ID")
        site_id = os.getenv('EBAY_SITE_ID', '101')  # 101 = Italy, 0 = US

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

        result = {
            'source': 'eBay Finding API - findCompletedItems',
            'query': {'url': url, 'params': payload},
            'stats': None,
            'samples': []
        }

        try:
            if not EBAY_APP_ID:
                raise RuntimeError('Missing EBAY_APP_ID')

            r = requests.get(url, params=payload, timeout=8)
            r.raise_for_status()
            data = r.json()

            items = (((data or {}).get('findCompletedItemsResponse') or [{}])[0]
                    .get('searchResult') or [{}])[0].get('item', [])

            prices, samples = [], []
            currency = 'EUR'
            for it in items:
                selling = ((it.get('sellingStatus') or [{}])[0])
                state   = (selling.get('sellingState') or [''])[0]
                if state != 'EndedWithSales':    # solo effettivamente venduti
                    continue

                curr_price = ((selling.get('currentPrice') or [{}])[0])
                price_val  = float(curr_price.get('__value__', '0') or 0)
                currency   = curr_price.get('@currencyId', currency)

                # Se disponibile, usa il prezzo convertito
                conv = (selling.get('convertedCurrentPrice') or [{}])[0]
                if conv and conv.get('__value__'):
                    price_val = float(conv.get('__value__', price_val) or price_val)
                    currency  = conv.get('@currencyId', currency)

                title    = (it.get('title') or [''])[0]
                view_url = (it.get('viewItemURL') or [''])[0]
                end_time = (((it.get('listingInfo') or [{}])[0]).get('endTime') or [''])[0]

                prices.append(price_val)
                if len(samples) < 5:
                    samples.append({'title': title, 'price': price_val, 'currency': currency,
                                    'url': view_url, 'endTime': end_time})

            if not prices:
                result['stats'] = {'count': 0}
            else:
                avg = sum(prices)/len(prices)
                med = statistics.median(prices)
                mn, mx = min(prices), max(prices)
                result['stats']   = {'count': len(prices), 'avg': round(avg,2), 'median': round(med,2),
                                    'min': round(mn,2), 'max': round(mx,2), 'currency': currency}
                result['samples'] = samples

            return jsonify(result), 200

        except Exception:
            # Fallback se manca la key o non raggiungo eBay:
            base = float(item.get('purchase_price') or 0) or 50.0
            est  = base * 1.1
            result['stats'] = {'count': 0, 'avg': round(est,2), 'median': round(est,2),
                            'min': round(base*0.9,2), 'max': round(base*1.3,2),
                            'currency': item.get('currency') or 'EUR', 'stub': True}
            return jsonify(result)

    @app.route('/api/ebay-estimate2')
    @require_login
    def ebay_estimate2():
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error': 'Missing item_id'}), 400

        conn = get_db_connection()
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

            cur.execute("""
                INSERT INTO ebay_price_history (item_id, date, avg, median, min, max, count, currency, keywords, site_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id, date) DO UPDATE SET
                    avg=excluded.avg, median=excluded.median, min=excluded.min, max=excluded.max,
                    count=excluded.count, currency=excluded.currency, keywords=excluded.keywords, site_id=excluded.site_id
            """, (item_id, today, stats.get('avg'), stats.get('median'), stats.get('min'), stats.get('max'),
                    stats.get('count',0), stats.get('currency'), keywords, str(site_id)))
            conn.commit()

            result['stats'] = stats
            result['samples'] = samples
            conn.close()
            return jsonify(result), 200

        except Exception:
            base_val = float(item.get('purchase_price') or 0) or 50.0
            est = base_val * 1.1
            today = _dt.date.today().isoformat()
            stats = {'count': 0, 'avg': round(est,2), 'median': round(est,2), 'min': round(base_val*0.9,2), 'max': round(base_val*1.3,2), 'currency': item.get('currency') or 'EUR', 'stub': True}
            cur.execute("""
                INSERT INTO ebay_price_history (item_id, date, avg, median, min, max, count, currency, keywords, site_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id, date) DO UPDATE SET
                    avg=excluded.avg, median=excluded.median, min=excluded.min, max=excluded.max,
                    count=excluded.count, currency=excluded.currency, keywords=excluded.keywords, site_id=excluded.site_id
            """, (item_id, today, stats.get('avg'), stats.get('median'), stats.get('min'), stats.get('max'),
                    stats.get('count',0), stats.get('currency'), keywords, str(site_id)))
            conn.commit(); conn.close()
            result['stats'] = stats
            return jsonify(result), 200


    @app.route('/api/ebay/history')
    @require_login
    def ebay_history():
        item_id = request.args.get('item_id', type=int)
        if not item_id:
            return jsonify({'error':'Missing item_id'}), 400
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT date, avg, median, min, max, count, currency, keywords FROM ebay_price_history WHERE item_id = ? ORDER BY date ASC", (item_id,))
        rows = cur.fetchall(); conn.close()
        return jsonify([dict(r) for r in rows]), 200


    return app


if __name__ == '__main__':
    # When executed directly, run the app on localhost for development
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)


