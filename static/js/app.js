// Cashiq SPA Frontend Application Logic — Premium Light Theme

// Global Application State
const state = {
    user: null,
    activeView: 'dashboard',
    categories: [],
    transactions: [],
    budgets: [],
    debts: [],
    receivables: [],
    events: [],
    trash: {
        transactions: [],
        debts: [],
        events: [],
        ledger_entries: []
    },
    monthlySummaries: [],
    adminUsers: [],
    selectedMonth: new Date().toISOString().substring(0, 7), // YYYY-MM
    charts: {
        trend: null,
        category: null,
        budget: null
    }
};

// Document Loaded Init
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    await checkSession();
    updateDateDisplay();
}

function updateDateDisplay() {
    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    const dateStr = new Date().toLocaleDateString('en-US', options);
    document.getElementById('current-date-str').textContent = dateStr;
}

function updateUserProfileUI() {
    if (state.user) {
        document.getElementById('user-display-name').textContent = state.user.username;
        document.getElementById('user-display-role').textContent = state.user.role;
        document.getElementById('user-avatar').textContent = state.user.username[0].toUpperCase();
    }
}

// Check session on start
async function checkSession() {
    showAppLoading(true);
    try {
        const response = await fetch('/api/session');
        const result = await response.json();
        if (result.success && result.user) {
            state.user = result.user;
            updateUserProfileUI();
            showAuthScreen(false);
            showMainScreen(true);
            
            // Adjust Sidebar based on Role
            const adminLink = document.getElementById('admin-nav-link');
            if (state.user.role === 'admin') {
                adminLink.classList.remove('hidden');
            } else {
                adminLink.classList.add('hidden');
            }
            
            // Load initial view data
            await loadViewData(state.activeView);
        } else {
            showMainScreen(false);
            showAuthScreen(true);
        }
    } catch (err) {
        showToast('Connection error during initialization.', 'danger');
        showMainScreen(false);
        showAuthScreen(true);
    } finally {
        showAppLoading(false);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Auth Toggle Links
    document.getElementById('to-signup-btn').addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthForm('signup');
    });
    document.getElementById('to-login-btn').addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthForm('login');
    });

    // Auth Form Submits
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Sidebar View Navigation
    const navLinks = document.querySelectorAll('#sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            
            // UI navigation classes update (light theme styling)
            navLinks.forEach(l => {
                l.className = "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group text-slate-600 hover:text-slate-950 hover:bg-slate-50";
            });
            
            if (view === 'admin') {
                link.className = "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group text-red-600 bg-red-50 border-l-2 border-red-500";
            } else {
                link.className = "flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group text-brand-600 bg-brand-50 border-l-2 border-brand-500";
            }
            
            // Collapse mobile menu if open
            const sidebar = document.querySelector('aside nav');
            sidebar.classList.add('hidden');
            sidebar.classList.add('md:block');
            
            await switchView(view);
        });
    });

    // Mobile Navigation Toggle
    document.getElementById('mobile-nav-toggle').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar-nav');
        if (sidebar.classList.contains('hidden')) {
            sidebar.classList.remove('hidden');
        } else {
            sidebar.classList.add('hidden');
        }
    });

    // Quick Add Transaction Dialog
    document.getElementById('quick-add-transaction-btn').addEventListener('click', () => {
        openTransactionModal();
    });

    // Close Modal actions
    document.getElementById('close-modal-x').addEventListener('click', closeTransactionModal);
    document.getElementById('close-modal-backdrop').addEventListener('click', closeTransactionModal);
    document.getElementById('cancel-tx-btn').addEventListener('click', closeTransactionModal);

    // Form Submits
    document.getElementById('transaction-form').addEventListener('submit', saveTransaction);
    document.getElementById('budget-form').addEventListener('submit', saveBudget);
    document.getElementById('debt-form').addEventListener('submit', saveDebt);
    document.getElementById('category-form').addEventListener('submit', createCustomCategory);
    document.getElementById('ledger-form').addEventListener('submit', saveLedger);
    document.getElementById('event-form').addEventListener('submit', saveEvent);

    // Close Budget Modal
    document.getElementById('close-budget-x').addEventListener('click', closeBudgetModal);
    document.getElementById('close-budget-backdrop').addEventListener('click', closeBudgetModal);
    document.getElementById('cancel-budget-btn').addEventListener('click', closeBudgetModal);

    // Close Debt Modal
    document.getElementById('close-debt-x').addEventListener('click', closeDebtModal);
    document.getElementById('close-debt-backdrop').addEventListener('click', closeDebtModal);
    document.getElementById('cancel-debt-btn').addEventListener('click', closeDebtModal);

    // Close Ledger Modal
    document.getElementById('close-ledger-x').addEventListener('click', closeLedgerModal);
    document.getElementById('close-ledger-backdrop').addEventListener('click', closeLedgerModal);
    document.getElementById('cancel-ledger-btn').addEventListener('click', closeLedgerModal);

    // Close Event Modal
    document.getElementById('close-event-x').addEventListener('click', closeEventModal);
    document.getElementById('close-event-backdrop').addEventListener('click', closeEventModal);
    document.getElementById('cancel-event-btn').addEventListener('click', closeEventModal);

    // Close Transaction Details Modal
    const txDetailsModal = document.getElementById('tx-details-modal');
    const closeTxDetails = () => {
        txDetailsModal.querySelector('.transform').classList.add('scale-95', 'opacity-0');
        setTimeout(() => txDetailsModal.classList.add('hidden'), 200);
    };
    document.getElementById('close-tx-details-x').addEventListener('click', closeTxDetails);
    document.getElementById('close-tx-details-backdrop').addEventListener('click', closeTxDetails);
    document.getElementById('close-tx-details-btn').addEventListener('click', closeTxDetails);

    // Close Category Modal
    document.getElementById('close-category-x').addEventListener('click', closeCategoryModal);
    document.getElementById('close-category-backdrop').addEventListener('click', closeCategoryModal);
    document.getElementById('cancel-category-btn').addEventListener('click', closeCategoryModal);

    // Transaction Modal dynamic category populator on type change
    document.getElementById('tx-type').addEventListener('change', (e) => {
        populateTransactionCategories(e.target.value);
    });

    // Esc Key Listener for Modals
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTransactionModal();
            closeBudgetModal();
            closeDebtModal();
            closeCategoryModal();
            closeLedgerModal();
            closeEventModal();
            closeTxDetails();
        }
    });
    
    // Quick shortcut: Press 'n' to open transaction log (when not typing in form)
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'n' && 
            document.activeElement.tagName !== 'INPUT' && 
            document.activeElement.tagName !== 'SELECT' && 
            document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            openTransactionModal();
        }
    });
}

// View Switches
async function switchView(view) {
    state.activeView = view;
    
    // Update Header Text
    const titles = {
        dashboard: { main: 'Dashboard', sub: '' },
        transactions: { main: 'Transactions Ledger', sub: 'Monitor and search your financial logs' },
        planning: { main: 'Budget Control', sub: 'Control your spending per category' },
        debts: { main: 'Debts Registry', sub: 'Track money you owe to others' },
        receivables: { main: 'Receivables Registry', sub: 'Track money others owe to you' },
        events: { main: 'Events Management', sub: 'Manage finances for specific functions and trips' },
        'event-dashboard': { main: 'Event Details', sub: 'Detailed breakdown and timeline for event' },
        trash: { main: 'Trash Bin', sub: 'Restore or permanently delete soft-deleted items (30 days limit)' },
        'person-ledger': { main: 'Person Ledger Profile', sub: 'Chronological list of all ledger entries for this person' },
        reports: { main: 'Reports & Insights', sub: 'Visually explore your financial records' },
        settings: { main: 'System Settings', sub: 'Manage cycles, archives, and profiles' },
        admin: { main: 'Hidden Admin panel', sub: 'Manage user access profiles' }
    };
    
    document.getElementById('view-title').textContent = titles[view].main;
    document.getElementById('view-subtitle').textContent = titles[view].sub;
    
    // Load Data and Render
    await loadViewData(view);
}

// Load appropriate view data from server
async function loadViewData(view) {
    showAppLoading(true);
    try {
        // Core data required across most views
        if (state.categories.length === 0) {
            await fetchCategories();
        }

        if (view === 'dashboard') {
            await fetchTransactions();
            await fetchBudgets();
            await fetchDebts();
            await fetchReceivables();
            renderDashboard();
        } else if (view === 'transactions') {
            await fetchTransactions();
            await fetchEvents();
            renderTransactions();
        } else if (view === 'planning') {
            await fetchBudgets();
            renderPlanning();
        } else if (view === 'debts') {
            await fetchDebts();
            renderDebts();
        } else if (view === 'receivables') {
            await fetchReceivables();
            renderReceivables();
        } else if (view === 'events') {
            await fetchEvents();
            renderEvents();
        } else if (view === 'event-dashboard') {
            await fetchEventDetails(state.selectedEventId);
            renderEventDashboard();
        } else if (view === 'trash') {
            await fetchTrash();
            renderTrash();
        } else if (view === 'person-ledger') {
            await fetchDebtDetails(state.selectedDebtId);
            renderPersonLedger();
        } else if (view === 'reports') {
            await fetchTransactions();
            await fetchBudgets();
            renderReports();
        } else if (view === 'settings') {
            await fetchMonthlySummaries();
            renderSettings();
        } else if (view === 'admin') {
            if (state.user.role === 'admin') {
                await fetchAdminUsers();
                renderAdmin();
            } else {
                switchView('dashboard');
            }
        }
    } catch (err) {
        showToast('Error retrieving page data.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// --- API ACTIONS ---

async function fetchCategories() {
    const res = await fetch('/api/categories');
    const result = await res.json();
    if (result.success) {
        state.categories = result.data;
    }
}

async function fetchTransactions(filters = {}) {
    let url = '/api/transactions';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value) params.append(key, value);
    }
    if (params.toString()) {
        url += '?' + params.toString();
    }
    
    const res = await fetch(url);
    const result = await res.json();
    if (result.success) {
        state.transactions = result.data;
    }
}

async function fetchBudgets(month = state.selectedMonth) {
    const res = await fetch(`/api/budgets?month=${month}`);
    const result = await res.json();
    if (result.success) {
        state.budgets = result.data;
    }
}

async function fetchDebts() {
    const res = await fetch('/api/debts');
    const result = await res.json();
    if (result.success) {
        state.debts = result.data;
    }
}

async function fetchReceivables() {
    const res = await fetch('/api/receivables');
    const result = await res.json();
    if (result.success) {
        state.receivables = result.data;
    }
}

async function fetchEvents() {
    const res = await fetch('/api/events');
    const result = await res.json();
    if (result.success) {
        state.events = result.data;
    }
}

async function fetchTrash() {
    const res = await fetch('/api/trash');
    const result = await res.json();
    if (result.success) {
        state.trash = result.data;
    }
}

async function fetchDebtDetails(id) {
    const res = await fetch(`/api/debts/${id}`);
    const result = await res.json();
    if (result.success) {
        state.selectedDebt = result.data;
    }
}

async function fetchEventDetails(id) {
    const res = await fetch(`/api/events/${id}/details`);
    const result = await res.json();
    if (result.success) {
        state.selectedEventDetails = result.data;
    }
}

async function fetchMonthlySummaries() {
    const res = await fetch('/api/monthly-summaries');
    const result = await res.json();
    if (result.success) {
        state.monthly_summaries = result.data;
    }
}

async function fetchAdminUsers() {
    const res = await fetch('/api/admin/users');
    const result = await res.json();
    if (result.success) {
        state.adminUsers = result.data;
    }
}

// --- AUTH ROUTINES ---

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await res.json();
        
        if (result.success) {
            state.user = result.user;
            updateUserProfileUI();
            showAuthScreen(false);
            showMainScreen(true);
            showToast(`Welcome back, ${state.user.username}!`, 'success');
            
            // Adjust Sidebar based on Role
            const adminLink = document.getElementById('admin-nav-link');
            if (state.user.role === 'admin') {
                adminLink.classList.remove('hidden');
            } else {
                adminLink.classList.add('hidden');
            }
            
            await switchView('dashboard');
        } else {
            showToast(result.error || 'Authentication failed.', 'danger');
        }
    } catch (err) {
        showToast('Connection error. Server may be offline.', 'danger');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const username = document.getElementById('signup-username').value;
    const email = document.getElementById('signup-email').value;
    const mobile = document.getElementById('signup-mobile').value;
    const password = document.getElementById('signup-password').value;
    
    try {
        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, mobile, password })
        });
        const result = await res.json();
        
        if (result.success) {
            showToast('Account created! Logging in...', 'success');
            // Auto login after signup
            document.getElementById('login-username').value = username;
            document.getElementById('login-password').value = password;
            toggleAuthForm('login');
            // Submit login
            document.getElementById('login-form').dispatchEvent(new Event('submit'));
        } else {
            showToast(result.error || 'Signup failed.', 'danger');
        }
    } catch (err) {
        showToast('Connection error.', 'danger');
    }
}

async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        state.user = null;
        showMainScreen(false);
        showAuthScreen(true);
        showToast('Logged out successfully.', 'success');
    } catch (err) {
        showToast('Error logging out.', 'danger');
    }
}

// --- RENDER DASHBOARD VIEW ---

function renderDashboard() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-8 animate-fade-in-up";
    
    const username = state.user ? state.user.username : 'User';
    const displayName = username.charAt(0).toUpperCase() + username.slice(1);
    
    // 1. Calculate dashboard summary metrics
    const currentMonthStr = state.selectedMonth; // YYYY-MM
    
    // filter transactions in this month
    const thisMonthTxs = state.transactions.filter(t => t.transaction_date.substring(0,7) === currentMonthStr);
    
    const monthlyIncome = thisMonthTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const monthlyExpenses = thisMonthTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    
    // Overall balance (all-time since we don't clear old history)
    const allIncome = state.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const allExpenses = state.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = allIncome - allExpenses;
    
    // Active budgets summary
    const totalBudgetLimit = state.budgets.reduce((sum, b) => sum + b.planned_amount, 0);
    const totalBudgetSpent = state.budgets.reduce((sum, b) => sum + b.spent_amount, 0);
    
    // Net Payable: what we owe to others
    const activeDebtsList = state.debts.filter(d => d.status !== 'Paid');
    const totalDebtsVal = activeDebtsList.reduce((sum, d) => sum + d.pending_amount, 0);
    
    // Format amounts
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    let debtColorClass = totalDebtsVal > 0 ? "text-dangerRed" : "text-slate-500";
    let debtLabel = "Net Payable";

    // Recent transactions HTML (Limit to 5)
    let recentTxsHtml = '';
    const recent5 = state.transactions.slice(0, 5);
    
    if (recent5.length === 0) {
        recentTxsHtml = `
            <div class="flex flex-col items-center justify-center py-10 text-center">
                <i data-lucide="inbox" class="w-8 h-8 text-slate-300 mb-2"></i>
                <p class="text-sm text-slate-400">No transactions recorded yet.</p>
            </div>
        `;
    } else {
        recentTxsHtml = `
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            <th class="py-3 px-1">Details</th>
                            <th class="py-3 px-1">Category</th>
                            <th class="py-3 px-1">Method</th>
                            <th class="py-3 px-1 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100/60">
        `;
        recent5.forEach(t => {
            const isIncome = t.type === 'income';
            recentTxsHtml += `
                <tr class="text-sm group hover:bg-slate-50/60 transition duration-150">
                    <td class="py-3.5 px-1">
                        <p class="font-semibold text-slate-900 truncate max-w-[150px] cursor-pointer hover:text-brand-600" onclick="showTransactionDetails(${t.id})">${t.note || 'Transaction'}</p>
                        <p class="text-[10px] text-slate-400">${t.transaction_date}</p>
                    </td>
                    <td class="py-3.5 px-1">
                        <span class="inline-flex items-center text-xs px-2 py-0.5 rounded-full ${isIncome ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : 'bg-brand-50 text-brand-700 border border-brand-200/50'} font-medium">
                            ${t.category_name}
                        </span>
                    </td>
                    <td class="py-3.5 px-1 text-slate-500 text-xs">${t.payment_method}</td>
                    <td class="py-3.5 px-1 text-right font-bold font-outfit ${isIncome ? 'text-successGreen' : 'text-slate-800'}">
                        ${isIncome ? '+' : '-'}${formatCurrency(t.amount)}
                    </td>
                </tr>
            `;
        });
        recentTxsHtml += `
                    </tbody>
                </table>
            </div>
        `;
    }

    // Budget progress bars HTML
    let budgetProgressHtml = '';
    const activeBudgets = state.budgets.slice(0, 4); // Limit to 4 on dashboard
    if (activeBudgets.length === 0) {
        budgetProgressHtml = `
            <div class="flex flex-col items-center justify-center py-10 text-center">
                <i data-lucide="sliders" class="w-8 h-8 text-slate-300 mb-2"></i>
                <p class="text-sm text-slate-400 mb-3">No budgets active for ${state.selectedMonth}.</p>
                <button onclick="switchView('planning')" class="text-xs px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/10 text-brand-700 font-semibold rounded-lg transition duration-200">
                    Create Budget
                </button>
            </div>
        `;
    } else {
        budgetProgressHtml = `<div class="space-y-4">`;
        activeBudgets.forEach(b => {
            const pct = Math.min(100, (b.spent_amount / b.planned_amount) * 100);
            let barColor = 'bg-brand-500';
            let statusBadge = 'status-indicator-safe';
            
            if (b.status === 'Exceeded') {
                barColor = 'bg-dangerRed';
                statusBadge = 'status-indicator-danger';
            } else if (b.status === 'Near Limit') {
                barColor = 'bg-warningOrange';
                statusBadge = 'status-indicator-warning';
            }
            
            budgetProgressHtml += `
                <div>
                    <div class="flex justify-between items-center text-xs mb-1.5">
                        <div class="flex items-center gap-2">
                            <span class="font-semibold text-slate-800">${b.category_name}</span>
                            <span class="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${statusBadge}">${b.status}</span>
                        </div>
                        <span class="text-slate-600 font-medium">${formatCurrency(b.spent_amount)} / <span class="text-slate-400">${formatCurrency(b.planned_amount)}</span></span>
                    </div>
                    <div class="w-full bg-slate-100 border border-slate-200/50 h-2.5 rounded-full overflow-hidden">
                        <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        });
        budgetProgressHtml += `</div>`;
    }

    container.innerHTML = `
        <!-- Personalized Greeting -->
        <div class="mb-2 animate-fade-in-up">
            <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight font-outfit">Hi, ${displayName} 👋</h1>
        </div>

        <!-- Metrics Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- Balance Card -->
            <div class="bg-gradient-to-br from-brand-50 via-white to-white border border-slate-200/80 rounded-2xl p-5 shadow-md shadow-slate-100/50 relative overflow-hidden glow-card">
                <div class="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none"></div>
                <div class="flex justify-between items-start mb-3">
                    <span class="text-xs uppercase tracking-wider font-bold text-slate-400">Current Balance</span>
                    <span class="p-1.5 bg-brand-500/10 text-brand-600 rounded-lg"><i data-lucide="credit-card" class="w-4 h-4"></i></span>
                </div>
                <h3 class="text-2xl font-extrabold text-slate-900 tracking-tight font-outfit truncate">${formatCurrency(balance)}</h3>
                <p class="text-[10px] text-brand-600 mt-2 font-medium flex items-center gap-1">
                    <i data-lucide="info" class="w-3.5 h-3.5"></i> Live Cash/Bank holdings
                </p>
            </div>
            
            <!-- Income Card -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/40 relative overflow-hidden glow-card">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-xs uppercase tracking-wider font-bold text-slate-400">Monthly Income</span>
                    <span class="p-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg"><i data-lucide="trending-up" class="w-4 h-4"></i></span>
                </div>
                <h3 class="text-2xl font-extrabold text-emerald-600 tracking-tight font-outfit truncate">${formatCurrency(monthlyIncome)}</h3>
                <p class="text-[10px] text-slate-400 mt-2">Earned in ${currentMonthStr}</p>
            </div>
            
            <!-- Expense Card -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/40 relative overflow-hidden glow-card">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-xs uppercase tracking-wider font-bold text-slate-400">Monthly Spend</span>
                    <span class="p-1.5 bg-rose-500/10 text-rose-600 rounded-lg"><i data-lucide="trending-down" class="w-4 h-4"></i></span>
                </div>
                <h3 class="text-2xl font-extrabold text-rose-600 tracking-tight font-outfit truncate">${formatCurrency(monthlyExpenses)}</h3>
                <p class="text-[10px] text-slate-400 mt-2">Spent in ${currentMonthStr}</p>
            </div>

            <!-- Net Payable Card -->
            <div onclick="switchView('debts')" class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/40 relative overflow-hidden glow-card cursor-pointer hover:shadow-lg hover:border-brand-500/30 transition duration-200">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-xs uppercase tracking-wider font-bold text-slate-400">${debtLabel}</span>
                    <span class="p-1.5 bg-indigo-500/10 text-indigo-600 rounded-lg"><i data-lucide="coins" class="w-4 h-4"></i></span>
                </div>
                <h3 class="text-2xl font-extrabold ${debtColorClass} tracking-tight font-outfit truncate">${formatCurrency(Math.abs(totalDebtsVal))}</h3>
                <p class="text-[10px] text-slate-400 mt-2">${activeDebtsList.length} pending entries</p>
            </div>
        </div>

        <!-- Dashboard Widgets -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Recent Activity -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between mb-5">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Transactions</h4>
                        <a href="#" onclick="switchView('transactions')" class="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                            View Ledger <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                        </a>
                    </div>
                    ${recentTxsHtml}
                </div>
            </div>

            <!-- Budget Status -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between mb-5">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Budget Progress</h4>
                        <a href="#" onclick="switchView('planning')" class="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                            Manage Budgets <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                        </a>
                    </div>
                    ${budgetProgressHtml}
                </div>
            </div>

            <!-- Visual breakdown (Minichart) -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-5">Expense Shares</h4>
                    <div id="dashboard-donut-chart" class="flex justify-center items-center py-4">
                        <!-- Chart rendered here -->
                    </div>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    renderDashboardDonut();
}

function renderDashboardDonut() {
    const expensesOnly = state.transactions.filter(t => t.type === 'expense' && t.transaction_date.substring(0, 7) === state.selectedMonth);
    
    // Group totals by category
    const catMap = {};
    expensesOnly.forEach(tx => {
        catMap[tx.category_name] = (catMap[tx.category_name] || 0) + tx.amount;
    });

    const categories = Object.keys(catMap);
    const series = Object.values(catMap);

    const chartEl = document.getElementById('dashboard-donut-chart');
    if (categories.length === 0) {
        chartEl.innerHTML = `
            <div class="text-center py-6 text-xs text-slate-400 flex flex-col items-center">
                <i data-lucide="pie-chart" class="w-8 h-8 text-slate-300 mb-2"></i>
                No expense records this month
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const options = {
        series: series,
        labels: categories,
        chart: {
            type: 'donut',
            height: 220,
            foreColor: '#64748B'
        },
        dataLabels: {
            enabled: false
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '75%',
                    background: 'transparent',
                    labels: {
                        show: true,
                        name: {
                            show: true,
                            fontSize: '11px',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontWeight: 600,
                            color: '#64748B',
                            offsetY: -4
                        },
                        value: {
                            show: true,
                            fontSize: '16px',
                            fontFamily: 'Outfit, sans-serif',
                            fontWeight: 700,
                            color: '#0F172A',
                            offsetY: 4,
                            formatter: function (val) {
                                return '₹' + parseFloat(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                            }
                        },
                        total: {
                            show: true,
                            label: 'Total Expenses',
                            fontSize: '10px',
                            color: '#64748B',
                            formatter: function (w) {
                                return '₹' + w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                            }
                        }
                    }
                }
            }
        },
        legend: {
            show: false
        },
        stroke: {
            show: true,
            colors: ['#FFFFFF'],
            width: 3
        },
        colors: ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6', '#6366F1', '#A855F7'],
        theme: {
            mode: 'light'
        }
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
}

// --- RENDER TRANSACTIONS LEDGER VIEW ---

function renderTransactions() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";
    
    // Category dropdown options HTML
    let catOptions = '<option value="">All Categories</option>';
    state.categories.forEach(cat => {
        catOptions += `<option value="${cat.id}">${cat.name} (${cat.type})</option>`;
    });

    let txTableRows = '';
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    if (state.transactions.length === 0) {
        txTableRows = `
            <tr>
                <td colspan="6" class="py-12 text-center text-slate-400">
                    <div class="flex flex-col items-center justify-center">
                        <i data-lucide="inbox" class="w-10 h-10 text-slate-300 mb-3"></i>
                        <p class="font-semibold text-sm">No transactions found</p>
                        <p class="text-xs text-slate-400 mt-1">Try resetting filters or log a new transaction.</p>
                    </div>
                </td>
            </tr>
        `;
    } else {
        state.transactions.forEach(t => {
            const isIncome = t.type === 'income';
            txTableRows += `
                <tr class="text-sm border-b border-slate-100 hover:bg-slate-50/50 transition duration-150">
                    <td class="py-3.5 px-4 font-semibold text-slate-950 max-w-[180px] truncate">${t.note || '-'}</td>
                    <td class="py-3.5 px-4 font-semibold font-outfit ${isIncome ? 'text-successGreen' : 'text-slate-800'}">
                        ${isIncome ? '+' : '-'}${formatCurrency(t.amount)}
                    </td>
                    <td class="py-3.5 px-4">
                        <span class="inline-flex items-center text-xs px-2 py-0.5 rounded-full ${isIncome ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/55' : 'bg-brand-50 text-brand-700 border border-brand-200/55'} font-medium">
                            ${t.category_name}
                        </span>
                    </td>
                    <td class="py-3.5 px-4 text-xs text-slate-500">${t.payment_method}</td>
                    <td class="py-3.5 px-4 text-xs text-slate-500 font-outfit">${t.transaction_date}</td>
                    <td class="py-3.5 px-4 text-right">
                        <div class="flex items-center justify-end gap-2.5">
                            <button onclick="editTransaction(${t.id})" class="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 transition-colors" title="Edit"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                            <button onclick="deleteTransactionPrompt(${t.id})" class="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-dangerRed transition-colors" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    container.innerHTML = `
        <!-- Filter Controls -->
        <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/40 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3.5">
                <!-- Search -->
                <div class="relative col-span-1 md:col-span-2">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400"><i data-lucide="search" class="w-4 h-4"></i></span>
                    <input type="text" id="filter-search" class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-brand-500 text-slate-800 placeholder-slate-400" placeholder="Search notes or categories...">
                </div>
                
                <!-- Type Filter -->
                <div>
                    <select id="filter-type" class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-brand-500 text-slate-800">
                        <option value="">All Types</option>
                        <option value="expense">Expenses</option>
                        <option value="income">Incomes</option>
                    </select>
                </div>
                
                <!-- Category Filter -->
                <div>
                    <select id="filter-category" class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-brand-500 text-slate-800">
                        ${catOptions}
                    </select>
                </div>

                <!-- Custom Category Button -->
                <div class="flex items-center">
                    <button onclick="openCategoryModal()" class="w-full py-2 bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
                        <i data-lucide="tag" class="w-3.5 h-3.5"></i> Add custom category
                    </button>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3.5 pt-3 border-t border-slate-100">
                <div class="col-span-1 md:col-span-2 flex items-center gap-2 text-xs text-slate-500">
                    <i data-lucide="calendar" class="w-4 h-4"></i> Date range filter:
                </div>
                <div>
                    <input type="date" id="filter-start-date" class="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:border-brand-500 text-slate-800">
                </div>
                <div>
                    <input type="date" id="filter-end-date" class="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:border-brand-500 text-slate-800">
                </div>
                <div>
                    <button id="apply-filters-btn" class="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition shadow-sm hover:shadow active:scale-98">
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>

        <!-- Ledger Table Card -->
        <div class="bg-white border border-slate-200/60 rounded-2xl shadow-lg shadow-slate-100/50 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50">
                            <th class="py-3 px-4">Note / details</th>
                            <th class="py-3 px-4">Amount</th>
                            <th class="py-3 px-4">Category</th>
                            <th class="py-3 px-4">Method</th>
                            <th class="py-3 px-4">Date</th>
                            <th class="py-3 px-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100/60">
                        ${txTableRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    lucide.createIcons();

    // Attach local view event listeners
    document.getElementById('apply-filters-btn').addEventListener('click', applyTransactionFilters);
}

async function applyTransactionFilters() {
    const search = document.getElementById('filter-search').value.trim();
    const type = document.getElementById('filter-type').value;
    const categoryId = document.getElementById('filter-category').value;
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    
    showAppLoading(true);
    await fetchTransactions({ search, type, categoryId, startDate, endDate });
    renderTransactions();
    showAppLoading(false);
}

// --- RENDER BUDGET PLANNING VIEW ---

function renderPlanning() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";
    
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val).toLocaleString('en-IN');
    };

    let budgetRows = '';
    
    if (state.budgets.length === 0) {
        budgetRows = `
            <div class="col-span-full bg-white border border-slate-200/60 rounded-2xl p-10 text-center flex flex-col items-center justify-center shadow-sm">
                <i data-lucide="sliders" class="w-10 h-10 text-slate-300 mb-3"></i>
                <p class="font-bold text-slate-800 text-base">No Budgets Formed</p>
                <p class="text-xs text-slate-400 mt-1 mb-4">You have not planned any category budgets for this month cycle.</p>
                <button onclick="openBudgetModal()" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition-all shadow shadow-brand-500/10">
                    Set Custom Budget
                </button>
            </div>
        `;
    } else {
        state.budgets.forEach(b => {
            const pct = Math.min(100, (b.spent_amount / b.planned_amount) * 100);
            let barColor = 'bg-brand-500';
            let statusClass = 'status-indicator-safe';
            
            if (b.status === 'Exceeded') {
                barColor = 'bg-dangerRed';
                statusClass = 'status-indicator-danger';
            } else if (b.status === 'Near Limit') {
                barColor = 'bg-warningOrange';
                statusClass = 'status-indicator-warning';
            }
            
            budgetRows += `
                <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50 flex flex-col justify-between glow-card relative">
                    <!-- Status Ring Indicator on Card Corner -->
                    <div class="absolute top-5 right-5 flex items-center gap-2">
                        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${statusClass}">
                            ${b.status}
                        </span>
                    </div>

                    <div class="mb-4">
                        <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Expense Limit</p>
                        <h4 class="text-lg font-bold text-slate-800 mt-0.5">${b.category_name}</h4>
                    </div>

                    <div class="space-y-2.5">
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-slate-600 font-medium">Spent: ${formatCurrency(b.spent_amount)}</span>
                            <span class="text-slate-400">Planned: ${formatCurrency(b.planned_amount)}</span>
                        </div>
                        
                        <div class="w-full bg-slate-100 border border-slate-200/50 h-2.5 rounded-full overflow-hidden">
                            <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                        </div>

                        <div class="flex justify-between items-center text-xs pt-1">
                            ${b.status === 'Exceeded' 
                                ? `<span class="text-dangerRed font-bold">Exceeded by ${formatCurrency(b.exceeded_amount)}</span>`
                                : `<span class="text-slate-500 font-semibold">Remaining: <span class="text-brand-600 font-bold">${formatCurrency(b.remaining_amount)}</span></span>`
                            }
                            <button onclick="editBudget(${b.category_id}, ${b.planned_amount})" class="text-xs text-brand-600 hover:text-brand-700 font-bold hover:underline transition-colors focus:outline-none">
                                Edit Budget
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = `
        <!-- Header Actions -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <label class="text-xs uppercase tracking-wider text-slate-400 font-bold">Active Month Cycle:</label>
                <input type="month" id="planning-month-select" value="${state.selectedMonth}" class="bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-brand-500 text-slate-800 font-semibold shadow-sm">
            </div>
            
            <button onclick="openBudgetModal()" class="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-1.5 shadow shadow-brand-500/10">
                <i data-lucide="sliders" class="w-4 h-4"></i>
                <span>Configure Budget</span>
            </button>
        </div>

        <!-- Budget Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${budgetRows}
        </div>
    `;

    lucide.createIcons();

    // Attach Month change handler
    document.getElementById('planning-month-select').addEventListener('change', async (e) => {
        state.selectedMonth = e.target.value;
        showAppLoading(true);
        await fetchBudgets(state.selectedMonth);
        renderPlanning();
        showAppLoading(false);
    });
}

// --- RENDER DEBTS REGISTRY VIEW ---

function renderDebts() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";
    
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    // Calculate Summary numbers: Borrowed (Payables)
    let totalBorrowed = 0;
    state.debts.forEach(d => {
        if (d.status !== 'Paid') {
            totalBorrowed += d.pending_amount;
        }
    });

    // Local Search filtering
    const searchVal = (state.debtSearch || '').toLowerCase().trim();
    const filteredDebts = state.debts.filter(d => 
        d.person_name.toLowerCase().includes(searchVal) || 
        (d.notes || '').toLowerCase().includes(searchVal)
    );

    let debtCardsHtml = '';
    if (filteredDebts.length === 0) {
        debtCardsHtml = `
            <div class="col-span-full bg-white border border-slate-200/60 rounded-2xl p-10 text-center flex flex-col items-center justify-center shadow-sm">
                <i data-lucide="coins" class="w-10 h-10 text-slate-300 mb-3"></i>
                <p class="font-bold text-slate-800 text-base">${state.debtSearch ? 'No matching debts found' : 'Debt Free!'}</p>
                <p class="text-xs text-slate-400 mt-1 mb-4">${state.debtSearch ? 'Try a different search term.' : 'No active debts we owe to others.'}</p>
                ${state.debtSearch ? '' : `
                <button onclick="openDebtModal(null, 'debt')" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition shadow shadow-brand-500/10">
                    Add Debt Entry
                </button>
                `}
            </div>
        `;
    } else {
        filteredDebts.forEach(d => {
            const isPaid = d.status === 'Paid';
            const isOverdue = d.status === 'Overdue';
            const paidPct = d.total_amount > 0 ? ((d.total_amount - d.pending_amount) / d.total_amount) * 100 : 0;
            
            let badgeClass = 'bg-brand-50 text-brand-700 border border-brand-200/50';
            if (isPaid) badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200/50';
            if (isOverdue) badgeClass = 'bg-rose-50 text-rose-700 border border-rose-200/50';

            debtCardsHtml += `
                <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50 flex flex-col justify-between glow-card relative hover:shadow-lg transition-all duration-200">
                    <div class="absolute top-5 right-5 flex items-center gap-2">
                        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${badgeClass}">
                            ${d.status}
                        </span>
                    </div>

                    <div class="mb-4 cursor-pointer" onclick="openPersonLedger(${d.id})">
                        <span class="text-[10px] uppercase font-extrabold tracking-wider text-dangerRed">
                            Borrowed from
                        </span>
                        <h4 class="text-base font-bold text-slate-900 mt-0.5 hover:text-brand-600">${d.person_name}</h4>
                        <p class="text-xs text-slate-400 mt-1 truncate">${d.notes ? d.notes.replace(/^\[BORROWED\]\s*/, '') : 'No notes added.'}</p>
                    </div>

                    <div class="space-y-3">
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-slate-500 font-semibold">Remaining: <span class="text-slate-950 font-bold">${formatCurrency(d.pending_amount)}</span></span>
                            <span class="text-slate-400 text-[10px]">Total: ${formatCurrency(d.total_amount)}</span>
                        </div>
                        
                        <div class="w-full bg-slate-100 border border-slate-200/50 h-2 rounded-full overflow-hidden">
                            <div class="h-full bg-dangerRed rounded-full transition-all duration-300" style="width: ${paidPct}%"></div>
                        </div>

                        <div class="flex justify-between items-center text-[10px] text-slate-400">
                            <span>Due Date: <span class="font-semibold text-slate-500 font-outfit">${d.due_date}</span></span>
                            <div class="flex items-center gap-2">
                                <button onclick="openPersonLedger(${d.id})" class="text-xs text-brand-600 hover:text-brand-700 font-bold hover:underline focus:outline-none">
                                    Ledger
                                </button>
                                <span class="text-slate-200">|</span>
                                <button onclick="editDebtRecord(${d.id})" class="text-xs text-slate-400 hover:text-slate-800 focus:outline-none">
                                    Edit
                                </button>
                                <span class="text-slate-200">|</span>
                                <button onclick="deleteDebtRecord(${d.id})" class="text-xs text-rose-500 hover:text-rose-700 focus:outline-none">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = `
        <!-- Summary Dashboard -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="col-span-full bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-rose-500/10 text-rose-600 rounded-xl"><i data-lucide="coins" class="w-6 h-6"></i></div>
                    <div>
                        <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Outstanding Debts</span>
                        <h3 class="text-3xl font-extrabold text-rose-600 tracking-tight font-outfit truncate mt-1">${formatCurrency(totalBorrowed)}</h3>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="relative max-w-xs w-full">
                        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400"><i data-lucide="search" class="w-4 h-4"></i></span>
                        <input type="text" id="debt-search-box" value="${state.debtSearch || ''}" class="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-brand-500 text-slate-800" placeholder="Search by name...">
                    </div>
                    <button onclick="openDebtModal(null, 'debt')" class="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 shadow shadow-brand-500/10 whitespace-nowrap">
                        <i data-lucide="plus" class="w-4.5 h-4.5"></i>
                        <span>Add Debt</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${debtCardsHtml}
        </div>
    `;

    // Bind search box listener
    const searchBox = document.getElementById('debt-search-box');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => {
            state.debtSearch = e.target.value;
            renderDebts();
        });
    }

    lucide.createIcons();
}

function renderReceivables() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";
    
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    // Calculate Summary numbers: Lent (Receivables)
    let totalLent = 0;
    state.receivables.forEach(r => {
        if (r.status !== 'Paid') {
            totalLent += r.pending_amount;
        }
    });

    // Local Search filtering
    const searchVal = (state.receivableSearch || '').toLowerCase().trim();
    const filteredRecs = state.receivables.filter(r => 
        r.person_name.toLowerCase().includes(searchVal) || 
        (r.notes || '').toLowerCase().includes(searchVal)
    );

    let recCardsHtml = '';
    if (filteredRecs.length === 0) {
        recCardsHtml = `
            <div class="col-span-full bg-white border border-slate-200/60 rounded-2xl p-10 text-center flex flex-col items-center justify-center shadow-sm">
                <i data-lucide="piggy-bank" class="w-10 h-10 text-slate-300 mb-3"></i>
                <p class="font-bold text-slate-800 text-base">${state.receivableSearch ? 'No matching receivables found' : 'No Receivables!'}</p>
                <p class="text-xs text-slate-400 mt-1 mb-4">${state.receivableSearch ? 'Try a different search term.' : 'Nobody owes you money currently.'}</p>
                ${state.receivableSearch ? '' : `
                <button onclick="openDebtModal(null, 'receivable')" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition shadow shadow-brand-500/10">
                    Add Receivable Entry
                </button>
                `}
            </div>
        `;
    } else {
        filteredRecs.forEach(r => {
            const isPaid = r.status === 'Paid';
            const isOverdue = r.status === 'Overdue';
            const paidPct = r.total_amount > 0 ? ((r.total_amount - r.pending_amount) / r.total_amount) * 100 : 0;
            
            let badgeClass = 'bg-brand-50 text-brand-700 border border-brand-200/50';
            if (isPaid) badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200/50';
            if (isOverdue) badgeClass = 'bg-rose-50 text-rose-700 border border-rose-200/50';

            recCardsHtml += `
                <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50 flex flex-col justify-between glow-card relative hover:shadow-lg transition-all duration-200">
                    <div class="absolute top-5 right-5 flex items-center gap-2">
                        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${badgeClass}">
                            ${r.status}
                        </span>
                    </div>

                    <div class="mb-4 cursor-pointer" onclick="openPersonLedger(${r.id})">
                        <span class="text-[10px] uppercase font-extrabold tracking-wider text-successGreen">
                            Lent to
                        </span>
                        <h4 class="text-base font-bold text-slate-900 mt-0.5 hover:text-brand-600">${r.person_name}</h4>
                        <p class="text-xs text-slate-400 mt-1 truncate">${r.notes ? r.notes.replace(/^\[LENT\]\s*/, '') : 'No notes added.'}</p>
                    </div>

                    <div class="space-y-3">
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-slate-500 font-semibold">Remaining: <span class="text-slate-950 font-bold">${formatCurrency(r.pending_amount)}</span></span>
                            <span class="text-slate-400 text-[10px]">Total: ${formatCurrency(r.total_amount)}</span>
                        </div>
                        
                        <div class="w-full bg-slate-100 border border-slate-200/50 h-2 rounded-full overflow-hidden">
                            <div class="h-full bg-successGreen rounded-full transition-all duration-300" style="width: ${paidPct}%"></div>
                        </div>

                        <div class="flex justify-between items-center text-[10px] text-slate-400">
                            <span>Due Date: <span class="font-semibold text-slate-500 font-outfit">${r.due_date}</span></span>
                            <div class="flex items-center gap-2">
                                <button onclick="openPersonLedger(${r.id})" class="text-xs text-brand-600 hover:text-brand-700 font-bold hover:underline focus:outline-none">
                                    Ledger
                                </button>
                                <span class="text-slate-200">|</span>
                                <button onclick="editDebtRecord(${r.id})" class="text-xs text-slate-400 hover:text-slate-800 focus:outline-none">
                                    Edit
                                </button>
                                <span class="text-slate-200">|</span>
                                <button onclick="deleteDebtRecord(${r.id})" class="text-xs text-rose-500 hover:text-rose-700 focus:outline-none">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = `
        <!-- Summary Dashboard -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="col-span-full bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl"><i data-lucide="piggy-bank" class="w-6 h-6"></i></div>
                    <div>
                        <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Receivables (Owed to you)</span>
                        <h3 class="text-3xl font-extrabold text-emerald-600 tracking-tight font-outfit truncate mt-1">${formatCurrency(totalLent)}</h3>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="relative max-w-xs w-full">
                        <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400"><i data-lucide="search" class="w-4 h-4"></i></span>
                        <input type="text" id="rec-search-box" value="${state.receivableSearch || ''}" class="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-brand-500 text-slate-800" placeholder="Search by name...">
                    </div>
                    <button onclick="openDebtModal(null, 'receivable')" class="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 shadow shadow-brand-500/10 whitespace-nowrap">
                        <i data-lucide="plus" class="w-4.5 h-4.5"></i>
                        <span>Add Receivable</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${recCardsHtml}
        </div>
    `;

    // Bind search box listener
    const searchBox = document.getElementById('rec-search-box');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => {
            state.receivableSearch = e.target.value;
            renderReceivables();
        });
    }

    lucide.createIcons();
}

function openPersonLedger(id) {
    state.selectedDebtId = id;
    switchView('person-ledger');
}

function showTransactionDetails(txId) {
    const tx = state.transactions.find(t => t.id === txId) || 
               (state.selectedEventDetails && state.selectedEventDetails.transactions.find(t => t.id === txId));
    if (!tx) return;
    
    document.getElementById('dt-note').textContent = tx.note || 'No description';
    
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    document.getElementById('dt-amount').textContent = formatCurrency(tx.amount);
    
    const typeEl = document.getElementById('dt-type');
    typeEl.textContent = tx.type;
    if (tx.type === 'income') {
        typeEl.className = "font-bold text-right uppercase tracking-wider text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50";
    } else {
        typeEl.className = "font-bold text-right uppercase tracking-wider text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200/50";
    }
    
    document.getElementById('dt-category').textContent = tx.category_name || 'Uncategorized';
    document.getElementById('dt-date').textContent = tx.transaction_date;
    document.getElementById('dt-method').textContent = tx.payment_method;
    
    const eventRow = document.getElementById('dt-event-row');
    const eventEl = document.getElementById('dt-event');
    if (tx.event_name) {
        eventEl.textContent = tx.event_name;
        eventRow.classList.remove('hidden');
    } else {
        eventRow.classList.add('hidden');
    }
    
    const modal = document.getElementById('tx-details-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

// --- RENDER REPORTS AND CHARTS VIEW ---

function renderReports() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-8 animate-fade-in-up";

    // 1. Calculate insights for display
    const selectedMonth = state.selectedMonth; // YYYY-MM
    const thisMonthTxs = state.transactions.filter(t => t.transaction_date.substring(0, 7) === selectedMonth);
    const expensesOnly = thisMonthTxs.filter(t => t.type === 'expense');
    const incomeOnly = thisMonthTxs.filter(t => t.type === 'income');

    const totalIncome = incomeOnly.reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = expensesOnly.reduce((sum, t) => sum + t.amount, 0);
    const savings = totalIncome - totalExpense;
    const savingsPct = totalIncome > 0 ? ((savings / totalIncome) * 100) : 0;

    // Generate smart insight text bullets
    let insightsHtml = '';
    const insightsList = [];

    if (totalExpense > 0) {
        // Find top expense category
        const catMap = {};
        expensesOnly.forEach(tx => {
            catMap[tx.category_name] = (catMap[tx.category_name] || 0) + tx.amount;
        });
        const sortedCats = Object.entries(catMap).sort((a,b) => b[1] - a[1]);
        if (sortedCats.length > 0) {
            insightsList.push(`Your top expense category is <span class="text-slate-900 font-bold">${sortedCats[0][0]}</span> representing <span class="text-brand-600 font-bold">₹${sortedCats[0][1].toLocaleString('en-IN')}</span>.`);
        }

        // Check exceeded budgets
        const exceeded = state.budgets.filter(b => b.status === 'Exceeded');
        if (exceeded.length > 0) {
            insightsList.push(`You have exceeded budgets in <span class="text-dangerRed font-bold">${exceeded.length} categories</span>. ${exceeded.map(b => b.category_name).join(', ')}.`);
        } else {
            insightsList.push(`<span class="text-successGreen font-bold">Great job!</span> You have kept all category spends within budget limits so far this month.`);
        }

        // Savings rate feedback
        if (savingsPct > 20) {
            insightsList.push(`Your savings rate is <span class="text-successGreen font-bold">${savingsPct.toFixed(0)}%</span>. Excellent job maintaining financial discipline!`);
        } else if (savingsPct > 0) {
            insightsList.push(`You saved <span class="text-slate-800 font-bold">${savingsPct.toFixed(0)}%</span> of your earnings this month. Try trimming top categories to hit a 20% savings goal.`);
        } else if (totalIncome > 0) {
            insightsList.push(`<span class="text-dangerRed font-bold">Alert!</span> Your expenses exceeded income by <span class="text-dangerRed font-bold">₹${Math.abs(savings).toLocaleString('en-IN')}</span>.`);
        }
    } else {
        insightsList.push(`No expense data available for ${selectedMonth} to compile trends.`);
    }

    if (insightsList.length > 0) {
        insightsHtml = `<ul class="list-disc pl-5 space-y-2 text-sm text-slate-500 font-medium">`;
        insightsList.forEach(ins => {
            insightsHtml += `<li class="leading-relaxed">${ins}</li>`;
        });
        insightsHtml += `</ul>`;
    }

    container.innerHTML = `
        <!-- Filter Bar -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <label class="text-xs uppercase tracking-wider text-slate-400 font-bold">Report Period:</label>
                <input type="month" id="reports-month-select" value="${selectedMonth}" class="bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-brand-500 text-slate-800 font-semibold shadow-sm">
            </div>
        </div>

        <!-- Charts Workspace -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Spending trend line (Full-width equivalent) -->
            <div class="col-span-1 lg:col-span-2 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-5">Daily Spending Pattern</h4>
                <div id="trend-line-chart" class="w-full min-h-[300px]">
                    <!-- Line chart rendered -->
                </div>
            </div>

            <!-- Category Breakdown donut -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-5 font-outfit">Category Breakdown</h4>
                    <div id="reports-donut-chart" class="flex justify-center items-center py-4">
                        <!-- Donut rendered -->
                    </div>
                </div>
            </div>

            <!-- Budgets vs Actual side by side bar chart -->
            <div class="col-span-1 lg:col-span-2 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-5">Budget vs Real Expenses</h4>
                <div id="budget-bar-chart" class="w-full min-h-[300px]">
                    <!-- Bar chart rendered -->
                </div>
            </div>

            <!-- Automated Insights -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5"><i data-lucide="lightbulb" class="w-4.5 h-4.5 text-brand-500"></i> Smart Insights</h4>
                    <div class="border-t border-slate-100 pt-4">
                        ${insightsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    
    // Wire month selector
    document.getElementById('reports-month-select').addEventListener('change', async (e) => {
        state.selectedMonth = e.target.value;
        showAppLoading(true);
        await fetchTransactions();
        await fetchBudgets();
        renderReports();
        showAppLoading(false);
    });

    // Render Charts
    renderReportsLineChart(expensesOnly, selectedMonth);
    renderReportsDonutChart(expensesOnly);
    renderReportsBarChart();
}

function renderReportsLineChart(txs, month) {
    const chartEl = document.getElementById('trend-line-chart');
    
    // Extract year/month
    const [year, mon] = month.split('-');
    const daysInMonth = new Date(year, mon, 0).getDate();
    
    // Seed days array
    const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
    const dailyExpenses = Array(daysInMonth).fill(0);
    const dailyIncome = Array(daysInMonth).fill(0);

    // Group actual transactions
    state.transactions.forEach(t => {
        if (t.transaction_date.substring(0, 7) !== month) return;
        const day = parseInt(t.transaction_date.substring(8, 10));
        if (day >= 1 && day <= daysInMonth) {
            if (t.type === 'expense') {
                dailyExpenses[day - 1] += t.amount;
            } else {
                dailyIncome[day - 1] += t.amount;
            }
        }
    });

    const options = {
        series: [
            { name: 'Income', data: dailyIncome },
            { name: 'Expenses', data: dailyExpenses }
        ],
        chart: {
            type: 'area',
            height: 300,
            toolbar: { show: false },
            foreColor: '#64748B'
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2.5 },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.25,
                opacityTo: 0.02,
                stops: [0, 90, 100]
            }
        },
        colors: ['#10B981', '#8B5CF6'],
        xaxis: {
            categories: labels,
            title: { text: 'Day of Month', style: { color: '#64748B' } }
        },
        yaxis: {
            title: { text: 'Amount (₹)', style: { color: '#64748B' } },
            labels: {
                formatter: function (val) {
                    return '₹' + Math.round(val);
                }
            }
        },
        grid: {
            borderColor: '#E2E8F0',
            strokeDashArray: 4
        },
        theme: { mode: 'light' }
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
}

function renderReportsDonutChart(expenses) {
    const chartEl = document.getElementById('reports-donut-chart');
    const catMap = {};
    expenses.forEach(tx => {
        catMap[tx.category_name] = (catMap[tx.category_name] || 0) + tx.amount;
    });

    const categories = Object.keys(catMap);
    const series = Object.values(catMap);

    if (categories.length === 0) {
        chartEl.innerHTML = `<p class="text-xs text-slate-400 py-12 text-center">No expense logs for donut breakdown</p>`;
        return;
    }

    const options = {
        series: series,
        labels: categories,
        chart: {
            type: 'donut',
            height: 250,
            foreColor: '#64748B'
        },
        dataLabels: { enabled: false },
        plotOptions: {
            pie: {
                donut: {
                    size: '72%',
                    labels: {
                        show: true,
                        name: { show: true, fontSize: '12px', color: '#64748B' },
                        value: { 
                            show: true, 
                            fontSize: '18px', 
                            fontWeight: 700, 
                            color: '#0F172A',
                            formatter: function (val) {
                                return '₹' + parseFloat(val).toLocaleString('en-IN');
                            }
                        },
                        total: {
                            show: true,
                            label: 'Expenses',
                            formatter: function (w) {
                                return '₹' + w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                            }
                        }
                    }
                }
            }
        },
        stroke: { show: true, colors: ['#FFFFFF'], width: 3 },
        colors: ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6', '#6366F1', '#A855F7'],
        legend: { position: 'bottom', horizontalAlign: 'center', fontSize: '11px' },
        theme: { mode: 'light' }
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
}

function renderReportsBarChart() {
    const chartEl = document.getElementById('budget-bar-chart');
    
    const categories = state.budgets.map(b => b.category_name);
    const planned = state.budgets.map(b => b.planned_amount);
    const spent = state.budgets.map(b => b.spent_amount);

    if (categories.length === 0) {
        chartEl.innerHTML = `<p class="text-xs text-slate-400 py-12 text-center">No budgets created to analyze</p>`;
        return;
    }

    const options = {
        series: [
            { name: 'Planned Budget', data: planned },
            { name: 'Actual Expenses', data: spent }
        ],
        chart: {
            type: 'bar',
            height: 300,
            toolbar: { show: false },
            foreColor: '#64748B'
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '55%',
                endingShape: 'rounded',
                borderRadius: 4
            }
        },
        dataLabels: { enabled: false },
        stroke: { show: true, width: 2, colors: ['transparent'] },
        colors: ['#E2E8F0', '#8B5CF6'],
        xaxis: { categories: categories },
        yaxis: {
            title: { text: 'Amount (₹)', style: { color: '#64748B' } },
            labels: {
                formatter: function (val) {
                    return '₹' + Math.round(val);
                }
            }
        },
        fill: { opacity: 1 },
        grid: { borderColor: '#E2E8F0', strokeDashArray: 4 },
        theme: { mode: 'light' }
    };

    const chart = new ApexCharts(chartEl, options);
    chart.render();
}

// --- RENDER SETTINGS VIEW ---

function renderSettings() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";

    let summaryRows = '';
    const summaries = state.monthly_summaries || [];
    
    if (summaries.length === 0) {
        summaryRows = `
            <tr>
                <td colspan="4" class="py-6 text-center text-xs text-slate-400">No archived month cycles recorded.</td>
            </tr>
        `;
    } else {
        summaries.forEach(s => {
            const isSavingPos = s.savings >= 0;
            summaryRows += `
                <tr class="text-sm border-b border-slate-100 hover:bg-slate-50">
                    <td class="py-3 px-4 font-bold text-slate-800 font-outfit">${s.month}</td>
                    <td class="py-3 px-4 text-emerald-600 font-semibold font-outfit">₹${s.total_income.toLocaleString('en-IN')}</td>
                    <td class="py-3 px-4 text-rose-600 font-semibold font-outfit">₹${s.total_expense.toLocaleString('en-IN')}</td>
                    <td class="py-3 px-4 font-bold font-outfit ${isSavingPos ? 'text-emerald-600' : 'text-dangerRed'}">
                        ₹${s.savings.toLocaleString('en-IN')}
                    </td>
                </tr>
            `;
        });
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- User profile stats -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 space-y-4">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">User Profile</h4>
                <div class="border-t border-slate-100 pt-4 space-y-3">
                    <div>
                        <p class="text-[10px] uppercase font-bold text-slate-400">Username</p>
                        <p class="text-sm font-bold text-slate-800 mt-0.5">${state.user.username}</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase font-bold text-slate-400">Email Address</p>
                        <p class="text-sm font-bold text-slate-800 mt-0.5">${state.user.email}</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase font-bold text-slate-400">Mobile Connection</p>
                        <p class="text-sm font-bold text-slate-800 mt-0.5">${state.user.mobile}</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase font-bold text-slate-400">Access Tier</p>
                        <p class="text-xs font-extrabold uppercase mt-0.5 text-brand-600">${state.user.role}</p>
                    </div>
                </div>
            </div>

            <!-- Rollover actions -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Monthly Rollover</h4>
                    <p class="text-xs text-slate-500 leading-relaxed">
                        Rollover records a snapshot of your current month cycle (Income, Spends, Savings) and closes it, archiving the report. All transactions are preserved safely.
                    </p>
                    <div class="border-t border-slate-100 mt-4 pt-4 space-y-4">
                        <div>
                            <label class="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Closing Month Cycle</label>
                            <input type="month" id="rollover-month-input" value="${state.selectedMonth}" class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-brand-500 text-slate-800 font-semibold">
                        </div>
                        <button id="trigger-rollover-btn" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition duration-200 shadow shadow-brand-500/10">
                            Rollover & Snapshot Month
                        </button>
                    </div>
                </div>
            </div>

            <!-- Cycle archive list -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 col-span-1 lg:col-span-3">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Rollover History Archive</h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50">
                                <th class="py-3 px-4">Cycle Month</th>
                                <th class="py-3 px-4">Recorded Income</th>
                                <th class="py-3 px-4">Recorded Spends</th>
                                <th class="py-3 px-4">Month Net Savings</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100/60">
                            ${summaryRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();

    // Attach Rollover action trigger
    document.getElementById('trigger-rollover-btn').addEventListener('click', triggerMonthlyRollover);
}

async function triggerMonthlyRollover() {
    const month = document.getElementById('rollover-month-input').value;
    if (!month) return;
    
    if (!confirm(`Are you sure you want to rollover and freeze summary records for ${month}?`)) {
        return;
    }

    showAppLoading(true);
    try {
        const res = await fetch('/api/rollover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month })
        });
        const result = await res.json();
        
        if (result.success) {
            showToast(`Rollover snapshot logged for ${month}!`, 'success');
            await fetchMonthlySummaries();
            renderSettings();
        } else {
            showToast(result.error || 'Rollover failed.', 'danger');
        }
    } catch (err) {
        showToast('Error during rollover connection.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// --- RENDER HIDDEN ADMIN VIEW ---

function renderAdmin() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";

    let userRows = '';
    state.adminUsers.forEach(u => {
        const isCurrentAdmin = u.id === state.user.id;
        userRows += `
            <tr class="text-sm border-b border-slate-100 hover:bg-slate-50">
                <td class="py-3.5 px-4 font-bold text-slate-900">${u.username}</td>
                <td class="py-3.5 px-4 text-xs text-slate-500">${u.email}</td>
                <td class="py-3.5 px-4 text-xs text-slate-500">${u.mobile}</td>
                <td class="py-3.5 px-4 text-center">
                    <select onchange="updateUserRole(${u.id}, this.value)" ${isCurrentAdmin ? 'disabled' : ''} class="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs focus:outline-none focus:border-brand-500 text-slate-800 ${isCurrentAdmin ? 'opacity-50 cursor-not-allowed' : ''}">
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td class="py-3.5 px-4 text-center text-xs font-bold text-brand-600 font-outfit">
                    ${u.stats.transactions} tx / ${u.stats.budgets} budgets / ${u.stats.debts} debts
                </td>
                <td class="py-3.5 px-4 text-right">
                    <button onclick="viewUserDetails(${u.id})" class="text-xs text-brand-600 hover:text-brand-700 font-bold hover:underline">
                        Audit Profile
                    </button>
                </td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- User Profiles Table -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 col-span-1 lg:col-span-2">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">System Access Users</h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50">
                                <th class="py-3 px-4">Username</th>
                                <th class="py-3 px-4">Email</th>
                                <th class="py-3 px-4">Mobile</th>
                                <th class="py-3 px-4 text-center">Role Permission</th>
                                <th class="py-3 px-4 text-center">Activity Metrics</th>
                                <th class="py-3 px-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100/60">
                            ${userRows}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- User Detail Panel (Audit Sideview) -->
            <div id="admin-audit-panel" class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                    <i data-lucide="shield-alert" class="w-12 h-12 text-slate-300 mb-3"></i>
                    <h5 class="font-bold text-slate-500">User Audit Portal</h5>
                    <p class="text-xs text-slate-400 max-w-xs mt-1.5 leading-relaxed">
                        Select a user profile from the ledger to audit recent logs, database snapshots, and balances.
                    </p>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
}

async function viewUserDetails(uId) {
    const auditPanel = document.getElementById('admin-audit-panel');
    auditPanel.innerHTML = `
        <div class="flex items-center justify-center py-10">
            <div class="w-8 h-8 rounded-full border-2 border-brand-900 border-t-brand-500 animate-spin"></div>
        </div>
    `;
    
    try {
        const res = await fetch(`/api/admin/users/${uId}`);
        const result = await res.json();
        
        if (result.success) {
            const u = result.user;
            const stats = result.stats;
            const recent = result.recent_transactions;
            
            let recentHtml = '';
            if (recent.length === 0) {
                recentHtml = `<p class="text-xs text-slate-400 text-center py-4">No recent transactions logged.</p>`;
            } else {
                recentHtml = `<div class="space-y-2 max-h-[220px] overflow-y-auto pr-1">`;
                recent.forEach(tx => {
                    const isInc = tx.type === 'income';
                    recentHtml += `
                        <div class="flex justify-between items-center bg-slate-50 border border-slate-200/40 p-2.5 rounded-xl text-xs">
                            <div>
                                <p class="font-semibold text-slate-800 truncate max-w-[120px]">${tx.note || 'No note'}</p>
                                <p class="text-[9px] text-slate-400">${tx.transaction_date}</p>
                            </div>
                            <span class="font-bold font-outfit ${isInc ? 'text-successGreen' : 'text-slate-800'}">
                                ${isInc ? '+' : '-'}₹${tx.amount.toLocaleString('en-IN')}
                            </span>
                        </div>
                    `;
                });
                recentHtml += `</div>`;
            }

            auditPanel.innerHTML = `
                <div class="space-y-5">
                    <div class="pb-3 border-b border-slate-100 flex justify-between items-start">
                        <div>
                            <h5 class="font-bold text-slate-900 text-base">${u.username}</h5>
                            <p class="text-[10px] text-slate-400">UID: ${u.id} | Joined ${u.created_at.substring(0,10)}</p>
                        </div>
                        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-brand-50 border border-brand-200 text-brand-700">${u.role}</span>
                    </div>

                    <!-- mini metrics -->
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                            <p class="text-[9px] text-slate-400 uppercase font-bold">Total Inflow</p>
                            <p class="text-sm font-bold text-emerald-600 font-outfit truncate">₹${stats.total_income.toLocaleString('en-IN')}</p>
                        </div>
                        <div class="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                            <p class="text-[9px] text-slate-400 uppercase font-bold">Total Outflow</p>
                            <p class="text-sm font-bold text-rose-600 font-outfit truncate">₹${stats.total_spent.toLocaleString('en-IN')}</p>
                        </div>
                        <div class="bg-slate-50 border border-slate-100 p-3 rounded-xl col-span-2">
                            <p class="text-[9px] text-slate-400 uppercase font-bold">Calculated Savings</p>
                            <p class="text-sm font-bold text-slate-800 font-outfit truncate">₹${stats.savings.toLocaleString('en-IN')}</p>
                        </div>
                    </div>

                    <div>
                        <h6 class="text-[10px] uppercase font-bold text-slate-400 mb-3.5 tracking-wider">Recent Activity Ledger (Audit)</h6>
                        ${recentHtml}
                    </div>
                </div>
            `;
            lucide.createIcons();
        } else {
            showToast('Failed to load user details.', 'danger');
        }
    } catch (err) {
        showToast('Error loading user record.', 'danger');
    }
}

async function updateUserRole(uId, newRole) {
    showAppLoading(true);
    try {
        const res = await fetch(`/api/admin/users/${uId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        const result = await res.json();
        
        if (result.success) {
            showToast('User permissions updated.', 'success');
            await fetchAdminUsers();
            renderAdmin();
        } else {
            showToast(result.error || 'Failed to update user permissions.', 'danger');
        }
    } catch (err) {
        showToast('Error during role change.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// --- MODAL UTILITIES ---

function openTransactionModal(editTx = null) {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    form.reset();
    
    // Default Date to today
    document.getElementById('tx-date').value = new Date().toISOString().substring(0, 10);
    
    const typeSelect = document.getElementById('tx-type');
    const modalTitle = document.getElementById('modal-title');
    const editIdInput = document.getElementById('edit-tx-id');

    // Populate event dropdown
    const eventSel = document.getElementById('tx-event');
    eventSel.innerHTML = '<option value="">None (Personal)</option>';
    state.events.forEach(e => {
        if (e.status !== 'Completed') {
            eventSel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
        }
    });

    if (editTx) {
        modalTitle.textContent = "Edit Transaction Log";
        editIdInput.value = editTx.id;
        typeSelect.value = editTx.type;
        document.getElementById('tx-amount').value = editTx.amount;
        document.getElementById('tx-payment').value = editTx.payment_method;
        document.getElementById('tx-date').value = editTx.transaction_date;
        document.getElementById('tx-note').value = editTx.note || '';
        document.getElementById('tx-event').value = editTx.event_id || '';
        
        // Load categories and select active one
        populateTransactionCategories(editTx.type, editTx.category_id);
    } else {
        modalTitle.textContent = "Log Transaction";
        editIdInput.value = "";
        typeSelect.value = "expense";
        populateTransactionCategories("expense");
    }

    modal.classList.remove('hidden');
    // Force browser paint reflow to trigger scale animation
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeTransactionModal() {
    const modal = document.getElementById('transaction-modal');
    modal.querySelector('.transform').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

function populateTransactionCategories(type, selectId = null) {
    const catSelect = document.getElementById('tx-category');
    catSelect.innerHTML = '';
    
    const filtered = state.categories.filter(c => c.type === type);
    filtered.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (selectId && parseInt(selectId) === c.id) {
            opt.selected = true;
        }
        catSelect.appendChild(opt);
    });
}

async function saveTransaction(e) {
    e.preventDefault();
    const id = document.getElementById('edit-tx-id').value;
    const type = document.getElementById('tx-type').value;
    const amount = document.getElementById('tx-amount').value;
    const category_id = document.getElementById('tx-category').value;
    const payment_method = document.getElementById('tx-payment').value;
    const transaction_date = document.getElementById('tx-date').value;
    const note = document.getElementById('tx-note').value.trim();
    const event_val = document.getElementById('tx-event').value;
    const event_id = event_val ? parseInt(event_val) : null;

    const payload = { type, amount, category_id, payment_method, transaction_date, note, event_id };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/transactions/${id}` : '/api/transactions';

    showAppLoading(true);
    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result.success) {
            showToast(result.message || 'Transaction saved successfully.', 'success');
            closeTransactionModal();
            // Refresh view
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to save transaction.', 'danger');
        }
    } catch (err) {
        showToast('Connection error while saving.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

async function deleteTransactionPrompt(id) {
    if (!confirm('Are you sure you want to delete this transaction and move it to Trash?')) return;
    
    showAppLoading(true);
    try {
        const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
        const result = await res.json();
        
        if (result.success) {
            showToast('Transaction moved to Trash successfully.', 'success');
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Delete failed.', 'danger');
        }
    } catch (err) {
        showToast('Connection error during deletion.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

function editTransaction(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (tx) {
        openTransactionModal(tx);
    }
}

// Budget Modal operations
function openBudgetModal() {
    const modal = document.getElementById('budget-modal');
    const catSelect = document.getElementById('budget-category');
    catSelect.innerHTML = '';
    
    // Expense categories only
    state.categories.filter(c => c.type === 'expense').forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        catSelect.appendChild(opt);
    });

    document.getElementById('budget-month').value = state.selectedMonth;
    document.getElementById('budget-amount').value = '';

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeBudgetModal() {
    const modal = document.getElementById('budget-modal');
    modal.querySelector('.transform').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

function editBudget(catId, currentVal) {
    openBudgetModal();
    document.getElementById('budget-category').value = catId;
    document.getElementById('budget-amount').value = currentVal;
}

async function saveBudget(e) {
    e.preventDefault();
    const category_id = document.getElementById('budget-category').value;
    const month = document.getElementById('budget-month').value;
    const planned_amount = document.getElementById('budget-amount').value;

    showAppLoading(true);
    try {
        const res = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id, month, planned_amount })
        });
        const result = await res.json();
        
        if (result.success) {
            showToast('Budget configured successfully.', 'success');
            closeBudgetModal();
            // sync active view month
            state.selectedMonth = month;
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to save budget.', 'danger');
        }
    } catch (err) {
        showToast('Error saving budget limit.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// Debt Modal operations
function openDebtModal(editDb = null, contextType = null) {
    const modal = document.getElementById('debt-modal');
    const form = document.getElementById('debt-form');
    form.reset();
    
    document.getElementById('debt-due').value = new Date().toISOString().substring(0, 10);
    const title = document.getElementById('debt-modal-title');
    const editIdInput = document.getElementById('edit-debt-id');
    const typeInput = document.getElementById('debt-type-hidden');

    if (editDb) {
        contextType = editDb.type;
        title.textContent = editDb.type === 'debt' ? "Edit Debt Record" : "Edit Receivable Record";
        editIdInput.value = editDb.id;
        typeInput.value = editDb.type;
        document.getElementById('debt-person').value = editDb.person_name;
        document.getElementById('debt-total').value = editDb.total_amount;
        document.getElementById('debt-pending').value = editDb.pending_amount;
        document.getElementById('debt-due').value = editDb.due_date;
        document.getElementById('debt-status').value = editDb.status;
        
        // Remove type prefix if present in notes
        const displayNotes = editDb.notes ? editDb.notes.replace(/^\[LENT\]\s*|^\[BORROWED\]\s*/, '') : '';
        document.getElementById('debt-notes').value = displayNotes;
    } else {
        if (!contextType) {
            contextType = state.activeView === 'receivables' ? 'receivable' : 'debt';
        }
        title.textContent = contextType === 'debt' ? "Add Debt Record" : "Add Receivable Record";
        editIdInput.value = "";
        typeInput.value = contextType;
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeDebtModal() {
    const modal = document.getElementById('debt-modal');
    modal.querySelector('.transform').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

function editDebt(id) {
    const db = state.debts.find(d => d.id === id) || state.receivables.find(r => r.id === id);
    if (db) {
        openDebtModal(db, db.type);
    }
}

function editDebtRecord(id) {
    const db = state.debts.find(d => d.id === id) || state.receivables.find(r => r.id === id);
    if (db) {
        openDebtModal(db, db.type);
    }
}

async function deleteDebtRecord(id) {
    if (!confirm("Are you sure you want to delete this registry account and move it to Trash?")) return;
    showAppLoading(true);
    try {
        const res = await fetch(`/api/debts/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            await loadViewData(state.activeView);
        } else {
            showToast(result.error, 'danger');
        }
    } catch (err) {
        showToast('Error deleting record.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

async function saveDebt(e) {
    e.preventDefault();
    const id = document.getElementById('edit-debt-id').value;
    const type_ = document.getElementById('debt-type-hidden').value;
    const person_name = document.getElementById('debt-person').value.trim();
    const total_amount = parseFloat(document.getElementById('debt-total').value);
    const pending_val = document.getElementById('debt-pending').value;
    const pending_amount = pending_val !== '' ? parseFloat(pending_val) : total_amount;
    const due_date = document.getElementById('debt-due').value;
    const status = document.getElementById('debt-status').value;
    const raw_notes = document.getElementById('debt-notes').value.trim();

    const notes = type_ === 'receivable' ? `[LENT] ${raw_notes}` : `[BORROWED] ${raw_notes}`;

    const payload = { person_name, total_amount, pending_amount, due_date, status, notes, type: type_ };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/debts/${id}` : '/api/debts';

    showAppLoading(true);
    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result.success) {
            showToast(result.message || 'Debt record saved.', 'success');
            closeDebtModal();
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to save debt.', 'danger');
        }
    } catch (err) {
        showToast('Connection error saving debt.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

async function payOffDebtPrompt(debtId, currentPending, personName, isLent) {
    const inputVal = prompt(`Enter payoff amount (Remaining pending: ₹${currentPending}):`, currentPending);
    if (inputVal === null) return;
    
    const payVal = parseFloat(inputVal);
    if (isNaN(payVal) || payVal <= 0 || payVal > currentPending) {
        showToast('Invalid payoff amount.', 'warning');
        return;
    }

    const newPending = currentPending - payVal;
    
    // Ask if they want to log this payoff as a transaction (auto logging feature!)
    const logTx = confirm(`Would you like to automatically log a transaction of ₹${payVal} for this payoff?`);

    showAppLoading(true);
    try {
        // 1. Update debt pending amount
        const dbObj = state.debts.find(d => d.id === debtId);
        const notesWithoutPrefix = dbObj.notes ? dbObj.notes.replace(/^\[LENT\]\s*|^\[BORROWED\]\s*/, '') : '';
        const notesPrefix = isLent ? '[LENT]' : '[BORROWED]';
        const updatedNotes = `${notesPrefix} ${notesWithoutPrefix} (Paid: ₹${payVal})`;

        const debtRes = await fetch(`/api/debts/${debtId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                person_name: dbObj.person_name,
                total_amount: dbObj.total_amount,
                pending_amount: newPending,
                due_date: dbObj.due_date,
                status: newPending === 0 ? 'Paid' : dbObj.status,
                notes: updatedNotes
            })
        });
        const debtResult = await debtRes.json();

        if (debtResult.success) {
            showToast(`Debt pending updated. Paid ₹${payVal}.`, 'success');
            
            // 2. Optional: Log transaction
            if (logTx) {
                // Find category to log
                let catName = isLent ? 'Other Income' : 'Other Expense';
                let txType = isLent ? 'income' : 'expense';
                let matchedCat = state.categories.find(c => c.name === catName && c.type === txType);
                if (!matchedCat) {
                    matchedCat = state.categories[0]; // Fallback
                }
                
                await fetch('/api/transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: payVal,
                        type: txType,
                        category_id: matchedCat.id,
                        note: isLent ? `Debt payoff from ${personName}` : `Debt payoff to ${personName}`,
                        payment_method: 'UPI',
                        transaction_date: new Date().toISOString().substring(0, 10)
                    })
                });
            }

            await loadViewData(state.activeView);
        } else {
            showToast(debtResult.error || 'Payoff failed.', 'danger');
        }
    } catch (err) {
        showToast('Payoff connection error.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// Category custom creation
function openCategoryModal() {
    const modal = document.getElementById('category-modal');
    document.getElementById('category-form').reset();
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    modal.querySelector('.transform').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

async function createCustomCategory(e) {
    e.preventDefault();
    const name = document.getElementById('new-cat-name').value.trim();
    const type = document.getElementById('new-cat-type').value;

    showAppLoading(true);
    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type })
        });
        const result = await res.json();
        
        if (result.success) {
            showToast(`Category "${name}" created!`, 'success');
            closeCategoryModal();
            // Reload categories
            await fetchCategories();
            // Refresh current view
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to create category.', 'danger');
        }
    } catch (err) {
        showToast('Error creating category.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// --- VISUAL UI TRANSITIONS AND TOASTS ---

function showAppLoading(show) {
    const spinner = document.getElementById('app-loading');
    if (show) {
        spinner.classList.remove('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

function showAuthScreen(show) {
    const screen = document.getElementById('auth-screen');
    if (show) {
        screen.classList.remove('hidden');
        setTimeout(() => {
            screen.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
        }, 50);
    } else {
        screen.querySelector('.transform').classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            screen.classList.add('hidden');
        }, 300);
    }
}

function showMainScreen(show) {
    const screen = document.getElementById('main-screen');
    if (show) {
        screen.classList.remove('hidden');
    } else {
        screen.classList.add('hidden');
    }
}

function toggleAuthForm(formName) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const subtitle = document.getElementById('auth-subtitle');
    
    if (formName === 'login') {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        subtitle.textContent = "Your Premium Personal Finance Companion";
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        subtitle.textContent = "Create an elegant account today";
    }
    lucide.createIcons();
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let icon = 'check-circle';
    let bgBorder = 'bg-emerald-50 border-emerald-200/50 text-emerald-800 shadow-emerald-100/50';
    if (type === 'danger') {
        icon = 'alert-triangle';
        bgBorder = 'bg-rose-50 border-rose-200/50 text-rose-800 shadow-rose-100/50';
    } else if (type === 'warning') {
        icon = 'info';
        bgBorder = 'bg-amber-50 border-amber-200/50 text-amber-800 shadow-amber-100/50';
    }

    toast.className = `flex items-center gap-3 px-4 py-3.5 border rounded-xl shadow-xl glass-panel pointer-events-auto ${bgBorder} animate-slide-in`;
    toast.innerHTML = `
        <i data-lucide="${icon}" class="w-5 h-5 flex-shrink-0"></i>
        <p class="text-xs font-semibold leading-normal">${message}</p>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    // Auto remove toast
    setTimeout(() => {
        toast.classList.replace('animate-slide-in', 'animate-slide-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// --- PERSON LEDGER PROFILE RENDER ---
function renderPersonLedger() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";
    
    const debt = state.selectedDebt;
    if (!debt) {
        container.innerHTML = `<div class="p-6 text-center text-slate-500">No profile details retrieved.</div>`;
        return;
    }
    
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    const isDebt = debt.type === 'debt';
    const labelType = isDebt ? 'Debt (Payable)' : 'Receivable';
    const colorClass = isDebt ? 'text-dangerRed' : 'text-successGreen';
    
    let ledgerRowsHtml = '';
    if (debt.ledger.length === 0) {
        ledgerRowsHtml = `
            <tr>
                <td colspan="5" class="py-10 text-center text-slate-400 text-sm">
                    <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
                    No ledger transactions logged for this account yet.
                </td>
            </tr>
        `;
    } else {
        debt.ledger.forEach(entry => {
            const isIncrement = entry.type === 'borrowed' || entry.type === 'lent';
            const sign = isIncrement ? '+' : '-';
            const amtColor = isIncrement ? (isDebt ? 'text-dangerRed' : 'text-successGreen') : (isDebt ? 'text-successGreen' : 'text-slate-700');
            const typeBadge = isIncrement ? 'bg-slate-100 text-slate-800 border border-slate-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50';
            
            let eventTag = '';
            if (entry.event_name) {
                eventTag = `
                    <span class="inline-flex items-center gap-1 text-[10px] text-brand-600 bg-brand-50 border border-brand-200/50 px-1.5 py-0.5 rounded-md font-semibold cursor-pointer" onclick="openEventDashboard(${entry.event_id})">
                        <i data-lucide="calendar" class="w-3 h-3"></i>
                        ${entry.event_name}
                    </span>
                `;
            }

            ledgerRowsHtml += `
                <tr class="text-sm group hover:bg-slate-50/50 transition duration-150">
                    <td class="py-3 px-2 font-bold font-outfit text-slate-500">${entry.entry_date}</td>
                    <td class="py-3 px-2">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${typeBadge}">
                            ${entry.type}
                        </span>
                    </td>
                    <td class="py-3 px-2">
                        <p class="text-slate-800 font-semibold">${entry.notes || '—'}</p>
                        <div class="mt-1">${eventTag}</div>
                    </td>
                    <td class="py-3 px-2 font-bold font-outfit text-right ${amtColor}">${sign}${formatCurrency(entry.amount)}</td>
                    <td class="py-3 px-2 text-right">
                        <div class="flex items-center justify-end gap-2.5">
                            <button onclick="openLedgerModal(${entry.id}, ${debt.id})" class="text-slate-400 hover:text-slate-800 focus:outline-none transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                            <button onclick="deleteLedgerEntry(${entry.id})" class="text-slate-400 hover:text-rose-600 focus:outline-none transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    container.innerHTML = `
        <!-- Header and actions -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <button onclick="switchView('${isDebt ? 'debts' : 'receivables'}')" class="text-xs text-brand-600 hover:underline flex items-center gap-1 font-semibold mb-1 focus:outline-none">
                    <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Back to list
                </button>
                <h3 class="text-2xl font-extrabold text-slate-900 tracking-tight font-outfit flex items-center gap-2">
                    <span>${debt.person_name}</span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 uppercase">${labelType}</span>
                </h3>
            </div>
            <div class="flex items-center gap-3">
                <button onclick="editDebtRecord(${debt.id})" class="px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5 focus:outline-none">
                    <i data-lucide="edit-3" class="w-4 h-4"></i> Profile Settings
                </button>
                <button onclick="openLedgerModal(null, ${debt.id})" class="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold rounded-xl text-xs transition flex items-center gap-1.5 shadow shadow-brand-500/10 focus:outline-none">
                    <i data-lucide="plus" class="w-4.5 h-4.5"></i> Log Entry
                </button>
            </div>
        </div>

        <!-- Metrics summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Outstanding</span>
                <h4 class="text-2xl font-extrabold ${colorClass} font-outfit truncate mt-1">${formatCurrency(debt.pending_amount)}</h4>
            </div>
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">${isDebt ? 'Total Borrowed' : 'Total Lent'}</span>
                <h4 class="text-2xl font-extrabold text-slate-800 font-outfit truncate mt-1">${formatCurrency(debt.total_amount)}</h4>
            </div>
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">${isDebt ? 'Total Repaid' : 'Total Received'}</span>
                <h4 class="text-2xl font-extrabold text-emerald-600 font-outfit truncate mt-1">${formatCurrency(debt.total_paid_or_received)}</h4>
            </div>
        </div>

        <!-- Ledger entries table -->
        <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/50">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Chronological Ledger Timeline</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            <th class="py-2.5 px-2">Date</th>
                            <th class="py-2.5 px-2">Type</th>
                            <th class="py-2.5 px-2">Description</th>
                            <th class="py-2.5 px-2 text-right">Amount</th>
                            <th class="py-2.5 px-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100/60">
                        ${ledgerRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    lucide.createIcons();
}

function openLedgerModal(entryId = null, debtId = null) {
    const modal = document.getElementById('ledger-modal');
    const form = document.getElementById('ledger-form');
    form.reset();
    
    document.getElementById('ledger-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('ledger-debt-id').value = debtId || "";
    document.getElementById('edit-ledger-id').value = entryId || "";
    
    // Populate event options
    const eventSel = document.getElementById('ledger-event');
    eventSel.innerHTML = '<option value="">None (Personal)</option>';
    state.events.forEach(e => {
        if (e.status !== 'Completed') {
            eventSel.innerHTML += `<option value="${e.id}">${e.name}</option>`;
        }
    });

    const parentDebt = state.debts.find(d => d.id === debtId) || state.receivables.find(r => r.id === debtId);
    const typeSel = document.getElementById('ledger-type');
    typeSel.innerHTML = '';
    
    if (parentDebt) {
        if (parentDebt.type === 'debt') {
            typeSel.innerHTML = `
                <option value="borrowed">Borrowed (Increase Debt)</option>
                <option value="repaid">Repaid (Decrease Debt)</option>
            `;
        } else {
            typeSel.innerHTML = `
                <option value="lent">Lent (Increase Receivable)</option>
                <option value="received">Received (Decrease Receivable)</option>
            `;
        }
    }

    if (entryId && parentDebt) {
        const entry = state.selectedDebt && state.selectedDebt.ledger.find(e => e.id === entryId);
        if (entry) {
            document.getElementById('ledger-modal-title').textContent = "Edit Ledger Entry";
            typeSel.value = entry.type;
            document.getElementById('ledger-amount').value = entry.amount;
            document.getElementById('ledger-date').value = entry.entry_date;
            document.getElementById('ledger-notes').value = entry.notes || "";
            document.getElementById('ledger-event').value = entry.event_id || "";
        }
    } else {
        document.getElementById('ledger-modal-title').textContent = "Add Ledger Entry";
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeLedgerModal() {
    const modal = document.getElementById('ledger-modal');
    modal.querySelector('.transform').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

async function saveLedger(e) {
    e.preventDefault();
    const id = document.getElementById('edit-ledger-id').value;
    const debt_id = document.getElementById('ledger-debt-id').value;
    const type = document.getElementById('ledger-type').value;
    const amount = parseFloat(document.getElementById('ledger-amount').value);
    const entry_date = document.getElementById('ledger-date').value;
    const notes = document.getElementById('ledger-notes').value.trim();
    const event_val = document.getElementById('ledger-event').value;
    const event_id = event_val ? parseInt(event_val) : null;

    const payload = { type, amount, entry_date, notes, event_id };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/ledger-entries/${id}` : `/api/debts/${debt_id}/ledger`;

    showAppLoading(true);
    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result.success) {
            showToast(result.message || 'Ledger entry saved.', 'success');
            closeLedgerModal();
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to save ledger entry.', 'danger');
        }
    } catch (err) {
        showToast('Connection error saving ledger entry.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

async function deleteLedgerEntry(entryId) {
    if (!confirm("Are you sure you want to delete this ledger entry and move it to Trash?")) return;
    showAppLoading(true);
    try {
        const res = await fetch(`/api/ledger-entries/${entryId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            showToast(result.message || 'Entry moved to Trash.', 'success');
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to delete ledger entry.', 'danger');
        }
    } catch (err) {
        showToast('Connection error deleting entry.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// --- EVENTS MODULE RENDER ---
function renderEvents() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";
    
    let eventsHtml = '';
    if (state.events.length === 0) {
        eventsHtml = `
            <div class="col-span-full bg-white border border-slate-200/60 rounded-2xl p-10 text-center flex flex-col items-center justify-center shadow-sm">
                <i data-lucide="calendar" class="w-10 h-10 text-slate-300 mb-3"></i>
                <p class="font-bold text-slate-800 text-base">No events created yet</p>
                <p class="text-xs text-slate-400 mt-1 mb-4">Organize finances for your trips, weddings, or birthday parties.</p>
                <button onclick="openEventModal()" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition shadow shadow-brand-500/10">
                    Create Event
                </button>
            </div>
        `;
    } else {
        state.events.forEach(e => {
            const isCompleted = e.status === 'Completed';
            let badgeClass = isCompleted ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : 'bg-brand-50 text-brand-700 border border-brand-200/50';
            
            eventsHtml += `
                <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50 flex flex-col justify-between glow-card relative hover:shadow-lg transition duration-200">
                    <div class="absolute top-5 right-5">
                        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${badgeClass}">
                            ${e.status}
                        </span>
                    </div>

                    <div class="mb-4 cursor-pointer" onclick="openEventDashboard(${e.id})">
                        <h4 class="text-base font-bold text-slate-900 mt-0.5 hover:text-brand-600">${e.name}</h4>
                        <p class="text-xs text-slate-500 mt-2 line-clamp-2">${e.description || 'No description provided.'}</p>
                    </div>

                    <div class="pt-4 border-t border-slate-100/60 flex items-center justify-between text-xs">
                        <span class="text-slate-400">Created: <span class="font-semibold text-slate-500">${e.created_at || '—'}</span></span>
                        <div class="flex items-center gap-2">
                            <button onclick="openEventDashboard(${e.id})" class="text-xs text-brand-600 hover:text-brand-700 font-bold focus:outline-none">
                                Details
                            </button>
                            ${isCompleted ? '' : `
                                <span class="text-slate-200">|</span>
                                <button onclick="completeEvent(${e.id})" class="text-xs text-emerald-600 hover:text-emerald-700 font-bold focus:outline-none">
                                    Freeze
                                </button>
                                <span class="text-slate-200">|</span>
                                <button onclick="editEventRecord(${e.id})" class="text-xs text-slate-400 hover:text-slate-800 focus:outline-none">
                                    Edit
                                </button>
                                <span class="text-slate-200">|</span>
                                <button onclick="deleteEventRecord(${e.id})" class="text-xs text-rose-500 hover:text-rose-700 focus:outline-none">
                                    Delete
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = `
        <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Active and Completed Events</h4>
            <button onclick="openEventModal()" class="px-4 py-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 shadow shadow-brand-500/10">
                <i data-lucide="plus" class="w-4 h-4"></i>
                <span>Create Event</span>
            </button>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${eventsHtml}
        </div>
    `;
    
    lucide.createIcons();
}

function openEventModal(editEvent = null) {
    const modal = document.getElementById('event-modal');
    const form = document.getElementById('event-form');
    form.reset();
    
    const title = document.getElementById('event-modal-title');
    const editIdInput = document.getElementById('edit-event-id');

    if (editEvent) {
        title.textContent = "Edit Event Details";
        editIdInput.value = editEvent.id;
        document.getElementById('event-name-input').value = editEvent.name;
        document.getElementById('event-desc-input').value = editEvent.description || "";
    } else {
        title.textContent = "Create Event";
        editIdInput.value = "";
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeEventModal() {
    const modal = document.getElementById('event-modal');
    modal.querySelector('.transform').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

function editEventRecord(id) {
    const ev = state.events.find(e => e.id === id);
    if (ev) {
        openEventModal(ev);
    }
}

async function completeEvent(id) {
    if (!confirm("Are you sure you want to freeze this Event? This will freeze all associated transactions and ledger entries as read-only!")) return;
    showAppLoading(true);
    try {
        const res = await fetch(`/api/events/${id}/complete`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
            showToast('Event frozen successfully.', 'success');
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to complete event.', 'danger');
        }
    } catch (err) {
        showToast('Connection error during completion.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

async function deleteEventRecord(id) {
    if (!confirm("Are you sure you want to delete this Event and move it to Trash? All event associations will be removed.")) return;
    showAppLoading(true);
    try {
        const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            showToast('Event moved to Trash.', 'success');
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to delete event.', 'danger');
        }
    } catch (err) {
        showToast('Connection error during deletion.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

async function saveEvent(e) {
    e.preventDefault();
    const id = document.getElementById('edit-event-id').value;
    const name = document.getElementById('event-name-input').value.trim();
    const description = document.getElementById('event-desc-input').value.trim();

    const payload = { name, description };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/events/${id}` : '/api/events';

    showAppLoading(true);
    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result.success) {
            showToast(result.message || 'Event saved successfully.', 'success');
            closeEventModal();
            await loadViewData(state.activeView);
        } else {
            showToast(result.error || 'Failed to save event.', 'danger');
        }
    } catch (err) {
        showToast('Connection error saving event.', 'danger');
    } finally {
        showAppLoading(false);
    }
}

// --- EVENT DASHBOARD PROFILE ---
function renderEventDashboard() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-6 animate-fade-in-up";
    
    const details = state.selectedEventDetails;
    if (!details) {
        container.innerHTML = `<div class="p-6 text-center text-slate-500">No event details retrieved.</div>`;
        return;
    }
    
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    const isFrozen = details.event.status === 'Completed';
    const badgeClass = isFrozen ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' : 'bg-brand-50 text-brand-700 border border-brand-200/50';
    
    // Timeline transactions HTML
    let timelineHtml = '';
    if (details.transactions.length === 0) {
        timelineHtml = `
            <div class="py-8 text-center text-slate-400 text-xs">
                <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
                No transactions logged for this event.
            </div>
        `;
    } else {
        timelineHtml = `
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            <th class="py-2.5 px-2">Date</th>
                            <th class="py-2.5 px-2">Type</th>
                            <th class="py-2.5 px-2">Description</th>
                            <th class="py-2.5 px-2 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100/60">
        `;
        details.transactions.forEach(t => {
            const isIncome = t.type === 'income';
            timelineHtml += `
                <tr class="text-xs hover:bg-slate-50/50 transition">
                    <td class="py-3 px-2 font-outfit text-slate-400">${t.transaction_date}</td>
                    <td class="py-3 px-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'}">
                            ${t.type}
                        </span>
                    </td>
                    <td class="py-3 px-2">
                        <p class="font-semibold text-slate-800 cursor-pointer hover:text-brand-600" onclick="showTransactionDetails(${t.id})">${t.note || 'Transaction'}</p>
                        <p class="text-[9px] text-slate-400">${t.category_name}</p>
                    </td>
                    <td class="py-3 px-2 font-bold font-outfit text-right ${isIncome ? 'text-successGreen' : 'text-slate-800'}">
                        ${isIncome ? '+' : '-'}${formatCurrency(t.amount)}
                    </td>
                </tr>
            `;
        });
        timelineHtml += `
                    </tbody>
                </table>
            </div>
        `;
    }

    // Pending debts / receivables HTML
    let pendingHtml = '';
    if (details.debts.length === 0) {
        pendingHtml = `
            <div class="py-8 text-center text-slate-400 text-xs">
                <i data-lucide="check-circle" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
                All clear! No pending payments/receivables.
            </div>
        `;
    } else {
        pendingHtml = `
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            <th class="py-2.5 px-2">Person</th>
                            <th class="py-2.5 px-2">Type</th>
                            <th class="py-2.5 px-2 text-right">Pending Amount</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100/60">
        `;
        details.debts.forEach(d => {
            const isOwed = d.type === 'receivable';
            pendingHtml += `
                <tr class="text-xs hover:bg-slate-50/50 transition">
                    <td class="py-3 px-2">
                        <p class="font-semibold text-slate-800 cursor-pointer hover:text-brand-600" onclick="openPersonLedger(${d.id})">${d.person_name}</p>
                    </td>
                    <td class="py-3 px-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isOwed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                            ${isOwed ? 'Receivable' : 'Debt'}
                        </span>
                    </td>
                    <td class="py-3 px-2 font-bold font-outfit text-right ${isOwed ? 'text-successGreen' : 'text-dangerRed'}">
                        ${formatCurrency(d.pending_amount)}
                    </td>
                </tr>
            `;
        });
        pendingHtml += `
                    </tbody>
                </table>
            </div>
        `;
    }

    container.innerHTML = `
        <!-- Header -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <button onclick="switchView('events')" class="text-xs text-brand-600 hover:underline flex items-center gap-1 font-semibold mb-1 focus:outline-none">
                    <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Back to Events
                </button>
                <h3 class="text-2xl font-extrabold text-slate-900 tracking-tight font-outfit flex items-center gap-2">
                    <span>${details.event.name}</span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-md ${badgeClass} uppercase">${details.event.status}</span>
                </h3>
                <p class="text-xs text-slate-500 mt-1">${details.event.description || 'No description provided.'}</p>
            </div>
            
            ${isFrozen ? '' : `
                <button onclick="completeEvent(${details.event.id})" class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-xl text-xs transition flex items-center gap-1.5 shadow shadow-emerald-500/10 focus:outline-none">
                    <i data-lucide="lock" class="w-4 h-4"></i>
                    <span>Freeze Event</span>
                </button>
            `}
        </div>

        <!-- Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Event Expenses</span>
                <h4 class="text-2xl font-extrabold text-rose-600 font-outfit truncate mt-1">${formatCurrency(details.stats.total_spent)}</h4>
            </div>
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Contributions / Income</span>
                <h4 class="text-2xl font-extrabold text-emerald-600 font-outfit truncate mt-1">${formatCurrency(details.stats.total_received)}</h4>
            </div>
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Outstanding Debt Balance</span>
                <h4 class="text-2xl font-extrabold text-slate-700 font-outfit truncate mt-1">${formatCurrency(details.stats.total_debts_pending)}</h4>
            </div>
        </div>

        <!-- Charts and tables grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Event breakdown Chart -->
            <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col justify-between">
                <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-5">Expense Category Breakdown</h4>
                    <div id="event-donut-chart" class="min-h-[220px] flex items-center justify-center"></div>
                </div>
            </div>

            <!-- Transaction Ledger -->
            <div class="lg:col-span-2 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/60 flex flex-col">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Event Transactions Timeline</h4>
                ${timelineHtml}
            </div>
        </div>

        <!-- Pending payments table -->
        <div class="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-md shadow-slate-100/50">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Event Associated Debts / Receivables</h4>
            ${pendingHtml}
        </div>
    `;

    lucide.createIcons();
    renderEventDonut(details.category_breakdown);
}

function renderEventDonut(breakdown) {
    const chartEl = document.getElementById('event-donut-chart');
    if (!chartEl) return;

    const categories = Object.keys(breakdown);
    const series = Object.values(breakdown);

    if (categories.length === 0) {
        chartEl.innerHTML = `
            <div class="text-center py-10 text-xs text-slate-400 flex flex-col items-center">
                <i data-lucide="pie-chart" class="w-8 h-8 text-slate-300 mb-2"></i>
                No expense logged for this event
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const options = {
        series: series,
        labels: categories,
        chart: {
            type: 'donut',
            height: 220,
            foreColor: '#64748B'
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            width: 2,
            colors: ['#fff']
        },
        colors: ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#3B82F6', '#06B6D4'],
        legend: {
            position: 'bottom',
            fontSize: '11px',
            fontFamily: 'Inter, sans-serif',
            offsetY: 0,
            markers: {
                width: 7,
                height: 7,
                radius: 99
            }
        },
        tooltip: {
            y: {
                formatter: function (val) {
                    return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                }
            }
        }
    };

    if (state.charts.eventDonut) {
        state.charts.eventDonut.destroy();
    }
    state.charts.eventDonut = new ApexCharts(chartEl, options);
    state.charts.eventDonut.render();
}

function openEventDashboard(id) {
    state.selectedEventId = id;
    switchView('event-dashboard');
}

// --- TRASH BIN RENDER ---
function renderTrash() {
    const container = document.getElementById('views-container');
    container.className = "flex-1 p-6 md:p-8 space-y-8 animate-fade-in-up";
    
    const formatCurrency = (val) => {
        return '₹' + parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    const trash = state.trash;
    
    const txRows = (trash.transactions || []).map(t => `
        <tr class="text-xs hover:bg-slate-50/50">
            <td class="py-2.5 px-2 font-semibold text-slate-800">${t.note || 'Transaction'}</td>
            <td class="py-2.5 px-2 uppercase text-[10px] font-bold">${t.type}</td>
            <td class="py-2.5 px-2 font-bold font-outfit">${formatCurrency(t.amount)}</td>
            <td class="py-2.5 px-2 text-slate-400 font-outfit">${t.deleted_at || '—'}</td>
            <td class="py-2.5 px-2 text-right">
                <button onclick="restoreItem('transaction', ${t.id})" class="text-brand-600 hover:text-brand-700 font-bold mr-3 focus:outline-none">Restore</button>
                <button onclick="permanentDeleteItem('transaction', ${t.id})" class="text-rose-600 hover:text-rose-700 font-bold focus:outline-none">Delete</button>
            </td>
        </tr>
    `).join('');

    const debtRows = (trash.debts || []).map(d => `
        <tr class="text-xs hover:bg-slate-50/50">
            <td class="py-2.5 px-2 font-semibold text-slate-800">${d.person_name}</td>
            <td class="py-2.5 px-2 uppercase text-[10px] font-bold">${d.type}</td>
            <td class="py-2.5 px-2 font-bold font-outfit">${formatCurrency(d.pending_amount)}</td>
            <td class="py-2.5 px-2 text-slate-400 font-outfit">${d.deleted_at || '—'}</td>
            <td class="py-2.5 px-2 text-right">
                <button onclick="restoreItem('debt', ${d.id})" class="text-brand-600 hover:text-brand-700 font-bold mr-3 focus:outline-none">Restore</button>
                <button onclick="permanentDeleteItem('debt', ${d.id})" class="text-rose-600 hover:text-rose-700 font-bold focus:outline-none">Delete</button>
            </td>
        </tr>
    `).join('');

    const eventRows = (trash.events || []).map(e => `
        <tr class="text-xs hover:bg-slate-50/50">
            <td class="py-2.5 px-2 font-semibold text-slate-800">${e.name}</td>
            <td class="py-2.5 px-2 text-slate-400 font-outfit">${e.deleted_at || '—'}</td>
            <td class="py-2.5 px-2 text-right">
                <button onclick="restoreItem('event', ${e.id})" class="text-brand-600 hover:text-brand-700 font-bold mr-3 focus:outline-none">Restore</button>
                <button onclick="permanentDeleteItem('event', ${e.id})" class="text-rose-600 hover:text-rose-700 font-bold focus:outline-none">Delete</button>
            </td>
        </tr>
    `).join('');

    const ledgerRows = (trash.ledger_entries || []).map(l => `
        <tr class="text-xs hover:bg-slate-50/50">
            <td class="py-2.5 px-2 font-semibold text-slate-800">${l.notes || 'Ledger Entry'}</td>
            <td class="py-2.5 px-2 uppercase text-[10px] font-bold">${l.type}</td>
            <td class="py-2.5 px-2 font-bold font-outfit">${formatCurrency(l.amount)}</td>
            <td class="py-2.5 px-2 text-slate-400 font-outfit">${l.deleted_at || '—'}</td>
            <td class="py-2.5 px-2 text-right">
                <button onclick="restoreItem('ledger_entry', ${l.id})" class="text-brand-600 hover:text-brand-700 font-bold mr-3 focus:outline-none">Restore</button>
                <button onclick="permanentDeleteItem('ledger_entry', ${l.id})" class="text-rose-600 hover:text-rose-700 font-bold focus:outline-none">Delete</button>
            </td>
        </tr>
    `).join('');

    const hasItems = (trash.transactions || []).length > 0 || 
                     (trash.debts || []).length > 0 || 
                     (trash.events || []).length > 0 || 
                     (trash.ledger_entries || []).length > 0;

    if (!hasItems) {
        container.innerHTML = `
            <div class="bg-white border border-slate-200/60 rounded-2xl p-12 text-center flex flex-col items-center justify-center shadow-sm">
                <i data-lucide="trash-2" class="w-12 h-12 text-slate-300 mb-3 animate-pulse"></i>
                <p class="font-bold text-slate-800 text-base">Your Trash is empty!</p>
                <p class="text-xs text-slate-400 mt-1">Soft-deleted financial entries are kept for 30 days before permanent purging.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <!-- Description info alert -->
        <div class="flex items-center gap-3 p-4 bg-brand-50 border border-brand-200 text-brand-800 rounded-xl text-xs">
            <i data-lucide="info" class="w-5 h-5 flex-shrink-0"></i>
            <p>Deleted items will be automatically pruned after 30 days. You can choose to restore them to their original location, or permanently delete them now.</p>
        </div>

        <!-- Section tables -->
        ${txRows ? `
            <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Transactions in Trash</h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-slate-100 text-[10px] uppercase text-slate-400 font-bold">
                                <th class="py-2.5 px-2">Description</th>
                                <th class="py-2.5 px-2">Type</th>
                                <th class="py-2.5 px-2">Amount</th>
                                <th class="py-2.5 px-2">Deleted At</th>
                                <th class="py-2.5 px-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${txRows}</tbody>
                      </table>
                  </div>
              </div>
          ` : ''}

          ${debtRows ? `
              <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Debts & Receivables in Trash</h4>
                  <div class="overflow-x-auto">
                      <table class="w-full text-left border-collapse">
                          <thead>
                              <tr class="border-b border-slate-100 text-[10px] uppercase text-slate-400 font-bold">
                                  <th class="py-2.5 px-2">Person Name</th>
                                  <th class="py-2.5 px-2">Type</th>
                                  <th class="py-2.5 px-2">Amount</th>
                                  <th class="py-2.5 px-2">Deleted At</th>
                                  <th class="py-2.5 px-2 text-right">Actions</th>
                              </tr>
                          </thead>
                          <tbody>${debtRows}</tbody>
                      </table>
                  </div>
              </div>
          ` : ''}

          ${eventRows ? `
              <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Events in Trash</h4>
                  <div class="overflow-x-auto">
                      <table class="w-full text-left border-collapse">
                          <thead>
                              <tr class="border-b border-slate-100 text-[10px] uppercase text-slate-400 font-bold">
                                  <th class="py-2.5 px-2">Event Name</th>
                                  <th class="py-2.5 px-2">Deleted At</th>
                                  <th class="py-2.5 px-2 text-right">Actions</th>
                              </tr>
                          </thead>
                          <tbody>${eventRows}</tbody>
                      </table>
                  </div>
              </div>
          ` : ''}

          ${ledgerRows ? `
              <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-md shadow-slate-100/50">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Ledger Entries in Trash</h4>
                  <div class="overflow-x-auto">
                      <table class="w-full text-left border-collapse">
                          <thead>
                              <tr class="border-b border-slate-100 text-[10px] uppercase text-slate-400 font-bold">
                                  <th class="py-2.5 px-2">Description</th>
                                  <th class="py-2.5 px-2">Type</th>
                                  <th class="py-2.5 px-2">Amount</th>
                                  <th class="py-2.5 px-2">Deleted At</th>
                                  <th class="py-2.5 px-2 text-right">Actions</th>
                              </tr>
                          </thead>
                          <tbody>${ledgerRows}</tbody>
                      </table>
                  </div>
              </div>
          ` : ''}
      `;

      lucide.createIcons();
  }

  async function restoreItem(type, id) {
      showAppLoading(true);
      try {
          const res = await fetch(`/api/trash/restore/${type}/${id}`, { method: 'POST' });
          const result = await res.json();
          if (result.success) {
              showToast(result.message || 'Item restored successfully.', 'success');
              await loadViewData(state.activeView);
          } else {
              showToast(result.error || 'Failed to restore item.', 'danger');
          }
      } catch (err) {
          showToast('Connection error during restore.', 'danger');
      } finally {
          showAppLoading(false);
      }
  }

  async function permanentDeleteItem(type, id) {
      if (!confirm("Are you sure you want to PERMANENTLY delete this item? This action is irreversible!")) return;
      showAppLoading(true);
      try {
          const res = await fetch(`/api/trash/permanent/${type}/${id}`, { method: 'DELETE' });
          const result = await res.json();
          if (result.success) {
              showToast(result.message || 'Item permanently deleted.', 'success');
              await loadViewData(state.activeView);
          } else {
              showToast(result.error || 'Delete failed.', 'danger');
          }
      } catch (err) {
          showToast('Connection error during permanent delete.', 'danger');
      } finally {
          showAppLoading(false);
      }
  }
