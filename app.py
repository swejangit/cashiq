import os
from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import sqlite3
from datetime import datetime

import models

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
            'transaction_date': tx['transaction_date']
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
        
    tx_id = models.create_transaction(
        user_id, amount, type_, category_id, note, payment_method, transaction_date
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
        
    updated = models.update_transaction(
        tx_id, user_id, amount, type_, category_id, note, payment_method, transaction_date
    )
    
    if updated:
        return jsonify({'success': True, 'message': 'Transaction updated.'})
    return jsonify({'success': False, 'error': 'Transaction not found or update failed.'}), 404

@app.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
@login_required
def delete_transaction_api(tx_id):
    user_id = session['user_id']
    deleted = models.delete_transaction(tx_id, user_id)
    if deleted:
        return jsonify({'success': True, 'message': 'Transaction deleted.'})
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

# --- DEBT API ENDPOINTS ---

@app.route('/api/debts', methods=['GET'])
@login_required
def get_debts_api():
    user_id = session['user_id']
    debts = models.get_debts(user_id)
    debt_list = []
    
    # Check for overdue status dynamically based on current date
    today_str = datetime.now().strftime('%Y-%m-%d')
    
    for d in debts:
        status = d['status']
        if status == 'Active' and d['due_date'] < today_str:
            status = 'Overdue'
            
        debt_list.append({
            'id': d['id'],
            'person_name': d['person_name'],
            'total_amount': d['total_amount'],
            'pending_amount': d['pending_amount'],
            'due_date': d['due_date'],
            'status': status,
            'notes': d['notes']
        })
    return jsonify({'success': True, 'data': debt_list})

@app.route('/api/debts', methods=['POST'])
@login_required
def create_debt_api():
    user_id = session['user_id']
    data = request.get_json() or {}
    person_name = data.get('person_name', '').strip()
    try:
        total_amount = float(data.get('total_amount', 0))
        pending_amount = float(data.get('pending_amount', total_amount))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid amounts.'}), 400
        
    due_date = data.get('due_date')
    status = data.get('status', 'Active')
    notes = data.get('notes', '').strip()
    
    if not person_name:
        return jsonify({'success': False, 'error': 'Person name is required.'}), 400
    if total_amount <= 0:
        return jsonify({'success': False, 'error': 'Total amount must be greater than zero.'}), 400
    if pending_amount < 0 or pending_amount > total_amount:
        return jsonify({'success': False, 'error': 'Pending amount must be between 0 and total amount.'}), 400
    if not due_date:
        return jsonify({'success': False, 'error': 'Due date is required.'}), 400
    if status not in ('Active', 'Paid', 'Overdue'):
        return jsonify({'success': False, 'error': 'Invalid status.'}), 400
        
    debt_id = models.create_debt(user_id, person_name, total_amount, pending_amount, due_date, status, notes)
    if debt_id:
        return jsonify({'success': True, 'message': 'Debt added.', 'id': debt_id}), 201
    return jsonify({'success': False, 'error': 'Failed to add debt.'}), 500

@app.route('/api/debts/<int:debt_id>', methods=['PUT'])
@login_required
def update_debt_api(debt_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    person_name = data.get('person_name', '').strip()
    try:
        total_amount = float(data.get('total_amount', 0))
        pending_amount = float(data.get('pending_amount', 0))
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid amounts.'}), 400
        
    due_date = data.get('due_date')
    status = data.get('status')
    notes = data.get('notes', '').strip()
    
    if not person_name:
        return jsonify({'success': False, 'error': 'Person name is required.'}), 400
    if total_amount <= 0:
        return jsonify({'success': False, 'error': 'Total amount must be greater than zero.'}), 400
    if pending_amount < 0 or pending_amount > total_amount:
        return jsonify({'success': False, 'error': 'Pending amount must be between 0 and total amount.'}), 400
    if not due_date:
        return jsonify({'success': False, 'error': 'Due date is required.'}), 400
    if status not in ('Active', 'Paid', 'Overdue'):
        return jsonify({'success': False, 'error': 'Invalid status.'}), 400
        
    # If pending amount is 0, auto-set status to 'Paid'
    if pending_amount == 0:
        status = 'Paid'
        
    updated = models.update_debt(debt_id, user_id, person_name, total_amount, pending_amount, due_date, status, notes)
    if updated:
        return jsonify({'success': True, 'message': 'Debt updated.'})
    return jsonify({'success': False, 'error': 'Debt not found or update failed.'}), 404

@app.route('/api/debts/<int:debt_id>', methods=['DELETE'])
@login_required
def delete_debt_api(debt_id):
    user_id = session['user_id']
    deleted = models.delete_debt(debt_id, user_id)
    if deleted:
        return jsonify({'success': True, 'message': 'Debt deleted.'})
    return jsonify({'success': False, 'error': 'Debt not found or delete failed.'}), 404

# --- MONTHLY ROLLOVER / HISTORICAL REPORT API ---

@app.route('/api/rollover', methods=['POST'])
@login_required
def rollover_month():
    user_id = session['user_id']
    data = request.get_json() or {}
    month = data.get('month') # YYYY-MM
    
    if not month or len(month) != 7:
        return jsonify({'success': False, 'error': 'Invalid month format.'}), 400
        
    # Calculate totals for this month
    conn = models.get_db_connection()
    # Income sum
    income_row = conn.execute(
        "SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'income' AND strftime('%Y-%m', transaction_date) = ?",
        (user_id, month)
    ).fetchone()
    total_income = income_row[0] or 0.0
    
    # Expense sum
    expense_row = conn.execute(
        "SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', transaction_date) = ?",
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
    
    # Calculate transaction count for each user
    conn = models.get_db_connection()
    
    for u in users:
        u_id = u['id']
        tx_count = conn.execute('SELECT COUNT(*) FROM transactions WHERE user_id = ?', (u_id,)).fetchone()[0]
        debt_count = conn.execute('SELECT COUNT(*) FROM debts WHERE user_id = ?', (u_id,)).fetchone()[0]
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
    # Get user statistics
    tx_count = conn.execute('SELECT COUNT(*) FROM transactions WHERE user_id = ?', (u_id,)).fetchone()[0]
    total_spent = conn.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'expense'", (u_id,)).fetchone()[0] or 0.0
    total_income = conn.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'income'", (u_id,)).fetchone()[0] or 0.0
    
    recent_transactions = conn.execute('''
        SELECT t.*, c.name as category_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?
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
        
    # Prevent admin from demoting themselves (failsafe)
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
    # Run locally on port 5000
    app.run(debug=True, host='0.0.0.0', port=5000)
