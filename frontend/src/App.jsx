import React, { useState, useEffect } from 'react';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const API_BASE = `${rawApiBaseUrl.replace(/\/$/, '')}/api`;

export default function App() {
  // Memory-only Admin Auth Header ("Basic <base64>")
  const [adminAuthHeader, setAdminAuthHeader] = useState('');

  // Login Screen State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'customers'

  // Analytics State
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Customers State
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Add Customer Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustPackage, setNewCustPackage] = useState('');
  const [selectedJsonFile, setSelectedJsonFile] = useState(null);
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [modalError, setModalError] = useState('');

  // Notification Banners
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  // Centralized API Helper with HTTP Basic Auth Header Injection
  const apiFetch = async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...(adminAuthHeader ? { Authorization: adminAuthHeader } : {}),
    };

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && adminAuthHeader) {
      // Force return to login screen if credentials become invalid
      setAdminAuthHeader('');
      setErrorBanner('Session expired or credentials rejected. Please log in again.');
    }

    return response;
  };

  // Submit Admin Login Form & Verify Credentials
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!username.trim() || !password) {
      setLoginError('Please enter both username and password.');
      return;
    }

    setLoggingIn(true);

    try {
      const authHeaderValue = `Basic ${btoa(`${username.trim()}:${password}`)}`;
      const res = await fetch(`${API_BASE}/admin/analytics`, {
        headers: {
          Authorization: authHeaderValue,
        },
      });

      if (res.status === 200) {
        const json = await res.json();
        setAdminAuthHeader(authHeaderValue);
        setAnalytics(json.data);
        setPassword('');
      } else if (res.status === 401) {
        setLoginError('Incorrect username or password. Please try again.');
      } else {
        const json = await res.json().catch(() => ({}));
        setLoginError(json.error || `Server returned unexpected status ${res.status}`);
      }
    } catch (err) {
      setLoginError(`Cannot connect to backend API (${rawApiBaseUrl}). Please verify the backend server is running.`);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAdminAuthHeader('');
    setUsername('');
    setPassword('');
    setAnalytics(null);
    setCustomers([]);
  };

  // Fetch Founder Analytics Metrics
  const fetchAnalytics = async () => {
    if (!adminAuthHeader) return;
    setLoadingAnalytics(true);
    setErrorBanner('');
    try {
      const res = await apiFetch('/admin/analytics');
      const json = await res.json();
      if (json.success) {
        setAnalytics(json.data);
      } else {
        setErrorBanner(`Failed to load analytics: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`Cannot connect to ReviewForge backend API (${rawApiBaseUrl}). (${err.message})`);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Fetch Customers List
  const fetchCustomers = async () => {
    if (!adminAuthHeader) return;
    setLoadingCustomers(true);
    setErrorBanner('');
    try {
      const res = await apiFetch('/customers');
      const json = await res.json();
      if (json.success) {
        setCustomers(json.data || []);
      } else {
        setErrorBanner(`Failed to load customers: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`Cannot connect to ReviewForge backend API (${rawApiBaseUrl}). (${err.message})`);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    if (!adminAuthHeader) return;

    if (activeTab === 'analytics') {
      fetchAnalytics();
    } else if (activeTab === 'customers') {
      fetchCustomers();
    }
  }, [activeTab, adminAuthHeader]);

  // Action: Create New Customer
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!newCustName.trim()) {
      setModalError('Customer Name is required.');
      return;
    }
    if (!newCustEmail.trim()) {
      setModalError('Customer Email is required.');
      return;
    }
    if (!newCustPackage.trim()) {
      setModalError('Package Name is required.');
      return;
    }
    if (!selectedJsonFile) {
      setModalError('Please upload a Service Account JSON file.');
      return;
    }

    setSubmittingCustomer(true);

    try {
      const fileText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => reject(new Error('Failed to read uploaded file.'));
        reader.readAsText(selectedJsonFile);
      });

      let parsedJson;
      try {
        parsedJson = JSON.parse(fileText);
      } catch (e) {
        throw new Error('Uploaded file is not valid JSON.');
      }

      if (!parsedJson.client_email || !parsedJson.private_key) {
        throw new Error('Service Account JSON is missing required fields (client_email, private_key).');
      }

      const res = await apiFetch('/customers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustName.trim(),
          email: newCustEmail.trim(),
          packageName: newCustPackage.trim(),
          serviceAccountJson: parsedJson,
        }),
      });

      const json = await res.json();

      if (json.success) {
        setShowAddModal(false);
        setNewCustName('');
        setNewCustEmail('');
        setNewCustPackage('');
        setSelectedJsonFile(null);
        setSuccessBanner(`Customer '${json.data.name}' created successfully (Status: Awaiting Verification).`);
        fetchCustomers();
      } else {
        setModalError(json.error || 'Failed to create customer.');
      }
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmittingCustomer(false);
    }
  };

  // ============================================================================
  // UNAUTHENTICATED ADMIN LOGIN SCREEN
  // ============================================================================
  if (!adminAuthHeader) {
    return (
      <div className="app-container">
        <div className="login-wrapper">
          <div className="login-card">
            <div className="login-header">
              <div className="login-icon">⚡</div>
              <h2 className="login-title">ReviewForge Admin</h2>
              <p className="login-subtitle">Enter founder credentials to access dashboard</p>
            </div>

            {loginError && (
              <div className="banner banner-error" style={{ marginBottom: '1.25rem' }}>
                <span>⚠️ {loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label>Admin Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loggingIn}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Admin Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loggingIn}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loggingIn} style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}>
                {loggingIn ? 'Verifying Credentials...' : 'Log In to Dashboard'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // AUTHENTICATED FOUNDER DASHBOARD
  // ============================================================================
  const hasNeedsAttention = analytics && (
    (analytics.staleOnboarding && analytics.staleOnboarding.length > 0) ||
    (analytics.inactiveCustomers && analytics.inactiveCustomers.length > 0)
  );

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <h1 className="brand-title">Review<span>Forge</span> Admin</h1>
        </div>
        <nav className="nav-tabs">
          <button
            className={`nav-button ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
          <button
            className={`nav-button ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            Customers
          </button>
          <button className="btn-logout" onClick={handleLogout} style={{ marginLeft: '0.5rem' }}>
            Log Out
          </button>
        </nav>
      </header>

      {/* Global Notifications Banners */}
      {errorBanner && (
        <div className="banner banner-error">
          <span>⚠️ {errorBanner}</span>
          <button onClick={() => setErrorBanner('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {successBanner && (
        <div className="banner banner-success">
          <span>✓ {successBanner}</span>
          <button onClick={() => setSuccessBanner('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {/* TAB 1: FOUNDER ANALYTICS (DEFAULT) */}
      {activeTab === 'analytics' && (
        <main>
          <div className="section-title">
            <span>Founder Overview & Platform Performance</span>
            <button className="refresh-btn" onClick={fetchAnalytics} disabled={loadingAnalytics}>
              {loadingAnalytics ? 'Refreshing...' : '↻ Refresh Analytics'}
            </button>
          </div>

          {loadingAnalytics ? (
            <div className="loading-state">
              <p>Loading analytics from backend...</p>
            </div>
          ) : !analytics ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <h3>No Analytics Data Available</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Verify backend API connection.</p>
            </div>
          ) : (
            <div>
              {/* Top Stat Cards Grid */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-header">Total Customers</div>
                  <div className="stat-number">{analytics.totalCustomers}</div>
                  <div className="stat-subtitle">
                    {analytics.customersByStatus?.ACTIVE || 0} Active • {analytics.customersByStatus?.AWAITING_VERIFICATION || 0} Awaiting
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">Total Reviews Processed</div>
                  <div className="stat-number">{analytics.totalReviewsProcessed}</div>
                  <div className="stat-subtitle">
                    {analytics.reviewsByStatus?.posted || 0} Posted • {analytics.reviewsByStatus?.rejected || 0} Rejected
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">Approval Rate</div>
                  <div className="stat-number">
                    {analytics.approvalRate !== null ? `${analytics.approvalRate}%` : 'N/A'}
                  </div>
                  <div className="stat-subtitle">
                    {analytics.editRate !== null ? `${analytics.editRate}% AI Draft Edit Rate` : 'Posted vs Decided'}
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">Auto-Post Adoption</div>
                  <div className="stat-number">
                    {analytics.autoPostAdoption
                      ? `${analytics.autoPostAdoption.enabled} / ${analytics.autoPostAdoption.enabled + analytics.autoPostAdoption.disabled}`
                      : '0 / 0'}
                  </div>
                  <div className="stat-subtitle">
                    {analytics.autoPostAdoption && (analytics.autoPostAdoption.enabled + analytics.autoPostAdoption.disabled) > 0
                      ? `${Math.round((analytics.autoPostAdoption.enabled / (analytics.autoPostAdoption.enabled + analytics.autoPostAdoption.disabled)) * 100)}% of Active Customers`
                      : 'Active Customer Adoption'}
                  </div>
                </div>
              </div>

              {/* Needs Attention Alert List */}
              {hasNeedsAttention && (
                <div className="attention-section">
                  <h3 className="attention-title">
                    <span>⚠️</span> Needs Attention & Founder Action
                  </h3>
                  <div className="attention-list">
                    {analytics.staleOnboarding?.map((item) => (
                      <div key={item.id} className="attention-item">
                        <span className="attention-tag stale">Stale Onboarding</span>
                        <span>
                          <strong>{item.name}</strong> ({item.packageName}) has been awaiting setup verification for <strong>{item.daysAwaiting} days</strong> ({item.email})
                        </span>
                      </div>
                    ))}

                    {analytics.inactiveCustomers?.map((item) => (
                      <div key={item.id} className="attention-item">
                        <span className="attention-tag inactive">Inactivity Risk</span>
                        <span>
                          <strong>{item.name}</strong> ({item.packageName}) is Active but has <strong>0 posted reviews</strong> in the last 7 days ({item.email})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-Customer Breakdown Table */}
              <div className="section-title" style={{ fontSize: '1.1rem', marginTop: '1rem' }}>
                <span>Per-Customer Activity Breakdown</span>
              </div>

              {analytics.reviewsPerCustomer?.length === 0 ? (
                <div className="empty-state">
                  <p>No customer activity data found.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Customer Name</th>
                        <th>Package Name</th>
                        <th>Total Reviews</th>
                        <th>Posted</th>
                        <th>Pending</th>
                        <th>Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.reviewsPerCustomer?.map((cust) => (
                        <tr key={cust.customerId}>
                          <td style={{ fontWeight: 600 }}>{cust.customerName}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{cust.packageName}</td>
                          <td style={{ fontWeight: 600 }}>{cust.totalReviews}</td>
                          <td style={{ color: 'var(--mint)' }}>{cust.posted}</td>
                          <td style={{ color: 'var(--gold)' }}>{cust.pending}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{cust.rejected}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* TAB 2: CUSTOMERS (READ-ONLY AUTO-POST BADGE + ADD CUSTOMER) */}
      {activeTab === 'customers' && (
        <main>
          <div className="section-title">
            <span>Customer Directory & Credentials</span>
            <div className="header-actions">
              <button className="btn-add-customer" onClick={() => { setModalError(''); setShowAddModal(true); }}>
                + Add Customer
              </button>
              <button className="refresh-btn" onClick={fetchCustomers} disabled={loadingCustomers}>
                {loadingCustomers ? 'Refreshing...' : '↻ Refresh Customers'}
              </button>
            </div>
          </div>

          {loadingCustomers ? (
            <div className="loading-state">
              <p>Loading customers from backend...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3>No active customers found</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Click "+ Add Customer" above to onboard a new customer.</p>
            </div>
          ) : (
            <div className="customers-list">
              {customers.map((customer) => {
                const isEnabled = customer.autoPostEnabled;
                const isAwaiting = customer.onboardingStatus === 'AWAITING_VERIFICATION';

                return (
                  <div key={customer.id} className="customer-row">
                    <div className="customer-info-group">
                      <div className="customer-meta">
                        <h3>
                          {customer.name}
                          <span className={`badge-status ${isAwaiting ? 'awaiting' : 'active'}`}>
                            {isAwaiting ? 'Awaiting Verification' : 'Active'}
                          </span>
                        </h3>
                        <p>{customer.packageName} • {customer.email}</p>
                      </div>
                    </div>

                    {/* Read-Only Auto-Post Status Badge */}
                    <span className={`badge-autopost ${isEnabled ? 'enabled' : 'disabled'}`}>
                      Auto-Post: {isEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Customer</h2>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {modalError && (
              <div className="banner banner-error" style={{ marginBottom: '1rem' }}>
                <span>⚠️ {modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="modal-body">
              <div className="form-group">
                <label>Customer Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Acme Corp"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Customer Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="admin@example.com"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  required
                />
                <span className="field-hint">Customer must sign up using this exact email</span>
              </div>

              <div className="form-group">
                <label>Android Package Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. com.example.myapp"
                  value={newCustPackage}
                  onChange={(e) => setNewCustPackage(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Google Service Account JSON Key File</label>
                <input
                  type="file"
                  accept=".json"
                  className="file-input"
                  onChange={(e) => setSelectedJsonFile(e.target.files[0] || null)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={submittingCustomer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingCustomer}
                >
                  {submittingCustomer ? 'Encrypting & Saving...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
