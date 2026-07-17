import os
from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import sqlite3
from datetime import datetime
import db_init
import models

app = Flask(__name__)

db_init.init_db()


app = Flask(__name__, static_folder='static')
app.secret_key = 'cashiq_super_secret_session_key_for_dev_only'

# Decorators for auth
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Unauthorized. Please login.'}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Unauthorized.'}), 401
        if session.get('role') != 'admin':
            return jsonify({'success': False, 'error': 'Access denied. Admin role required.'}), 403
        return f(*args, **kwargs)
    return decorated_function

# Route to serve the frontend SPA
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

# Catch-all route to support client-side routing if they refresh on subpages
@app.route('/<path:path>')
def serve_static(path):
    if path.startswith('api/'):
        return jsonify({'success': False, 'error': 'API endpoint not found'}), 404
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # Default fallback to index.html for SPA routing
    return send_from_directory(app.static_folder, 'index.html')

# --- AUTH API ENDPOINTS ---

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    mobile = data.get('mobile', '').strip()
    password = data.get('password', '')
    
    if not username or not email or not mobile or not password:
        return jsonify({'success': False, 'error': 'All fields are required.'}), 400
        
    if len(password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters long.'}), 400

    hashed_pw = generate_password_hash(password)
    user_id = models.create_user(username, email, mobile, hashed_pw)
    
    if not user_id:
        # Check why it failed
        if models.get_user_by_username(username):
            return jsonify({'success': False, 'error': 'Username is already taken.'}), 400
        if models.get_user_by_email(email):
            return jsonify({'success': False, 'error': 'Email is already registered.'}), 400
        return jsonify({'success': False, 'error': 'Signup failed. Please try again.'}), 400
        
    return jsonify({'success': True, 'message': 'Signup successful. You can now login.'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password are required.'}), 400
        
    user = models.get_user_by_username(username)
    if not user:
        user = models.get_user_by_email(username) # Allow login with email too
        
    if not user or not check_password_hash(user['password'], password):
        return jsonify({'success': False, 'error': 'Invalid credentials.'}), 401
        
    # Store session details
    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']
    
    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'mobile': user['mobile'],
            'role': user['role']
        }
    })

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully.'})

@app.route('/api/session', methods=['GET'])
def get_session():
    if 'user_id' in session:
        user = models.get_user_by_id(session['user_id'])
        if user:
            return jsonify({
                'success': True,
                'user': {
                    'id': user['id'],
                    'username': user['username'],
                    'email': user['email'],
                    'mobile': user['mobile'],
                    'role': user['role']
                }
            })
    return jsonify({'success': False, 'user': None})

# --- TRANSACTION API ENDPOINTS ---

@app.route('/api/transactions', methods=['GET'])
@login_required
def get_transactions_api():
    user_id = session['user_id']
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    category_id = request.args.get('categoryId')
    type_ = request.args.get('type')
    search_term = request.args.get('search')
    
    transactions = models.get_transactions(
        user_id, 
        start_date=start_date, 
        end_date=end_date, 
        category_id=category_id, 
        type_=type_, 
        search_term=search_term
    )
    
    tx_list = []
    for tx in transactions:
        tx_list.append({
            'id': tx['id'],
            'amount': tx['amount'],
            'type': tx['type'],
            'category_id': tx['category_id'],
            'category_name': tx['category_name'],
            'note': tx['note'],
            'payment_method': tx['payment_method'],
            'transaction_date': tx['transaction_date'],
            'event_id': tx['event_id'],
            'event_name': tx['event_name']
        })
    return jsonify({'success': True, 'data': tx_list})

@app.route('/api/transactions', methods=['POST'])
@login_required
def create_transaction_api():
    user_id = session['user_id']
    data = request.get_json() or {}
    
    try:
        amount = float(data.get('amount', 0))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid amount.'}), 400
        
    type_ = data.get('type')
    category_id = data.get('category_id')
    note = data.get('note', '').strip()
    payment_method = data.get('payment_method')
    transaction_date = data.get('transaction_date')
    event_id = data.get('event_id')
    
    if amount <= 0:
        return jsonify({'success': False, 'error': 'Amount must be greater than zero.'}), 400
    if type_ not in ('income', 'expense'):
        return jsonify({'success': False, 'error': 'Invalid transaction type.'}), 400
    if not category_id:
        return jsonify({'success': False, 'error': 'Category is required.'}), 400
    if payment_method not in ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'):
        return jsonify({'success': False, 'error': 'Invalid payment method.'}), 400
    if not transaction_date:
        return jsonify({'success': False, 'error': 'Transaction date is required.'}), 400

    if event_id:
        event = models.get_event_by_id(event_id, user_id)
        if not event:
            return jsonify({'success': False, 'error': 'Event not found.'}), 400
        if event['status'] == 'Completed':
            return jsonify({'success': False, 'error': 'Cannot add transaction to a completed event.'}), 400
        
    tx_id = models.create_transaction(
        user_id, amount, type_, category_id, note, payment_method, transaction_date, event_id
    )
    
    if tx_id:
        return jsonify({'success': True, 'message': 'Transaction added.', 'id': tx_id}), 201
    return jsonify({'success': False, 'error': 'Failed to add transaction.'}), 500

@app.route('/api/transactions/<int:tx_id>', methods=['PUT'])
@login_required
def update_transaction_api(tx_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    
    try:
        amount = float(data.get('amount', 0))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid amount.'}), 400
        
    type_ = data.get('type')
    category_id = data.get('category_id')
    note = data.get('note', '').strip()
    payment_method = data.get('payment_method')
    transaction_date = data.get('transaction_date')
    event_id = data.get('event_id')
    
    if amount <= 0:
        return jsonify({'success': False, 'error': 'Amount must be greater than zero.'}), 400
    if type_ not in ('income', 'expense'):
        return jsonify({'success': False, 'error': 'Invalid transaction type.'}), 400
    if not category_id:
        return jsonify({'success': False, 'error': 'Category is required.'}), 400
    if payment_method not in ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'):
        return jsonify({'success': False, 'error': 'Invalid payment method.'}), 400
    if not transaction_date:
        return jsonify({'success': False, 'error': 'Transaction date is required.'}), 400
        
    # Check if existing transaction is linked to a completed event
    conn = models.get_db_connection()
    tx = conn.execute("SELECT * FROM transactions WHERE id = ? AND user_id = ? AND is_deleted = 0", (tx_id, user_id)).fetchone()
    conn.close()
    if not tx:
        return jsonify({'success': False, 'error': 'Transaction not found.'}), 404
        
    if tx['event_id']:
        event = models.get_event_by_id(tx['event_id'], user_id)
        if event and event['status'] == 'Completed':
            return jsonify({'success': False, 'error': 'Cannot modify transaction of a completed event.'}), 400

    if event_id:
        event = models.get_event_by_id(event_id, user_id)
        if not event:
            return jsonify({'success': False, 'error': 'Event not found.'}), 400
        if event['status'] == 'Completed':
            return jsonify({'success': False, 'error': 'Cannot link transaction to a completed event.'}), 400

    updated = models.update_transaction(
        tx_id, user_id, amount, type_, category_id, note, payment_method, transaction_date, event_id
    )
    
    if updated:
        return jsonify({'success': True, 'message': 'Transaction updated.'})
    return jsonify({'success': False, 'error': 'Transaction not found or update failed.'}), 404

@app.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
@login_required
def delete_transaction_api(tx_id):
    user_id = session['user_id']
    
    conn = models.get_db_connection()
    tx = conn.execute("SELECT * FROM transactions WHERE id = ? AND user_id = ? AND is_deleted = 0", (tx_id, user_id)).fetchone()
    conn.close()
    if not tx:
        return jsonify({'success': False, 'error': 'Transaction not found.'}), 404
        
    if tx['event_id']:
        event = models.get_event_by_id(tx['event_id'], user_id)
        if event and event['status'] == 'Completed':
            return jsonify({'success': False, 'error': 'Cannot delete transaction of a completed event.'}), 400

    deleted = models.delete_transaction(tx_id, user_id)
    if deleted:
        return jsonify({'success': True, 'message': 'Transaction moved to Trash.'})
    return jsonify({'success': False, 'error': 'Transaction not found or delete failed.'}), 404

# --- CATEGORY API ENDPOINTS ---

@app.route('/api/categories', methods=['GET'])
@login_required
def get_categories_api():
    user_id = session['user_id']
    categories = models.get_categories_for_user(user_id)
    cat_list = []
    for cat in categories:
        cat_list.append({
            'id': cat['id'],
            'user_id': cat['user_id'],
            'name': cat['name'],
            'type': cat['type']
        })
    return jsonify({'success': True, 'data': cat_list})

@app.route('/api/categories', methods=['POST'])
@login_required
def create_category_api():
    user_id = session['user_id']
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    type_ = data.get('type')
    
    if not name:
        return jsonify({'success': False, 'error': 'Category name is required.'}), 400
    if type_ not in ('income', 'expense'):
        return jsonify({'success': False, 'error': 'Invalid category type.'}), 400
        
    cat_id = models.create_category(user_id, name, type_)
    if cat_id:
        return jsonify({'success': True, 'message': 'Category created.', 'id': cat_id}), 201
    return jsonify({'success': False, 'error': 'Failed to create category.'}), 500

# --- BUDGET API ENDPOINTS ---

@app.route('/api/budgets', methods=['GET'])
@login_required
def get_budgets_api():
    user_id = session['user_id']
    month = request.args.get('month')
    if not month:
        # Default to current month YYYY-MM
        month = datetime.now().strftime('%Y-%m')
        
    budgets = models.get_budgets(user_id, month)
    budget_list = []
    for b in budgets:
        planned = b['planned_amount']
        spent = b['spent_amount']
        remaining = planned - spent
        exceeded = max(0, spent - planned)
        
        # Determine status
        if spent > planned:
            status = 'Exceeded'
        elif spent >= 0.8 * planned:
            status = 'Near Limit'
        else:
            status = 'Safe'
            
        budget_list.append({
            'id': b['id'],
            'category_id': b['category_id'],
            'category_name': b['category_name'],
            'month': b['month'],
            'planned_amount': planned,
            'spent_amount': spent,
            'remaining_amount': remaining,
            'exceeded_amount': exceeded,
            'status': status
        })
    return jsonify({'success': True, 'data': budget_list})

@app.route('/api/budgets', methods=['POST'])
@login_required
def save_budget_api():
    user_id = session['user_id']
    data = request.get_json() or {}
    category_id = data.get('category_id')
    month = data.get('month')
    try:
        planned_amount = float(data.get('planned_amount', 0))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid planned amount.'}), 400
        
    if not category_id:
        return jsonify({'success': False, 'error': 'Category is required.'}), 400
    if not month or len(month) != 7: # YYYY-MM
        return jsonify({'success': False, 'error': 'Invalid month.'}), 400
    if planned_amount <= 0:
        return jsonify({'success': False, 'error': 'Planned amount must be greater than zero.'}), 400
        
    saved = models.create_or_update_budget(user_id, category_id, month, planned_amount)
    if saved:
        return jsonify({'success': True, 'message': 'Budget updated.'})
    return jsonify({'success': False, 'error': 'Failed to save budget.'}), 500

# --- DEBT & RECEIVABLE API ENDPOINTS ---

@app.route('/api/debts', methods=['GET'])
@login_required
def get_debts_api():
    user_id = session['user_id']
    debts = models.get_debts(user_id)
    debt_list = []
    today_str = datetime.now().strftime('%Y-%m-%d')
    for d in debts:
        status = d['status']
        if status == 'Active' and d['due_date'] < today_str:
            status = 'Overdue'
        debt_list.append({
            'id': d['id'],
            'person_name': d['person_name'],
            'type': d['type'],
            'total_amount': d['total_amount'],
            'pending_amount': d['pending_amount'],
            'due_date': d['due_date'],
            'status': status,
            'notes': d['notes'],
            'event_id': d['event_id']
        })
    return jsonify({'success': True, 'data': debt_list})

@app.route('/api/receivables', methods=['GET'])
@login_required
def get_receivables_api():
    user_id = session['user_id']
    conn = models.get_db_connection()
    receivables = conn.execute(
        "SELECT * FROM debts WHERE user_id = ? AND is_deleted = 0 AND type = 'receivable' ORDER BY due_date ASC",
        (user_id,)
    ).fetchall()
    conn.close()
    
    rec_list = []
    today_str = datetime.now().strftime('%Y-%m-%d')
    for r in receivables:
        status = r['status']
        if status == 'Active' and r['due_date'] < today_str:
            status = 'Overdue'
        rec_list.append({
            'id': r['id'],
            'person_name': r['person_name'],
            'type': r['type'],
            'total_amount': r['total_amount'],
            'pending_amount': r['pending_amount'],
            'due_date': r['due_date'],
            'status': status,
            'notes': r['notes'],
            'event_id': r['event_id']
        })
    return jsonify({'success': True, 'data': rec_list})

@app.route('/api/debts', methods=['POST'])
@login_required
def create_debt_api():
    user_id = session['user_id']
    data = request.get_json() or {}
    person_name = data.get('person_name', '').strip()
    
    # Backward compatibility: total_amount / pending_amount
    amount = data.get('amount')
    if amount is None:
        amount = data.get('total_amount')
        
    try:
        amount = float(amount or 0)
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid amount.'}), 400
        
    type_ = data.get('type')
    if not type_:
        notes_str = data.get('notes', '')
        if notes_str.startswith('[LENT]'):
            type_ = 'receivable'
        else:
            type_ = 'debt'
            
    due_date = data.get('due_date')
    notes = data.get('notes', '').strip()
    event_id = data.get('event_id')
    entry_date = data.get('entry_date', datetime.now().strftime('%Y-%m-%d'))
    
    if not person_name:
        return jsonify({'success': False, 'error': 'Person name is required.'}), 400
    if amount <= 0:
        return jsonify({'success': False, 'error': 'Amount must be greater than zero.'}), 400
    if not due_date:
        return jsonify({'success': False, 'error': 'Due date is required.'}), 400
    if type_ not in ('debt', 'receivable'):
        return jsonify({'success': False, 'error': 'Invalid type.'}), 400

    if event_id:
        event = models.get_event_by_id(event_id, user_id)
        if not event:
            return jsonify({'success': False, 'error': 'Event not found.'}), 400
        if event['status'] == 'Completed':
            return jsonify({'success': False, 'error': 'Cannot add debt to a completed event.'}), 400

    # Smart Merge Check
    conn = models.get_db_connection()
    existing = conn.execute(
        "SELECT * FROM debts WHERE user_id = ? AND person_name = ? AND type = ? AND is_deleted = 0",
        (user_id, person_name, type_)
    ).fetchone()
    
    if existing:
        debt_id = existing['id']
        # Update existing record: increase total_amount and pending_amount
        new_total = existing['total_amount'] + amount
        new_pending = existing['pending_amount'] + amount
        conn.execute(
            "UPDATE debts SET total_amount = ?, pending_amount = ?, due_date = ?, status = 'Active' WHERE id = ?",
            (new_total, new_pending, due_date, debt_id)
        )
    else:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO debts (user_id, person_name, type, total_amount, pending_amount, due_date, status, notes, event_id) VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?)",
            (user_id, person_name, type_, amount, amount, due_date, notes, event_id)
        )
        debt_id = cursor.lastrowid
        
    # Insert ledger entry
    ledger_type = 'borrowed' if type_ == 'debt' else 'lent'
    conn.execute(
        "INSERT INTO debt_ledger_entries (user_id, debt_id, type, amount, entry_date, notes, event_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, debt_id, ledger_type, amount, entry_date, notes, event_id)
    )
    conn.commit()
    conn.close()
    
    models.recalculate_debt_balances(debt_id)
    
    return jsonify({'success': True, 'message': 'Debt record saved.', 'id': debt_id}), 201

@app.route('/api/debts/<int:debt_id>', methods=['GET'])
@login_required
def get_debt_details_api(debt_id):
    user_id = session['user_id']
    conn = models.get_db_connection()
    debt = conn.execute('''
        SELECT d.*, e.name as event_name 
        FROM debts d 
        LEFT JOIN events e ON d.event_id = e.id 
        WHERE d.id = ? AND d.user_id = ? AND d.is_deleted = 0
    ''', (debt_id, user_id)).fetchone()
    
    if not debt:
        conn.close()
        return jsonify({'success': False, 'error': 'Debt record not found.'}), 404
        
    entries = conn.execute('''
        SELECT l.*, e.name as event_name 
        FROM debt_ledger_entries l 
        LEFT JOIN events e ON l.event_id = e.id 
        WHERE l.debt_id = ? AND l.is_deleted = 0 
        ORDER BY l.entry_date DESC, l.id DESC
    ''', (debt_id,)).fetchall()
    
    ledger_list = []
    total_borrowed_or_lent = 0.0
    total_repaid_or_received = 0.0
    for e in entries:
        ledger_list.append({
            'id': e['id'],
            'type': e['type'],
            'amount': e['amount'],
            'entry_date': e['entry_date'],
            'notes': e['notes'],
            'event_id': e['event_id'],
            'event_name': e['event_name']
        })
        if e['type'] in ('borrowed', 'lent'):
            total_borrowed_or_lent += e['amount']
        elif e['type'] in ('repaid', 'received'):
            total_repaid_or_received += e['amount']
            
    conn.close()
    
    data = {
        'id': debt['id'],
        'person_name': debt['person_name'],
        'type': debt['type'],
        'total_amount': total_borrowed_or_lent,
        'pending_amount': debt['pending_amount'],
        'total_repaid_or_received': total_repaid_or_received,
        'due_date': debt['due_date'],
        'status': debt['status'],
        'notes': debt['notes'],
        'event_id': debt['event_id'],
        'event_name': debt['event_name'],
        'ledger': ledger_list
    }
    
    return jsonify({'success': True, 'data': data})

@app.route('/api/debts/<int:debt_id>', methods=['PUT'])
@login_required
def update_debt_api(debt_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    person_name = data.get('person_name', '').strip()
    due_date = data.get('due_date')
    notes = data.get('notes', '').strip()
    
    if not person_name:
        return jsonify({'success': False, 'error': 'Person name is required.'}), 400
    if not due_date:
        return jsonify({'success': False, 'error': 'Due date is required.'}), 400
        
    conn = models.get_db_connection()
    debt = conn.execute("SELECT * FROM debts WHERE id = ? AND user_id = ? AND is_deleted = 0", (debt_id, user_id)).fetchone()
    if not debt:
        conn.close()
        return jsonify({'success': False, 'error': 'Debt record not found.'}), 404

    if debt['event_id']:
        event = models.get_event_by_id(debt['event_id'], user_id)
        if event and event['status'] == 'Completed':
            conn.close()
            return jsonify({'success': False, 'error': 'Cannot update debt associated with a completed event.'}), 400

    new_amount = data.get('amount')
    if new_amount is None:
        new_amount = data.get('total_amount')
        
    if new_amount is not None:
        try:
            new_amount = float(new_amount)
        except ValueError:
            conn.close()
            return jsonify({'success': False, 'error': 'Invalid amount.'}), 400
            
    new_pending = data.get('pending_amount')
    if new_pending is not None:
        try:
            new_pending = float(new_pending)
        except ValueError:
            conn.close()
            return jsonify({'success': False, 'error': 'Invalid pending amount.'}), 400
            
    conn.execute(
        "UPDATE debts SET person_name = ?, due_date = ?, notes = ? WHERE id = ?",
        (person_name, due_date, notes, debt_id)
    )
    
    if new_amount is not None and new_amount > 0:
        oldest_entry = conn.execute(
            "SELECT * FROM debt_ledger_entries WHERE debt_id = ? AND is_deleted = 0 ORDER BY id ASC LIMIT 1",
            (debt_id,)
        ).fetchone()
        if oldest_entry:
            conn.execute(
                "UPDATE debt_ledger_entries SET amount = ? WHERE id = ?",
                (new_amount, oldest_entry['id'])
            )
            
    if new_pending is not None:
        current_pending = debt['pending_amount']
        if new_pending != current_pending:
            if new_pending < current_pending:
                diff = current_pending - new_pending
                l_type = 'repaid' if debt['type'] == 'debt' else 'received'
                conn.execute(
                    "INSERT INTO debt_ledger_entries (user_id, debt_id, type, amount, entry_date, notes) VALUES (?, ?, ?, ?, ?, ?)",
                    (user_id, debt_id, l_type, diff, datetime.now().strftime('%Y-%m-%d'), "Payoff adjustment")
                )
            else:
                diff = new_pending - current_pending
                l_type = 'borrowed' if debt['type'] == 'debt' else 'lent'
                conn.execute(
                    "INSERT INTO debt_ledger_entries (user_id, debt_id, type, amount, entry_date, notes) VALUES (?, ?, ?, ?, ?, ?)",
                    (user_id, debt_id, l_type, diff, datetime.now().strftime('%Y-%m-%d'), "Adjustment")
                )
                
    conn.commit()
    conn.close()
    
    models.recalculate_debt_balances(debt_id)
    return jsonify({'success': True, 'message': 'Debt record updated.'})

@app.route('/api/debts/<int:debt_id>', methods=['DELETE'])
@login_required
def delete_debt_api(debt_id):
    user_id = session['user_id']
    
    conn = models.get_db_connection()
    debt = conn.execute("SELECT * FROM debts WHERE id = ? AND user_id = ? AND is_deleted = 0", (debt_id, user_id)).fetchone()
    conn.close()
    if not debt:
        return jsonify({'success': False, 'error': 'Debt record not found.'}), 404
        
    if debt['event_id']:
        event = models.get_event_by_id(debt['event_id'], user_id)
        if event and event['status'] == 'Completed':
            return jsonify({'success': False, 'error': 'Cannot delete debt associated with a completed event.'}), 400
            
    deleted = models.delete_debt(debt_id, user_id)
    if deleted:
        return jsonify({'success': True, 'message': 'Debt moved to Trash.'})
    return jsonify({'success': False, 'error': 'Debt not found or delete failed.'}), 404

# --- LEDGER ENTRY API ENDPOINTS ---

@app.route('/api/debts/<int:debt_id>/ledger', methods=['POST'])
@login_required
def create_ledger_entry_api(debt_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    type_ = data.get('type')
    try:
        amount = float(data.get('amount', 0))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid amount.'}), 400
    entry_date = data.get('entry_date', datetime.now().strftime('%Y-%m-%d'))
    notes = data.get('notes', '').strip()
    event_id = data.get('event_id')

    if amount <= 0:
        return jsonify({'success': False, 'error': 'Amount must be greater than zero.'}), 400
    if not type_ or not entry_date:
        return jsonify({'success': False, 'error': 'Type and date are required.'}), 400

    conn = models.get_db_connection()
    debt = conn.execute("SELECT * FROM debts WHERE id = ? AND user_id = ? AND is_deleted = 0", (debt_id, user_id)).fetchone()
    if not debt:
        conn.close()
        return jsonify({'success': False, 'error': 'Debt record not found.'}), 404

    event_to_check = event_id or debt['event_id']
    if event_to_check:
        event = models.get_event_by_id(event_to_check, user_id)
        if event and event['status'] == 'Completed':
            conn.close()
            return jsonify({'success': False, 'error': 'Event is completed and frozen.'}), 400

    if debt['type'] == 'debt' and type_ not in ('borrowed', 'repaid'):
        conn.close()
        return jsonify({'success': False, 'error': 'Invalid entry type for Debt.'}), 400
    if debt['type'] == 'receivable' and type_ not in ('lent', 'received'):
        conn.close()
        return jsonify({'success': False, 'error': 'Invalid entry type for Receivable.'}), 400

    conn.execute('''
        INSERT INTO debt_ledger_entries (user_id, debt_id, type, amount, entry_date, notes, event_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, debt_id, type_, amount, entry_date, notes, event_id))
    conn.commit()
    conn.close()

    models.recalculate_debt_balances(debt_id)
    return jsonify({'success': True, 'message': 'Ledger entry added.'}), 201

@app.route('/api/ledger-entries/<int:entry_id>', methods=['PUT'])
@login_required
def update_ledger_entry_api(entry_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    try:
        amount = float(data.get('amount', 0))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid amount.'}), 400
    entry_date = data.get('entry_date')
    notes = data.get('notes', '').strip()
    event_id = data.get('event_id')

    if amount <= 0 or not entry_date:
        return jsonify({'success': False, 'error': 'Invalid amount or date.'}), 400

    conn = models.get_db_connection()
    entry = conn.execute("SELECT * FROM debt_ledger_entries WHERE id = ? AND user_id = ? AND is_deleted = 0", (entry_id, user_id)).fetchone()
    if not entry:
        conn.close()
        return jsonify({'success': False, 'error': 'Ledger entry not found.'}), 404

    debt = conn.execute("SELECT * FROM debts WHERE id = ?", (entry['debt_id'],)).fetchone()
    if not debt:
        conn.close()
        return jsonify({'success': False, 'error': 'Parent debt record not found.'}), 404

    event_to_check = event_id or entry['event_id'] or debt['event_id']
    if event_to_check:
        event = models.get_event_by_id(event_to_check, user_id)
        if event and event['status'] == 'Completed':
            conn.close()
            return jsonify({'success': False, 'error': 'Event is completed and frozen.'}), 400

    conn.execute('''
        UPDATE debt_ledger_entries
        SET amount = ?, entry_date = ?, notes = ?, event_id = ?
        WHERE id = ?
    ''', (amount, entry_date, notes, event_id, entry_id))
    conn.commit()
    conn.close()

    models.recalculate_debt_balances(entry['debt_id'])
    return jsonify({'success': True, 'message': 'Ledger entry updated.'})

@app.route('/api/ledger-entries/<int:entry_id>', methods=['DELETE'])
@login_required
def delete_ledger_entry_api(entry_id):
    user_id = session['user_id']
    conn = models.get_db_connection()
    entry = conn.execute("SELECT * FROM debt_ledger_entries WHERE id = ? AND user_id = ? AND is_deleted = 0", (entry_id, user_id)).fetchone()
    if not entry:
        conn.close()
        return jsonify({'success': False, 'error': 'Ledger entry not found.'}), 404

    debt = conn.execute("SELECT * FROM debts WHERE id = ?", (entry['debt_id'],)).fetchone()
    if debt and debt['event_id']:
        event = models.get_event_by_id(debt['event_id'], user_id)
        if event and event['status'] == 'Completed':
            conn.close()
            return jsonify({'success': False, 'error': 'Event is completed and frozen.'}), 400

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute('''
        UPDATE debt_ledger_entries
        SET is_deleted = 1, deleted_at = ?
        WHERE id = ?
    ''', (now_str, entry_id))
    conn.commit()
    conn.close()

    models.recalculate_debt_balances(entry['debt_id'])
    return jsonify({'success': True, 'message': 'Ledger entry moved to Trash.'})

# --- TRASH SYSTEM API ENDPOINTS ---

@app.route('/api/trash', methods=['GET'])
@login_required
def get_trash_api():
    user_id = session['user_id']
    models.cleanup_trash(user_id)
    
    conn = models.get_db_connection()
    
    transactions = conn.execute('''
        SELECT t.*, c.name as category_name 
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.is_deleted = 1
        ORDER BY t.deleted_at DESC
    ''', (user_id,)).fetchall()
    
    tx_list = []
    for tx in transactions:
        tx_list.append({
            'id': tx['id'],
            'type': tx['type'],
            'amount': tx['amount'],
            'category_name': tx['category_name'],
            'note': tx['note'],
            'transaction_date': tx['transaction_date'],
            'deleted_at': tx['deleted_at']
        })
        
    debts = conn.execute('''
        SELECT * FROM debts
        WHERE user_id = ? AND is_deleted = 1
        ORDER BY deleted_at DESC
    ''', (user_id,)).fetchall()
    
    debt_list = []
    for d in debts:
        debt_list.append({
            'id': d['id'],
            'person_name': d['person_name'],
            'type': d['type'],
            'total_amount': d['total_amount'],
            'pending_amount': d['pending_amount'],
            'due_date': d['due_date'],
            'deleted_at': d['deleted_at']
        })
        
    events = conn.execute('''
        SELECT * FROM events
        WHERE user_id = ? AND is_deleted = 1
        ORDER BY deleted_at DESC
    ''', (user_id,)).fetchall()
    
    event_list = []
    for e in events:
        event_list.append({
            'id': e['id'],
            'name': e['name'],
            'description': e['description'],
            'status': e['status'],
            'deleted_at': e['deleted_at']
        })
        
    ledger_entries = conn.execute('''
        SELECT l.*, d.person_name, d.type as debt_type 
        FROM debt_ledger_entries l
        JOIN debts d ON l.debt_id = d.id
        WHERE l.user_id = ? AND l.is_deleted = 1
        ORDER BY l.deleted_at DESC
    ''', (user_id,)).fetchall()
    
    ledger_list = []
    for l in ledger_entries:
        ledger_list.append({
            'id': l['id'],
            'person_name': l['person_name'],
            'debt_type': l['debt_type'],
            'type': l['type'],
            'amount': l['amount'],
            'entry_date': l['entry_date'],
            'notes': l['notes'],
            'deleted_at': l['deleted_at']
        })
        
    conn.close()
    
    return jsonify({
        'success': True,
        'data': {
            'transactions': tx_list,
            'debts': debt_list,
            'events': event_list,
            'ledger_entries': ledger_list
        }
    })

@app.route('/api/trash/restore/<string:item_type>/<int:item_id>', methods=['POST'])
@login_required
def restore_trash_api(item_type, item_id):
    user_id = session['user_id']
    conn = models.get_db_connection()
    cursor = conn.cursor()
    
    restored = False
    parent_debt_id = None
    
    if item_type == 'transaction':
        cursor.execute("UPDATE transactions SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?", (item_id, user_id))
        restored = cursor.rowcount > 0
    elif item_type == 'debt':
        cursor.execute("UPDATE debts SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?", (item_id, user_id))
        restored = cursor.rowcount > 0
        if restored:
            parent_debt_id = item_id
    elif item_type == 'event':
        cursor.execute("UPDATE events SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?", (item_id, user_id))
        restored = cursor.rowcount > 0
    elif item_type == 'ledger_entry':
        cursor.execute("SELECT debt_id FROM debt_ledger_entries WHERE id = ? AND user_id = ?", (item_id, user_id))
        row = cursor.fetchone()
        if row:
            parent_debt_id = row['debt_id']
            cursor.execute("UPDATE debt_ledger_entries SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?", (item_id, user_id))
            restored = cursor.rowcount > 0
            
    conn.commit()
    conn.close()
    
    if restored:
        if parent_debt_id:
            models.recalculate_debt_balances(parent_debt_id)
        return jsonify({'success': True, 'message': 'Item restored successfully.'})
    return jsonify({'success': False, 'error': 'Item not found or restore failed.'}), 404

@app.route('/api/trash/permanent/<string:item_type>/<int:item_id>', methods=['DELETE'])
@login_required
def permanent_delete_trash_api(item_type, item_id):
    user_id = session['user_id']
    conn = models.get_db_connection()
    cursor = conn.cursor()
    
    deleted = False
    parent_debt_id = None
    
    if item_type == 'transaction':
        cursor.execute("DELETE FROM transactions WHERE id = ? AND user_id = ?", (item_id, user_id))
        deleted = cursor.rowcount > 0
    elif item_type == 'debt':
        cursor.execute("DELETE FROM debt_ledger_entries WHERE debt_id = ? AND user_id = ?", (item_id, user_id))
        cursor.execute("DELETE FROM debts WHERE id = ? AND user_id = ?", (item_id, user_id))
        deleted = cursor.rowcount > 0
    elif item_type == 'event':
        cursor.execute("UPDATE transactions SET event_id = NULL WHERE event_id = ? AND user_id = ?", (item_id, user_id))
        cursor.execute("UPDATE debts SET event_id = NULL WHERE event_id = ? AND user_id = ?", (item_id, user_id))
        cursor.execute("UPDATE debt_ledger_entries SET event_id = NULL WHERE event_id = ? AND user_id = ?", (item_id, user_id))
        cursor.execute("DELETE FROM events WHERE id = ? AND user_id = ?", (item_id, user_id))
        deleted = cursor.rowcount > 0
    elif item_type == 'ledger_entry':
        cursor.execute("SELECT debt_id FROM debt_ledger_entries WHERE id = ? AND user_id = ?", (item_id, user_id))
        row = cursor.fetchone()
        if row:
            parent_debt_id = row['debt_id']
            cursor.execute("DELETE FROM debt_ledger_entries WHERE id = ? AND user_id = ?", (item_id, user_id))
            deleted = cursor.rowcount > 0
            
    conn.commit()
    conn.close()
    
    if deleted:
        if parent_debt_id:
            models.recalculate_debt_balances(parent_debt_id)
        return jsonify({'success': True, 'message': 'Item permanently deleted.'})
    return jsonify({'success': False, 'error': 'Item not found or delete failed.'}), 404

# --- EVENT MODULE API ENDPOINTS ---

@app.route('/api/events', methods=['GET'])
@login_required
def get_events_api():
    user_id = session['user_id']
    conn = models.get_db_connection()
    events = conn.execute("SELECT * FROM events WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC", (user_id,)).fetchall()
    conn.close()
    
    event_list = []
    for e in events:
        event_list.append({
            'id': e['id'],
            'name': e['name'],
            'description': e['description'],
            'status': e['status'],
            'created_at': e['created_at']
        })
    return jsonify({'success': True, 'data': event_list})

@app.route('/api/events', methods=['POST'])
@login_required
def create_event_api():
    user_id = session['user_id']
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    
    if not name:
        return jsonify({'success': False, 'error': 'Event name is required.'}), 400
        
    conn = models.get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO events (user_id, name, description) VALUES (?, ?, ?)",
        (user_id, name, description)
    )
    conn.commit()
    event_id = cursor.lastrowid
    conn.close()
    
    if event_id:
        return jsonify({'success': True, 'message': 'Event created successfully.', 'id': event_id}), 201
    return jsonify({'success': False, 'error': 'Failed to create event.'}), 500

@app.route('/api/events/<int:event_id>', methods=['PUT'])
@login_required
def update_event_api(event_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    status = data.get('status')
    
    if not name:
        return jsonify({'success': False, 'error': 'Event name is required.'}), 400
        
    conn = models.get_db_connection()
    event = conn.execute("SELECT * FROM events WHERE id = ? AND user_id = ? AND is_deleted = 0", (event_id, user_id)).fetchone()
    if not event:
        conn.close()
        return jsonify({'success': False, 'error': 'Event not found.'}), 404
        
    conn.execute(
        "UPDATE events SET name = ?, description = ?, status = ? WHERE id = ?",
        (name, description, status or event['status'], event_id)
    )
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Event updated.'})

@app.route('/api/events/<int:event_id>', methods=['DELETE'])
@login_required
def delete_event_api(event_id):
    user_id = session['user_id']
    conn = models.get_db_connection()
    event = conn.execute("SELECT * FROM events WHERE id = ? AND user_id = ? AND is_deleted = 0", (event_id, user_id)).fetchone()
    if not event:
        conn.close()
        return jsonify({'success': False, 'error': 'Event not found.'}), 404
        
    if event['status'] == 'Completed':
        conn.close()
        return jsonify({'success': False, 'error': 'Cannot delete a completed event.'}), 400
        
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("UPDATE events SET is_deleted = 1, deleted_at = ? WHERE id = ?", (now_str, event_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Event moved to Trash.'})

@app.route('/api/events/<int:event_id>/complete', methods=['POST'])
@login_required
def complete_event_api(event_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    status = data.get('status', 'Completed')
    
    if status not in ('Active', 'Completed'):
        return jsonify({'success': False, 'error': 'Invalid status.'}), 400
        
    conn = models.get_db_connection()
    event = conn.execute("SELECT * FROM events WHERE id = ? AND user_id = ? AND is_deleted = 0", (event_id, user_id)).fetchone()
    if not event:
        conn.close()
        return jsonify({'success': False, 'error': 'Event not found.'}), 404
        
    conn.execute("UPDATE events SET status = ? WHERE id = ?", (status, event_id))
    conn.commit()
    conn.close()
    
    action_str = "frozen" if status == "Completed" else "reopened"
    return jsonify({'success': True, 'message': f'Event successfully {action_str}.'})

@app.route('/api/events/<int:event_id>/details', methods=['GET'])
@login_required
def get_event_details_api(event_id):
    user_id = session['user_id']
    conn = models.get_db_connection()
    
    event = conn.execute("SELECT * FROM events WHERE id = ? AND user_id = ? AND is_deleted = 0", (event_id, user_id)).fetchone()
    if not event:
        conn.close()
        return jsonify({'success': False, 'error': 'Event not found.'}), 404
        
    transactions = conn.execute('''
        SELECT t.*, c.name as category_name 
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.event_id = ? AND t.is_deleted = 0
        ORDER BY t.transaction_date DESC, t.id DESC
    ''', (user_id, event_id)).fetchall()
    
    tx_list = []
    total_received = 0.0
    total_spent = 0.0
    
    for tx in transactions:
        tx_list.append({
            'id': tx['id'],
            'amount': tx['amount'],
            'type': tx['type'],
            'category_name': tx['category_name'],
            'note': tx['note'],
            'payment_method': tx['payment_method'],
            'transaction_date': tx['transaction_date']
        })
        if tx['type'] == 'income':
            total_received += tx['amount']
        else:
            total_spent += tx['amount']
            
    # Fetch debts associated with the event
    event_debts = conn.execute('''
        SELECT * FROM debts 
        WHERE user_id = ? AND event_id = ? AND is_deleted = 0
    ''', (user_id, event_id)).fetchall()
    
    debt_list = []
    total_debts_pending = 0.0
    for d in event_debts:
        debt_list.append({
            'id': d['id'],
            'person_name': d['person_name'],
            'type': d['type'],
            'total_amount': d['total_amount'],
            'pending_amount': d['pending_amount'],
            'status': d['status'],
            'due_date': d['due_date']
        })
        if d['type'] == 'debt':
            total_debts_pending += d['pending_amount']
        else:
            total_debts_pending -= d['pending_amount']

    cat_breakdown = conn.execute('''
        SELECT c.name as category_name, SUM(t.amount) as total_amount
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.event_id = ? AND t.type = 'expense' AND t.is_deleted = 0
        GROUP BY c.name
    ''', (user_id, event_id)).fetchall()
    
    breakdown_dict = {}
    for cb in cat_breakdown:
        breakdown_dict[cb['category_name']] = cb['total_amount']
        
    conn.close()
    
    return jsonify({
        'success': True,
        'data': {
            'event': {
                'id': event['id'],
                'name': event['name'],
                'description': event['description'],
                'status': event['status'],
                'created_at': event['created_at']
            },
            'stats': {
                'total_received': total_received,
                'total_spent': total_spent,
                'remaining_balance': total_received - total_spent,
                'total_debts_pending': total_debts_pending
            },
            'category_breakdown': breakdown_dict,
            'transactions': tx_list,
            'debts': debt_list
        }
    })

# --- MONTHLY ROLLOVER / HISTORICAL REPORT API ---

@app.route('/api/rollover', methods=['POST'])
@login_required
def rollover_month():
    user_id = session['user_id']
    data = request.get_json() or {}
    month = data.get('month') # YYYY-MM
    
    if not month or len(month) != 7:
        return jsonify({'success': False, 'error': 'Invalid month format.'}), 400
        
    conn = models.get_db_connection()
    income_row = conn.execute(
        "SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'income' AND strftime('%Y-%m', transaction_date) = ? AND is_deleted = 0",
        (user_id, month)
    ).fetchone()
    total_income = income_row[0] or 0.0
    
    expense_row = conn.execute(
        "SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', transaction_date) = ? AND is_deleted = 0",
        (user_id, month)
    ).fetchone()
    total_expense = expense_row[0] or 0.0
    
    conn.close()
    
    savings = total_income - total_expense
    
    saved = models.save_monthly_summary(user_id, month, total_income, total_expense, savings)
    if saved:
        return jsonify({
            'success': True, 
            'message': f'Rollover completed for {month}.',
            'summary': {
                'month': month,
                'total_income': total_income,
                'total_expense': total_expense,
                'savings': savings
            }
        })
    return jsonify({'success': False, 'error': 'Rollover failed.'}), 500

@app.route('/api/monthly-summaries', methods=['GET'])
@login_required
def get_monthly_summaries_api():
    user_id = session['user_id']
    summaries = models.get_monthly_summaries(user_id)
    summary_list = []
    for s in summaries:
        summary_list.append({
            'id': s['id'],
            'month': s['month'],
            'total_income': s['total_income'],
            'total_expense': s['total_expense'],
            'savings': s['savings']
        })
    return jsonify({'success': True, 'data': summary_list})

# --- HIDDEN ADMIN API ENDPOINTS ---

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_get_users():
    users = models.get_all_users()
    user_list = []
    
    conn = models.get_db_connection()
    
    for u in users:
        u_id = u['id']
        tx_count = conn.execute('SELECT COUNT(*) FROM transactions WHERE user_id = ? AND is_deleted = 0', (u_id,)).fetchone()[0]
        debt_count = conn.execute('SELECT COUNT(*) FROM debts WHERE user_id = ? AND is_deleted = 0', (u_id,)).fetchone()[0]
        budget_count = conn.execute('SELECT COUNT(*) FROM budget_plans WHERE user_id = ?', (u_id,)).fetchone()[0]
        
        user_list.append({
            'id': u_id,
            'username': u['username'],
            'email': u['email'],
            'mobile': u['mobile'],
            'role': u['role'],
            'created_at': u['created_at'],
            'stats': {
                'transactions': tx_count,
                'debts': debt_count,
                'budgets': budget_count
            }
        })
    conn.close()
    return jsonify({'success': True, 'data': user_list})

@app.route('/api/admin/users/<int:u_id>', methods=['GET'])
@admin_required
def admin_get_user_details(u_id):
    user = models.get_user_by_id(u_id)
    if not user:
        return jsonify({'success': False, 'error': 'User not found.'}), 404
        
    conn = models.get_db_connection()
    tx_count = conn.execute('SELECT COUNT(*) FROM transactions WHERE user_id = ? AND is_deleted = 0', (u_id,)).fetchone()[0]
    total_spent = conn.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'expense' AND is_deleted = 0", (u_id,)).fetchone()[0] or 0.0
    total_income = conn.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'income' AND is_deleted = 0", (u_id,)).fetchone()[0] or 0.0
    
    recent_transactions = conn.execute('''
        SELECT t.*, c.name as category_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ? AND t.is_deleted = 0
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT 10
    ''', (u_id,)).fetchall()
    
    conn.close()
    
    tx_list = []
    for tx in recent_transactions:
        tx_list.append({
            'id': tx['id'],
            'amount': tx['amount'],
            'type': tx['type'],
            'category_name': tx['category_name'],
            'note': tx['note'],
            'payment_method': tx['payment_method'],
            'transaction_date': tx['transaction_date']
        })
        
    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'mobile': user['mobile'],
            'role': user['role'],
            'created_at': user['created_at']
        },
        'stats': {
            'transaction_count': tx_count,
            'total_income': total_income,
            'total_spent': total_spent,
            'savings': total_income - total_spent
        },
        'recent_transactions': tx_list
    })

@app.route('/api/admin/users/<int:u_id>', methods=['PUT'])
@admin_required
def admin_update_user(u_id):
    data = request.get_json() or {}
    new_role = data.get('role')
    
    if new_role not in ('user', 'admin'):
        return jsonify({'success': False, 'error': 'Invalid role.'}), 400
        
    if u_id == session['user_id'] and new_role == 'user':
        return jsonify({'success': False, 'error': 'You cannot demote yourself from admin.'}), 400
        
    conn = models.get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, u_id))
    conn.commit()
    rows = cursor.rowcount
    conn.close()
    
    if rows > 0:
        return jsonify({'success': True, 'message': 'User role updated successfully.'})
    return jsonify({'success': False, 'error': 'User not found.'}), 404

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
