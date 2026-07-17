import sqlite3
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database/cashiq.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Users Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        mobile TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # 2. Categories Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, name, type)
    )
    ''')
    
    # 3. Transactions Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category_id INTEGER NOT NULL,
        note TEXT,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other')),
        transaction_date TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    )
    ''')
    
    # 4. Budget Plans Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS budget_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        month TEXT NOT NULL, -- Format: YYYY-MM
        planned_amount REAL NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(user_id, category_id, month)
    )
    ''')
    
    # 5. Debts Table (Placeholder for IF NOT EXISTS; note we will migrate it below if needed)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        person_name TEXT NOT NULL,
        total_amount REAL NOT NULL,
        pending_amount REAL NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('Active', 'Paid', 'Overdue')),
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    ''')
    
    # 6. Monthly Summaries Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS monthly_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        month TEXT NOT NULL, -- Format: YYYY-MM
        total_income REAL NOT NULL,
        total_expense REAL NOT NULL,
        savings REAL NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, month)
    )
    ''')

    # 7. Events Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Completed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    ''')
    
    # 8. Debt Ledger Entries Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS debt_ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        debt_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('borrowed', 'repaid', 'lent', 'received')),
        amount REAL NOT NULL,
        entry_date TEXT NOT NULL,
        notes TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TEXT,
        event_id INTEGER,
        FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
    )
    ''')

    # --- DATABASE SCHEMA MIGRATIONS ---
    
    # A. Migrate transactions table to include is_deleted, deleted_at, event_id
    cursor.execute("PRAGMA table_info(transactions)")
    tx_cols = [row[1] for row in cursor.fetchall()]
    if 'is_deleted' not in tx_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN is_deleted INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE transactions ADD COLUMN deleted_at TEXT")
        cursor.execute("ALTER TABLE transactions ADD COLUMN event_id INTEGER")
    
    # B. Migrate debts table to support type, is_deleted, deleted_at, event_id
    cursor.execute("PRAGMA table_info(debts)")
    debt_cols = [row[1] for row in cursor.fetchall()]
    if 'type' not in debt_cols:
        cursor.execute("ALTER TABLE debts RENAME TO debts_old")
        
        cursor.execute('''
        CREATE TABLE debts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            person_name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('debt', 'receivable')),
            total_amount REAL NOT NULL DEFAULT 0.0,
            pending_amount REAL NOT NULL DEFAULT 0.0,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Active', 'Paid', 'Overdue')),
            notes TEXT,
            is_deleted INTEGER DEFAULT 0,
            deleted_at TEXT,
            event_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
            UNIQUE(user_id, person_name, type)
        )
        ''')
        
        # Copy existing data
        cursor.execute('''
        INSERT INTO debts (id, user_id, person_name, type, total_amount, pending_amount, due_date, status, notes)
        SELECT id, user_id, person_name, 
               CASE WHEN notes LIKE '[LENT]%' THEN 'receivable' ELSE 'debt' END,
               total_amount, pending_amount, due_date, status, notes
        FROM debts_old
        ''')
        
        cursor.execute("DROP TABLE debts_old")
        
        # Populate initial ledger entries for migrated debts
        cursor.execute("SELECT * FROM debts")
        migrated_debts = cursor.fetchall()
        today_str = datetime.now().strftime('%Y-%m-%d')
        
        for d in migrated_debts:
            d_id = d['id']
            d_user = d['user_id']
            d_type = d['type']
            d_total = d['total_amount']
            d_pending = d['pending_amount']
            d_notes = d['notes']
            
            # Initial borrowing/lending entry
            l_type = 'borrowed' if d_type == 'debt' else 'lent'
            cursor.execute('''
                INSERT INTO debt_ledger_entries (user_id, debt_id, type, amount, entry_date, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (d_user, d_id, l_type, d_total, today_str, d_notes))
            
            # Initial repayment entry if any
            if d_pending < d_total:
                repaid_amount = d_total - d_pending
                r_type = 'repaid' if d_type == 'debt' else 'received'
                cursor.execute('''
                    INSERT INTO debt_ledger_entries (user_id, debt_id, type, amount, entry_date, notes)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (d_user, d_id, r_type, repaid_amount, today_str, "Initial repayment migration"))
    
    conn.commit()
    conn.close()


# User Operations
def create_user(username, email, mobile, password_hash, role='user'):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO users (username, email, mobile, password, role) VALUES (?, ?, ?, ?, ?)',
            (username, email, mobile, password_hash, role)
        )
        conn.commit()
        user_id = cursor.lastrowid
        return user_id
    except sqlite3.IntegrityError as e:
        return None
    finally:
        conn.close()

def get_user_by_id(user_id):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    return user

def get_user_by_username(username):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()
    return user

def get_user_by_email(email):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()
    return user

def get_all_users():
    conn = get_db_connection()
    users = conn.execute('SELECT id, username, email, mobile, role, created_at FROM users').fetchall()
    conn.close()
    return users

# Category Operations
def create_category(user_id, name, type_):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)',
            (user_id, name, type_)
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        # If it already exists, return the existing category's ID
        cursor.execute(
            'SELECT id FROM categories WHERE (user_id = ? OR user_id IS NULL) AND name = ? AND type = ?',
            (user_id, name, type_)
        )
        cat = cursor.fetchone()
        return cat['id'] if cat else None
    finally:
        conn.close()

def get_categories_for_user(user_id):
    conn = get_db_connection()
    # Return user-specific categories as well as global categories (user_id IS NULL)
    categories = conn.execute(
        'SELECT * FROM categories WHERE user_id = ? OR user_id IS NULL ORDER BY name ASC',
        (user_id,)
    ).fetchall()
    conn.close()
    return categories

# Transaction Operations
def create_transaction(user_id, amount, type_, category_id, note, payment_method, transaction_date, event_id=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO transactions (user_id, amount, type, category_id, note, payment_method, transaction_date, event_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, amount, type_, category_id, note, payment_method, transaction_date, event_id))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def update_transaction(transaction_id, user_id, amount, type_, category_id, note, payment_method, transaction_date, event_id=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            UPDATE transactions
            SET amount = ?, type = ?, category_id = ?, note = ?, payment_method = ?, transaction_date = ?, event_id = ?
            WHERE id = ? AND user_id = ?
        ''', (amount, type_, category_id, note, payment_method, transaction_date, event_id, transaction_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def delete_transaction(transaction_id, user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            UPDATE transactions
            SET is_deleted = 1, deleted_at = ?
            WHERE id = ? AND user_id = ?
        ''', (now_str, transaction_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def get_transactions(user_id, start_date=None, end_date=None, category_id=None, type_=None, search_term=None):
    conn = get_db_connection()
    query = '''
        SELECT t.*, c.name as category_name, e.name as event_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN events e ON t.event_id = e.id
        WHERE t.user_id = ? AND t.is_deleted = 0
    '''
    params = [user_id]
    
    if start_date:
        query += ' AND t.transaction_date >= ?'
        params.append(start_date)
    if end_date:
        query += ' AND t.transaction_date <= ?'
        params.append(end_date)
    if category_id:
        query += ' AND t.category_id = ?'
        params.append(category_id)
    if type_:
        query += ' AND t.type = ?'
        params.append(type_)
    if search_term:
        query += ' AND (t.note LIKE ? OR c.name LIKE ? OR e.name LIKE ?)'
        params.append(f'%{search_term}%')
        params.append(f'%{search_term}%')
        params.append(f'%{search_term}%')
        
    query += ' ORDER BY t.transaction_date DESC, t.id DESC'
    
    transactions = conn.execute(query, params).fetchall()
    conn.close()
    return transactions

# Budget Operations
def get_budgets(user_id, month):
    conn = get_db_connection()
    query = '''
        SELECT b.id, b.category_id, b.month, b.planned_amount, c.name as category_name,
               COALESCE((
                   SELECT SUM(t.amount) 
                   FROM transactions t 
                   WHERE t.user_id = b.user_id 
                     AND t.category_id = b.category_id 
                     AND t.type = 'expense'
                     AND t.is_deleted = 0
                     AND strftime('%Y-%m', t.transaction_date) = b.month
               ), 0.0) as spent_amount
        FROM budget_plans b
        JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = ? AND b.month = ?
    '''
    budgets = conn.execute(query, (user_id, month)).fetchall()
    conn.close()
    return budgets

def get_budget_by_id(budget_id, user_id):
    conn = get_db_connection()
    budget = conn.execute('SELECT * FROM budget_plans WHERE id = ? AND user_id = ?', (budget_id, user_id)).fetchone()
    conn.close()
    return budget

def create_or_update_budget(user_id, category_id, month, planned_amount):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO budget_plans (user_id, category_id, month, planned_amount)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, category_id, month) DO UPDATE SET planned_amount = excluded.planned_amount
        ''', (user_id, category_id, month, planned_amount))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

# Debt Operations
def create_debt(user_id, person_name, total_amount, pending_amount, due_date, status, notes=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO debts (user_id, person_name, total_amount, pending_amount, due_date, status, notes, type)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'debt')
        ''', (user_id, person_name, total_amount, pending_amount, due_date, status, notes))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def update_debt(debt_id, user_id, person_name, total_amount, pending_amount, due_date, status, notes=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            UPDATE debts
            SET person_name = ?, total_amount = ?, pending_amount = ?, due_date = ?, status = ?, notes = ?
            WHERE id = ? AND user_id = ? AND is_deleted = 0
        ''', (person_name, total_amount, pending_amount, due_date, status, notes, debt_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def get_debts(user_id):
    conn = get_db_connection()
    debts = conn.execute("SELECT * FROM debts WHERE user_id = ? AND is_deleted = 0 AND type = 'debt' ORDER BY due_date ASC", (user_id,)).fetchall()
    conn.close()
    return debts

def delete_debt(debt_id, user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            UPDATE debts
            SET is_deleted = 1, deleted_at = ?
            WHERE id = ? AND user_id = ?
        ''', (now_str, debt_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

# Monthly Rollover System
def get_monthly_summaries(user_id):
    conn = get_db_connection()
    summaries = conn.execute('SELECT * FROM monthly_summaries WHERE user_id = ? ORDER BY month DESC', (user_id,)).fetchall()
    conn.close()
    return summaries

def save_monthly_summary(user_id, month, total_income, total_expense, savings):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO monthly_summaries (user_id, month, total_income, total_expense, savings)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, month) DO UPDATE SET
                total_income = excluded.total_income,
                total_expense = excluded.total_expense,
                savings = excluded.savings
        ''', (user_id, month, total_income, total_expense, savings))
        conn.commit()
        return True
    finally:
        conn.close()

def get_event_by_id(event_id, user_id):
    conn = get_db_connection()
    event = conn.execute("SELECT * FROM events WHERE id = ? AND user_id = ? AND is_deleted = 0", (event_id, user_id)).fetchone()
    conn.close()
    return event

def recalculate_debt_balances(debt_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get the debt record
    debt = conn.execute("SELECT * FROM debts WHERE id = ?", (debt_id,)).fetchone()
    if not debt:
        conn.close()
        return
        
    # Get all active ledger entries
    entries = conn.execute(
        "SELECT * FROM debt_ledger_entries WHERE debt_id = ? AND is_deleted = 0",
        (debt_id,)
    ).fetchall()
    
    total_amount = 0.0
    pending_amount = 0.0
    
    for entry in entries:
        if entry['type'] in ('borrowed', 'lent'):
            total_amount += entry['amount']
            pending_amount += entry['amount']
        elif entry['type'] in ('repaid', 'received'):
            pending_amount -= entry['amount']
            
    if pending_amount < 0:
        pending_amount = 0.0
        
    status = 'Paid' if pending_amount <= 0 else 'Active'
    if status == 'Active':
        today_str = datetime.now().strftime('%Y-%m-%d')
        if debt['due_date'] < today_str:
            status = 'Overdue'
            
    cursor.execute(
        "UPDATE debts SET total_amount = ?, pending_amount = ?, status = ? WHERE id = ?",
        (total_amount, pending_amount, status, debt_id)
    )
    conn.commit()
    conn.close()

def cleanup_trash(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Calculate date 30 days ago
    limit_date = datetime.now() - timedelta(days=30)
    limit_str = limit_date.strftime('%Y-%m-%d %H:%M:%S')
    
    # Permanently delete records soft-deleted more than 30 days ago
    cursor.execute("DELETE FROM transactions WHERE user_id = ? AND is_deleted = 1 AND deleted_at < ?", (user_id, limit_str))
    cursor.execute("DELETE FROM debt_ledger_entries WHERE user_id = ? AND is_deleted = 1 AND deleted_at < ?", (user_id, limit_str))
    cursor.execute("DELETE FROM debts WHERE user_id = ? AND is_deleted = 1 AND deleted_at < ?", (user_id, limit_str))
    cursor.execute("DELETE FROM events WHERE user_id = ? AND is_deleted = 1 AND deleted_at < ?", (user_id, limit_str))
    
    conn.commit()
    conn.close()

