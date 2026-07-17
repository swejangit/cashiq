# 💰 Cashiq

> **A Modern Personal Finance Management System built with Flask**
>
> Take control of your finances by tracking income, expenses, debts, receivables, budgets, and event-based spending—all in one place.

---

## 📖 About

Cashiq was built to solve a real-world problem.

Like many people, I used notebooks and mobile notes to track my daily expenses. While it worked, it was difficult to manage debts, event expenses, monthly summaries, and financial planning efficiently.

Instead of relying on multiple apps and manual calculations, I built **Cashiq** as a personal finance management platform that helps users organize every aspect of their finances from a single dashboard.

---

# ✨ Features

## 📊 Dashboard

A clean financial overview displaying:

- Current Balance
- Monthly Income
- Monthly Expenses
- Net Payable
- Recent Transactions
- Personalized greeting
  - Hi, *User Name* 👋

---

## 💵 Income Management

- Add income
- Edit income
- Delete income
- Categorize income
- Monthly tracking

---

## 💸 Expense Management

- Add expenses
- Edit expenses
- Delete expenses
- Expense categories
- Monthly expense reports

---

## 🤝 Debt Management

Manage money borrowed from others.

Features include:

- Add debt
- Edit debt
- Delete debt
- Search debts
- Smart debt merging

### Smart Debt Merge

If money is borrowed multiple times from the same person:

Example

Borrowed ₹1000 from A

Borrowed ₹500 from A

Cashiq automatically maintains a single account for A instead of creating duplicate records.

---

## 📒 Person Ledger

Every person has a complete financial ledger.

Clicking a person's name displays:

- Current Outstanding
- Total Borrowed
- Total Repaid
- Complete transaction history

Example

```
Borrowed ₹5000

Repaid ₹1500

Repaid ₹2000

Borrowed Again ₹200
```

Each ledger entry supports editing.

---

## 💰 Receivables

Track money others owe you.

- Add receivable
- Edit receivable
- Delete receivable
- Search

---

## 🗑 Trash System

Deleted records are never removed immediately.

Instead:

Delete

↓

Move to Trash

↓

Retained for 30 days

↓

Automatically deleted

Supports:

- Restore
- Permanent Delete

Applies to:

- Income
- Expenses
- Debts
- Receivables
- Transactions
- Events

---

## 🎉 Event Finance Management

Create dedicated finance workspaces for events.

Examples

- Birthday
- Marriage
- Festival
- Trip
- Housewarming

Track:

### Money Received

- Borrowed money
- Contributions
- Collections

### Money Spent

- Food
- Decorations
- Tent House
- Fuel
- Miscellaneous

When an event is completed, Cashiq generates:

- Financial Summary
- Expense Analysis
- Reports

Every entry remains editable.

---

## 📈 Reports & Analytics

Visual insights into:

- Monthly spending
- Monthly income
- Financial summaries
- Event summaries

---

## 👤 Authentication

Secure user login system.

Every user has:

- Personal dashboard
- Personal financial data
- Independent records

---

# 🛠 Tech Stack

### Backend

- Python
- Flask

### Frontend

- HTML
- CSS
- JavaScript

### Database

- SQLite

### Deployment

- Railway

### Version Control

- Git
- GitHub

---

# 📂 Project Structure

```
Cashiq
│
├── app.py
├── models.py
├── db_init.py
├── database/
├── static/
├── templates/
├── tests/
├── requirements.txt
└── Procfile
```

---

# 🚀 Installation

Clone the repository

```bash
git clone https://github.com/swejangit/cashiq.git
```

Move into the project

```bash
cd cashiq
```

Install dependencies

```bash
pip install -r requirements.txt
```

Run the application

```bash
python app.py
```

Open

```
http://127.0.0.1:5000
```

---

# 🌐 Live Demo

https://web-production-94b5e7.up.railway.app/

---


# 🔮 Future Improvements

- PostgreSQL Migration
- Cloud Database
- Recurring Transactions
- Savings Goals
- Export to PDF
- Export to Excel
- Email Reports
- Budget Alerts
- AI Spending Insights
- Mobile Responsive Improvements
- Dark Mode
- Notifications

---

# 🎯 Purpose

Cashiq is more than a CRUD project.

It is a practical finance management application designed to solve real financial tracking problems while demonstrating full-stack development skills, software architecture, database design, and product thinking.

---

# 👨‍💻 Author

**Swejan Bonagiri**

GitHub:
https://github.com/swejangit

---

## ⭐ If you like this project, consider giving it a star on GitHub.
