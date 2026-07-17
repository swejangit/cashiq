import sqlite3
from werkzeug.security import generate_password_hash
from models import init_db, create_user, get_db_connection

def seed_db():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Seed global default categories (user_id = NULL)
    default_categories = [
        # Income categories
        (None, 'Salary', 'income'),
        (None, 'Freelance', 'income'),
        (None, 'Investment', 'income'),
        (None, 'Gift', 'income'),
        (None, 'Other Income', 'income'),
        
        # Expense categories
        (None, 'Food & Dining', 'expense'),
        (None, 'Rent & Housing', 'expense'),
        (None, 'Shopping', 'expense'),
        (None, 'Entertainment', 'expense'),
        (None, 'Utilities', 'expense'),
        (None, 'Transportation', 'expense'),
        (None, 'Healthcare', 'expense'),
        (None, 'Education', 'expense'),
        (None, 'Other Expense', 'expense')
    ]
    
    for user_id, name, cat_type in default_categories:
        if user_id is None:
            exists = cursor.execute(
                'SELECT 1 FROM categories WHERE user_id IS NULL AND name = ? AND type = ?',
                (name, cat_type)
            ).fetchone()
        else:
            exists = cursor.execute(
                'SELECT 1 FROM categories WHERE user_id = ? AND name = ? AND type = ?',
                (user_id, name, cat_type)
            ).fetchone()
            
        if not exists:
            cursor.execute(
                'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)',
                (user_id, name, cat_type)
            )
            
    conn.commit()
    conn.close()
    
    # 2. Seed default admin user if not exists
    admin_username = 'admin'
    admin_email = 'admin@cashiq.com'
    admin_mobile = '9999999999'
    admin_password = 'adminpass'
    
    conn = get_db_connection()
    admin_exists = conn.execute('SELECT 1 FROM users WHERE username = ?', (admin_username,)).fetchone()
    conn.close()
    
    if not admin_exists:
        hashed_password = generate_password_hash(admin_password)
        create_user(admin_username, admin_email, admin_mobile, hashed_password, role='admin')
        print(f"Admin user created: username={admin_username}, password={admin_password}")
    else:
        print("Admin user already exists.")
        
    print("Database seeding completed.")

if __name__ == '__main__':
    seed_db()
