import sqlite3

class db():

    def get_db_connection(db_string):
        """Helper to get a connection to the SQLite database."""
        conn = sqlite3.connect(db_string)
        # Return rows as dictionaries for easier handling
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(db_string):
        """
        Initializes the database by creating necessary tables if they don't exist
        and ensuring a default admin user is present.
        """
        conn = db.get_db_connection(db_string)
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
                marketplace_links TEXT,
                tags TEXT,
                image_path TEXT,
                market_params TEXT,
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

        # === GLOBAL CATALOG ===
        cur.execute("""
        CREATE TABLE IF NOT EXISTS global_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalog_key TEXT UNIQUE,              -- chiave univoca dedotta (es. discogs:12345, lego:75336, ean:...)
            canonical_name TEXT NOT NULL,         -- nome canonico (es. Artist - Album, o Nome set, ecc.)
            category TEXT,                        -- categoria (vinyl, cd, videogames, sneakers, lego, trading card, ...)
            identifiers TEXT,                     -- JSON (discogs_release_id, ean/upc, sku, set_number, stockx_slug, tcgplayer_id, catno/label, ...)
            market_params TEXT,                   -- JSON: stessi campi che usi per le ricerche
            info_links TEXT,                      -- JSON array di link descrittivi (wiki, discogs url, ecc.)
            created_at TEXT,
            updated_at TEXT
        );
        """)

        cur.execute("""
        CREATE TABLE IF NOT EXISTS global_catalog_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            global_id INTEGER NOT NULL,
            ref_date TEXT NOT NULL,              -- YYYY-MM-DD (giorno di riferimento)
            source TEXT,                         -- 'discogs' | 'ebay' | 'pricecharting' | 'stockx' | 'justtcg' | ...
            samples_count INTEGER,
            avg REAL,
            median REAL,
            min REAL,
            max REAL,
            query TEXT,                          -- JSON della query/fonte usata
            created_at TEXT,
            UNIQUE(global_id, ref_date, source)  -- un record al giorno per fonte
        );
        """)
        
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

        # --- DROP ebay_price_history se esiste ---
        cur.execute("""
            SELECT name FROM sqlite_master WHERE type='table' AND name='ebay_price_history'
                    """)
        if cur.fetchone():
            cur.execute("DROP TABLE ebay_price_history")


        # Attempt to add missing columns for backward compatibility. This ensures that
        # databases created before new fields were introduced continue to work.
        for column, col_type in [
            ('user_id', 'INTEGER'),
            ('image_path', 'TEXT'),
            ('quantity', 'INTEGER'),
            ('condition', 'TEXT'),
            ('currency', 'TEXT'),
            ('language', 'TEXT'),
            ('purchase_price_curr_ref', 'REAL'),
            ('market_params', 'TEXT'),
            ('fair_value', 'REAL'),
            ('price_p05', 'REAL'),
            ('price_p95', 'REAL'),
            ('valuation_date', 'TEXT'),
            ('global_id', 'INTEGER'),
            ('info_links', 'TEXT')
        ]:
            try:
                cur.execute(f"ALTER TABLE items ADD COLUMN {column} {col_type}")
            except sqlite3.OperationalError:
                # Column already exists
                pass

        # --- Campi denormalizzati per lookup rapidi su global_catalog ---
        for column, col_type in [
            ('ident_ean', 'TEXT'),
            ('ident_serial', 'TEXT'),
            ('ident_tcg_id', 'TEXT'),
            ('ident_discogs_id', 'TEXT'),
            ('ident_pc_id', 'TEXT'),
            ('ident_lego_set', 'TEXT'),
            ('ident_stockx_slug', 'TEXT'),
        ]:
            try:
                cur.execute(f"ALTER TABLE global_catalog ADD COLUMN {column} {col_type}")
            except sqlite3.OperationalError:
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

        # --- Indici consigliati ---
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_key ON global_catalog(catalog_key)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gc_cat ON global_catalog(category)")
        for idx_col in ['ident_ean','ident_serial','ident_tcg_id','ident_discogs_id','ident_pc_id','ident_lego_set','ident_stockx_slug']:
            cur.execute(f"CREATE INDEX IF NOT EXISTS idx_gc_{idx_col} ON global_catalog({idx_col})")

        # --- Indici prezzi globali ---
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gcp_gid_date ON global_catalog_prices(global_id, ref_date)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_gcp_source ON global_catalog_prices(source)")

        conn.commit()
        conn.close()