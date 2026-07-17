import unittest
import os
import tempfile
import json
import sqlite3
from datetime import datetime

# Override DB path for models BEFORE importing app
import models
models.DB_PATH = os.path.join(tempfile.gettempdir(), 'test_cashiq.db')

# Clear testing database if it exists
if os.path.exists(models.DB_PATH):
    os.remove(models.DB_PATH)

from app import app
import db_init

class CashiqTestCase(unittest.TestCase):

    def setUp(self):
        # Initialize and seed database
        db_init.seed_db()
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test_secret_key'
        self.client = app.test_client()
        
    def tearDown(self):
        # Clean up database file
        if os.path.exists(models.DB_PATH):
            try:
                os.remove(models.DB_PATH)
            except PermissionError:
                pass

    def register(self, username, email, mobile, password):
        return self.client.post('/api/signup', json={
            'username': username,
            'email': email,
            'mobile': mobile,
            'password': password
        })

    def login(self, username, password):
        return self.client.post('/api/login', json={
            'username': username,
            'password': password
        })

    def logout(self):
        return self.client.post('/api/logout')

    # 1. Test Auth System
    def test_auth_flow(self):
        # Try invalid signup (missing fields)
        res = self.register('', '', '', '')
        self.assertEqual(res.status_code, 400)
        
        # Successful Signup
        res = self.register('alice', 'alice@test.com', '1234567890', 'password123')
        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        
        # Duplicate signup (Username)
        res = self.register('alice', 'alice2@test.com', '1234567890', 'password123')
        self.assertEqual(res.status_code, 400)
        
        # Duplicate signup (Email)
        res = self.register('alice2', 'alice@test.com', '1234567890', 'password123')
        self.assertEqual(res.status_code, 400)
        
        # Try login with wrong password
        res = self.login('alice', 'wrongpass')
        self.assertEqual(res.status_code, 401)
        
        # Successful login
        res = self.login('alice', 'password123')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['username'], 'alice')
        self.assertEqual(data['user']['role'], 'user')

        # Test session check
        res = self.client.get('/api/session')
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['username'], 'alice')
        
        # Logout
        res = self.logout()
        self.assertEqual(res.status_code, 200)
        
        # Session check after logout
        res = self.client.get('/api/session')
        data = json.loads(res.data)
        self.assertFalse(data['success'])

    # 2. Test Transaction Operations
    def test_transaction_api(self):
        # Signup and Login
        self.register('bob', 'bob@test.com', '9876543210', 'password123')
        self.login('bob', 'password123')
        
        # Get Categories
        res = self.client.get('/api/categories')
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        categories = data['data']
        self.assertGreater(len(categories), 0)
        
        # Find an expense and an income category
        expense_cat = next(c for c in categories if c['type'] == 'expense')
        income_cat = next(c for c in categories if c['type'] == 'income')
        
        # Log Expense
        res = self.client.post('/api/transactions', json={
            'amount': 250.50,
            'type': 'expense',
            'category_id': expense_cat['id'],
            'note': 'Grocery Store',
            'payment_method': 'UPI',
            'transaction_date': '2026-06-01'
        })
        self.assertEqual(res.status_code, 201)
        tx_id = json.loads(res.data)['id']

        # Log Income
        self.client.post('/api/transactions', json={
            'amount': 5000,
            'type': 'income',
            'category_id': income_cat['id'],
            'note': 'Consulting work',
            'payment_method': 'Bank Transfer',
            'transaction_date': '2026-06-02'
        })

        # List all transactions
        res = self.client.get('/api/transactions')
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(len(data['data']), 2)
        
        # Verify expense details
        expense_tx = next(t for t in data['data'] if t['id'] == tx_id)
        self.assertEqual(expense_tx['amount'], 250.50)
        self.assertEqual(expense_tx['category_name'], expense_cat['name'])
        
        # Update Transaction
        res = self.client.put(f'/api/transactions/{tx_id}', json={
            'amount': 300.00,
            'type': 'expense',
            'category_id': expense_cat['id'],
            'note': 'Grocery Store (Updated)',
            'payment_method': 'Card',
            'transaction_date': '2026-06-01'
        })
        self.assertEqual(res.status_code, 200)

        # Check update reflected
        res = self.client.get('/api/transactions')
        data = json.loads(res.data)
        expense_tx = next(t for t in data['data'] if t['id'] == tx_id)
        self.assertEqual(expense_tx['amount'], 300.00)
        self.assertEqual(expense_tx['payment_method'], 'Card')
        self.assertEqual(expense_tx['note'], 'Grocery Store (Updated)')

        # Delete Transaction
        res = self.client.delete(f'/api/transactions/{tx_id}')
        self.assertEqual(res.status_code, 200)
        
        # Check deleted
        res = self.client.get('/api/transactions')
        data = json.loads(res.data)
        self.assertEqual(len(data['data']), 1)

    # 3. Test Budget Logic
    def test_budget_logic(self):
        # Setup session
        self.register('charlie', 'charlie@test.com', '1234567890', 'password123')
        self.login('charlie', 'password123')
        
        res = self.client.get('/api/categories')
        categories = json.loads(res.data)['data']
        entertainment_cat = next(c for c in categories if c['name'] == 'Entertainment')
        
        # Configure Budget: planned 1000 for June 2026
        res = self.client.post('/api/budgets', json={
            'category_id': entertainment_cat['id'],
            'month': '2026-06',
            'planned_amount': 1000.00
        })
        self.assertEqual(res.status_code, 200)
        
        # Check budgets list for June (should be Safe, spent 0)
        res = self.client.get('/api/budgets?month=2026-06')
        budgets = json.loads(res.data)['data']
        ent_budget = next(b for b in budgets if b['category_id'] == entertainment_cat['id'])
        self.assertEqual(ent_budget['planned_amount'], 1000.00)
        self.assertEqual(ent_budget['spent_amount'], 0.00)
        self.assertEqual(ent_budget['status'], 'Safe')
        
        # Log transaction of ₹300 (Within budget)
        self.client.post('/api/transactions', json={
            'amount': 300.00,
            'type': 'expense',
            'category_id': entertainment_cat['id'],
            'note': 'Movie Ticket',
            'payment_method': 'UPI',
            'transaction_date': '2026-06-05'
        })
        
        # Check budgets list (should be Safe, spent 300)
        res = self.client.get('/api/budgets?month=2026-06')
        budgets = json.loads(res.data)['data']
        ent_budget = next(b for b in budgets if b['category_id'] == entertainment_cat['id'])
        self.assertEqual(ent_budget['spent_amount'], 300.00)
        self.assertEqual(ent_budget['remaining_amount'], 700.00)
        self.assertEqual(ent_budget['status'], 'Safe')

        # Log transaction of ₹550 (Total spent: ₹850, Near Limit >= 80% of 1000)
        self.client.post('/api/transactions', json={
            'amount': 550.00,
            'type': 'expense',
            'category_id': entertainment_cat['id'],
            'note': 'Concert',
            'payment_method': 'UPI',
            'transaction_date': '2026-06-10'
        })
        
        # Check budgets list (should be Near Limit, spent 850)
        res = self.client.get('/api/budgets?month=2026-06')
        budgets = json.loads(res.data)['data']
        ent_budget = next(b for b in budgets if b['category_id'] == entertainment_cat['id'])
        self.assertEqual(ent_budget['spent_amount'], 850.00)
        self.assertEqual(ent_budget['status'], 'Near Limit')

        # Log transaction of ₹350 (Total spent: ₹1200, Exceeded)
        self.client.post('/api/transactions', json={
            'amount': 350.00,
            'type': 'expense',
            'category_id': entertainment_cat['id'],
            'note': 'Gaming Store',
            'payment_method': 'Card',
            'transaction_date': '2026-06-15'
        })
        
        # Check budgets list (should be Exceeded, spent 1200)
        res = self.client.get('/api/budgets?month=2026-06')
        budgets = json.loads(res.data)['data']
        ent_budget = next(b for b in budgets if b['category_id'] == entertainment_cat['id'])
        self.assertEqual(ent_budget['spent_amount'], 1200.00)
        self.assertEqual(ent_budget['exceeded_amount'], 200.00)
        self.assertEqual(ent_budget['status'], 'Exceeded')

    # 4. Test Debt System
    def test_debt_system(self):
        # Setup session
        self.register('dave', 'dave@test.com', '1234567890', 'password123')
        self.login('dave', 'password123')
        
        # Add Debt
        res = self.client.post('/api/debts', json={
            'person_name': 'Frank Miller',
            'total_amount': 3000.00,
            'pending_amount': 3000.00,
            'due_date': '2036-07-01',
            'status': 'Active',
            'notes': '[BORROWED] Concert tickets'
        })
        self.assertEqual(res.status_code, 201)
        debt_id = json.loads(res.data)['id']

        # Get Debts list
        res = self.client.get('/api/debts')
        data = json.loads(res.data)['data']
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['person_name'], 'Frank Miller')
        self.assertEqual(data[0]['status'], 'Active')

        # Pay off part of debt
        res = self.client.put(f'/api/debts/{debt_id}', json={
            'person_name': 'Frank Miller',
            'total_amount': 3000.00,
            'pending_amount': 1000.00,
            'due_date': '2036-07-01',
            'status': 'Active',
            'notes': '[BORROWED] Concert tickets (Paid part)'
        })
        self.assertEqual(res.status_code, 200)
        
        # Check remaining
        res = self.client.get('/api/debts')
        debt = json.loads(res.data)['data'][0]
        self.assertEqual(debt['pending_amount'], 1000.00)
        self.assertEqual(debt['status'], 'Active')

        # Pay off fully
        res = self.client.put(f'/api/debts/{debt_id}', json={
            'person_name': 'Frank Miller',
            'total_amount': 3000.00,
            'pending_amount': 0.00,
            'due_date': '2036-07-01',
            'status': 'Active', # The API should auto-set to 'Paid' when pending is 0
            'notes': '[BORROWED] Concert tickets (Fully paid)'
        })
        self.assertEqual(res.status_code, 200)

        # Check status updated to Paid
        res = self.client.get('/api/debts')
        debt = json.loads(res.data)['data'][0]
        self.assertEqual(debt['pending_amount'], 0.00)
        self.assertEqual(debt['status'], 'Paid')

    # 5. Test Monthly Rollover
    def test_monthly_rollover(self):
        # Setup session
        self.register('eve', 'eve@test.com', '1234567890', 'password123')
        self.login('eve', 'password123')
        
        res = self.client.get('/api/categories')
        categories = json.loads(res.data)['data']
        salary_cat = next(c for c in categories if c['name'] == 'Salary')
        rent_cat = next(c for c in categories if c['name'] == 'Rent & Housing')
        
        # Log income and expense in May 2026
        self.client.post('/api/transactions', json={
            'amount': 15000,
            'type': 'income',
            'category_id': salary_cat['id'],
            'note': 'Salary May',
            'payment_method': 'Bank Transfer',
            'transaction_date': '2026-05-31'
        })
        self.client.post('/api/transactions', json={
            'amount': 4500,
            'type': 'expense',
            'category_id': rent_cat['id'],
            'note': 'Rent May',
            'payment_method': 'Bank Transfer',
            'transaction_date': '2026-05-31'
        })

        # Trigger Rollover for May 2026
        res = self.client.post('/api/rollover', json={'month': '2026-05'})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['summary']['total_income'], 15000.0)
        self.assertEqual(data['summary']['total_expense'], 4500.0)
        self.assertEqual(data['summary']['savings'], 10500.0)

        # Check archived snapshots
        res = self.client.get('/api/monthly-summaries')
        data = json.loads(res.data)['data']
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['month'], '2026-05')
        self.assertEqual(data[0]['savings'], 10500.0)

    # 6. Test Hidden Admin Protection & Console
    def test_hidden_admin(self):
        # Standard user login
        self.register('george', 'george@test.com', '1234567890', 'password123')
        self.login('george', 'password123')
        
        # Accessing admin users should get 403 Forbidden
        res = self.client.get('/api/admin/users')
        self.assertEqual(res.status_code, 403)
        
        # Accessing specific user detail should get 403 Forbidden
        res = self.client.get('/api/admin/users/1')
        self.assertEqual(res.status_code, 403)
        
        # Logout
        self.logout()
        
        # Admin login (pre-seeded admin/adminpass)
        res = self.login('admin', 'adminpass')
        self.assertEqual(res.status_code, 200)
        
        # Access admin users (Success)
        res = self.client.get('/api/admin/users')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)['data']
        self.assertGreaterEqual(len(data), 2) # Admin and george
        
        # Find george's user entry
        george_user = next(u for u in data if u['username'] == 'george')
        
        # Fetch detailed user profile
        res = self.client.get(f"/api/admin/users/{george_user['id']}")
        self.assertEqual(res.status_code, 200)
        user_detail = json.loads(res.data)
        self.assertTrue(user_detail['success'])
        self.assertEqual(user_detail['user']['username'], 'george')

    # 7. Test PFMS Extensions (Step 5)
    def test_pfms_extensions(self):
        # Setup session
        self.register('extension_user', 'ext@test.com', '1234567890', 'password123')
        self.login('extension_user', 'password123')

        # Test Event creation
        res = self.client.post('/api/events', json={
            'name': 'Summer Trip',
            'description': 'Trip with high school friends'
        })
        self.assertEqual(res.status_code, 201)
        event_id = json.loads(res.data)['id']

        # Get Event details
        res = self.client.get(f'/api/events/{event_id}/details')
        self.assertEqual(res.status_code, 200)
        details = json.loads(res.data)['data']
        self.assertEqual(details['event']['name'], 'Summer Trip')
        self.assertEqual(details['stats']['total_spent'], 0)

        # Create a transaction linked to the event
        res = self.client.get('/api/categories')
        categories = json.loads(res.data)['data']
        food_cat = next(c for c in categories if c['name'] == 'Food & Dining')
        
        res = self.client.post('/api/transactions', json={
            'amount': 800.00,
            'type': 'expense',
            'category_id': food_cat['id'],
            'note': 'Dinner at Highway Inn',
            'payment_method': 'UPI',
            'transaction_date': '2026-06-20',
            'event_id': event_id
        })
        self.assertEqual(res.status_code, 201)

        # Create a debt (smart-merge test 1)
        res = self.client.post('/api/debts', json={
            'person_name': 'John Doe',
            'total_amount': 2000.00,
            'due_date': '2026-07-15',
            'notes': '[BORROWED] For hotel booking',
            'type': 'debt',
            'event_id': event_id
        })
        self.assertEqual(res.status_code, 201)
        debt_id = json.loads(res.data)['id']

        # Create another debt for same person (smart-merge merge test)
        res = self.client.post('/api/debts', json={
            'person_name': 'John Doe',
            'total_amount': 1500.00,
            'due_date': '2026-07-18',
            'notes': '[BORROWED] For taxi fare',
            'type': 'debt',
            'event_id': event_id
        })
        self.assertEqual(res.status_code, 201)
        # Should be same ID
        self.assertEqual(json.loads(res.data)['id'], debt_id)

        # Fetch ledger list
        res = self.client.get(f'/api/debts/{debt_id}')
        self.assertEqual(res.status_code, 200)
        debt_details = json.loads(res.data)['data']
        self.assertEqual(len(debt_details['ledger']), 2)
        self.assertEqual(debt_details['total_amount'], 3500.00)
        self.assertEqual(debt_details['pending_amount'], 3500.00)

        # Log repayment inside ledger
        res = self.client.post(f'/api/debts/{debt_id}/ledger', json={
            'type': 'repaid',
            'amount': 1000.00,
            'entry_date': '2026-06-21',
            'notes': 'Paid back half of taxi'
        })
        self.assertEqual(res.status_code, 201)

        # Verify balance updated
        res = self.client.get(f'/api/debts/{debt_id}')
        debt_details = json.loads(res.data)['data']
        self.assertEqual(debt_details['pending_amount'], 2500.00)

        # Test Trash bin logic (Soft Delete)
        txs = self.client.get('/api/transactions').get_json()['data']
        tx_id = txs[0]['id']

        # Soft delete transaction
        res = self.client.delete(f'/api/transactions/{tx_id}')
        self.assertEqual(res.status_code, 200)

        # Check not returned in transactions list
        txs_after = self.client.get('/api/transactions').get_json()['data']
        self.assertEqual(len(txs_after), 0)

        # Check present in Trash
        res = self.client.get('/api/trash')
        self.assertEqual(res.status_code, 200)
        trash_data = json.loads(res.data)['data']
        self.assertEqual(len(trash_data['transactions']), 1)
        self.assertEqual(trash_data['transactions'][0]['id'], tx_id)

        # Restore from Trash
        res = self.client.post(f'/api/trash/restore/transaction/{tx_id}')
        self.assertEqual(res.status_code, 200)

        # Check restored back
        txs_restored = self.client.get('/api/transactions').get_json()['data']
        self.assertEqual(len(txs_restored), 1)

        # Test Event Freeze
        res = self.client.post(f'/api/events/{event_id}/complete', json={})
        self.assertEqual(res.status_code, 200)

        # Attempt to add transaction to frozen event (should fail)
        res = self.client.post('/api/transactions', json={
            'amount': 100.00,
            'type': 'expense',
            'category_id': food_cat['id'],
            'note': 'Snacks',
            'payment_method': 'UPI',
            'transaction_date': '2026-06-22',
            'event_id': event_id
        })
        self.assertEqual(res.status_code, 400)

if __name__ == '__main__':
    unittest.main()
