import sqlite3
import os

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
    
    # 5. Debts Table
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
    
    # 6. Monthly Summaries Table (for historical records/rollover)
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
def create_transaction(user_id, amount, type_, category_id, note, payment_method, transaction_date):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO transactions (user_id, amount, type, category_id, note, payment_method, transaction_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, amount, type_, category_id, note, payment_method, transaction_date))
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()

def update_transaction(transaction_id, user_id, amount, type_, category_id, note, payment_method, transaction_date):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            UPDATE transactions
            SET amount = ?, type = ?, category_id = ?, note = ?, payment_method = ?, transaction_date = ?
            WHERE id = ? AND user_id = ?
        ''', (amount, type_, category_id, note, payment_method, transaction_date, transaction_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def delete_transaction(transaction_id, user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM transactions WHERE id = ? AND user_id = ?', (transaction_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def get_transactions(user_id, start_date=None, end_date=None, category_id=None, type_=None, search_term=None):
    conn = get_db_connection()
    query = '''
        SELECT t.*, c.name as category_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
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
        query += ' AND (t.note LIKE ? OR c.name LIKE ?)'
        params.append(f'%{search_term}%')
        params.append(f'%{search_term}%')
        
    query += ' ORDER BY t.transaction_date DESC, t.id DESC'
    
    transactions = conn.execute(query, params).fetchall()
    conn.close()
    return transactions

# Budget Operations
def get_budgets(user_id, month):
    conn = get_db_connection()
    # We join categories to get category name.
    # Note: PRD says spent amount is dynamically calculated, not stored.
    # So we calculate how much was spent in the given category for this month.
    # We need to extract the transaction_date matches the month (format YYYY-MM)
    query = '''
        SELECT b.id, b.category_id, b.month, b.planned_amount, c.name as category_name,
               COALESCE((
                   SELECT SUM(t.amount) 
                   FROM transactions t 
                   WHERE t.user_id = b.user_id 
                     AND t.category_id = b.category_id 
                     AND t.type = 'expense'
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
            INSERT INTO debts (user_id, person_name, total_amount, pending_amount, due_date, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
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
            WHERE id = ? AND user_id = ?
        ''', (person_name, total_amount, pending_amount, due_date, status, notes, debt_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def get_debts(user_id):
    conn = get_db_connection()
    debts = conn.execute('SELECT * FROM debts WHERE user_id = ? ORDER BY due_date ASC', (user_id,)).fetchall()
    conn.close()
    return debts

def delete_debt(debt_id, user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM debts WHERE id = ? AND user_id = ?', (debt_id, user_id))
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
