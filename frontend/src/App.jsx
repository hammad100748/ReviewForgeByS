import React, { useState, useEffect } from 'react';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const API_BASE = `${rawApiBaseUrl.replace(/\/$/, '')}/api`;

export default function App() {
  // Admin HTTP Basic Auth State (Stored in React Memory only)
  const [adminAuthHeader, setAdminAuthHeader] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Login Form Inputs
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Tab State ('CUSTOMERS' | 'ANALYTICS')
  const [activeTab, setActiveTab] = useState('CUSTOMERS');

  // Customer List & Analytics Data
  const [customers, setCustomers] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  // Loading States
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Add Customer Modal State (Brand-New Customer + First App)
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [newCustPackage, setNewCustPackage] = useState('');
  const [selectedJsonFile, setSelectedJsonFile] = useState(null);
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [modalError, setModalError] = useState('');

  // Add Additional App Modal State (Existing Customer + New App)
  const [showAddAppModal, setShowAddAppModal] = useState(false);
  const [selectedCustomerIdForApp, setSelectedCustomerIdForApp] = useState(null);
  const [selectedCustomerNameForApp, setSelectedCustomerNameForApp] = useState('');
  const [addAppName, setAddAppName] = useState('');
  const [addPackageName, setAddPackageName] = useState('');
  const [submittingApp, setSubmittingApp] = useState(false);
  const [addAppModalError, setAddAppModalError] = useState('');

  // Suspend / Reactivate Action Loading State
  const [suspendingCustomerId, setSuspendingCustomerId] = useState(null);

  // Delete Customer Confirmation Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [targetDeleteCustomer, setTargetDeleteCustomer] = useState(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState('');

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

    if (response.status === 401 && isAuthenticated) {
      setIsAuthenticated(false);
      setAdminAuthHeader('');
      setLoginError('Session expired or admin credentials invalid. Please log in again.');
    }

    return response;
  };

  // Admin Login Form Submit Handler
  const handleAdminLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Please enter both username and password.');
      return;
    }

    setLoggingIn(true);

    const base64Auth = btoa(`${loginUsername.trim()}:${loginPassword}`);
    const authHeaderValue = `Basic ${base64Auth}`;

    try {
      const res = await fetch(`${API_BASE}/customers`, {
        headers: { Authorization: authHeaderValue },
      });

      if (res.status === 401) {
        setLoginError('Invalid admin username or password.');
      } else if (!res.ok) {
        setLoginError(`Server error HTTP ${res.status}. Please check backend logs.`);
      } else {
        const data = await res.json();
        if (data.success) {
          setAdminAuthHeader(authHeaderValue);
          setIsAuthenticated(true);
          setCustomers(data.data || []);
          setLoginPassword('');
        } else {
          setLoginError(data.error || 'Authentication failed.');
        }
      }
    } catch (err) {
      setLoginError(`Connection error: ${err.message}. Is the backend server running?`);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAuthenticated(false);
    setAdminAuthHeader('');
    setCustomers([]);
    setAnalytics(null);
    setLoginUsername('');
    setLoginPassword('');
  };

  // Fetch Customers List with Nested Apps
  const fetchCustomers = async () => {
    if (!isAuthenticated) return;
    setLoadingCustomers(true);
    setErrorBanner('');
    try {
      const res = await apiFetch('/customers');
      const json = await res.json();
      if (json.success) {
        setCustomers(json.data || []);
      } else {
        setErrorBanner(json.error || 'Failed to fetch customers.');
      }
    } catch (err) {
      setErrorBanner(`API error: ${err.message}`);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Fetch Founder Analytics
  const fetchAnalytics = async () => {
    if (!isAuthenticated) return;
    setLoadingAnalytics(true);
    setErrorBanner('');
    try {
      const res = await apiFetch('/admin/analytics');
      const json = await res.json();
      if (json.success) {
        setAnalytics(json.data);
      } else {
        setErrorBanner(json.error || 'Failed to fetch analytics.');
      }
    } catch (err) {
      setErrorBanner(`Analytics API error: ${err.message}`);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'CUSTOMERS') fetchCustomers();
      if (activeTab === 'ANALYTICS') fetchAnalytics();
    }
  }, [isAuthenticated, activeTab]);

  // Handle Add Customer Submission (Brand-New Customer + First App)
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

    if (!newAppName.trim()) {
      setModalError('App Name is required.');
      return;
    }

    if (!newCustPackage.trim()) {
      setModalError('Android Package Name is required.');
      return;
    }

    if (!selectedJsonFile) {
      setModalError('Google Service Account JSON file is required.');
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
          appName: newAppName.trim(),
          packageName: newCustPackage.trim(),
          serviceAccountJson: parsedJson,
        }),
      });

      const json = await res.json();

      if (json.success) {
        setShowAddModal(false);
        setNewCustName('');
        setNewCustEmail('');
        setNewAppName('');
        setNewCustPackage('');
        setSelectedJsonFile(null);
        setSuccessBanner(`Customer '${json.data.name}' created with app '${json.data.appName}' (Status: Awaiting Verification).`);
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

  // Open "Add App" Modal for an Existing Customer
  const handleOpenAddAppModal = (customer) => {
    setSelectedCustomerIdForApp(customer.id);
    setSelectedCustomerNameForApp(customer.name);
    setAddAppName('');
    setAddPackageName('');
    setAddAppModalError('');
    setShowAddAppModal(true);
  };

  // Handle "Add App" Form Submission
  const handleCreateAppForCustomer = async (e) => {
    e.preventDefault();
    setAddAppModalError('');

    if (!addAppName.trim()) {
      setAddAppModalError('App Name is required.');
      return;
    }

    if (!addPackageName.trim()) {
      setAddAppModalError('Package Name is required.');
      return;
    }

    setSubmittingApp(true);

    try {
      const res = await apiFetch(`/admin/customers/${selectedCustomerIdForApp}/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: addAppName.trim(),
          packageName: addPackageName.trim(),
        }),
      });

      const json = await res.json();

      if (json.success) {
        setShowAddAppModal(false);
        setSuccessBanner(`App '${json.data.appName}' added successfully to '${selectedCustomerNameForApp}'.`);
        fetchCustomers();
      } else {
        setAddAppModalError(json.error || 'Failed to add app.');
      }
    } catch (err) {
      setAddAppModalError(err.message);
    } finally {
      setSubmittingApp(false);
    }
  };

  // Handle Suspend / Reactivate Customer Toggle
  const handleToggleSuspendCustomer = async (customer) => {
    const isSuspended = customer.active === false;
    const actionPath = isSuspended ? 'reactivate' : 'suspend';
    const actionLabel = isSuspended ? 'reactivate' : 'suspend';

    setSuspendingCustomerId(customer.id);
    setErrorBanner('');
    setSuccessBanner('');

    try {
      const res = await apiFetch(`/admin/customers/${customer.id}/${actionPath}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setSuccessBanner(json.message || `Customer '${customer.name}' ${actionLabel}d.`);
        fetchCustomers();
      } else {
        setErrorBanner(json.error || `Failed to ${actionLabel} customer.`);
      }
    } catch (err) {
      setErrorBanner(`API error: ${err.message}`);
    } finally {
      setSuspendingCustomerId(null);
    }
  };

  // Open Irreversible Delete Customer Modal
  const handleOpenDeleteModal = (customer) => {
    setTargetDeleteCustomer(customer);
    setDeleteConfirmInput('');
    setDeleteModalError('');
    setShowDeleteModal(true);
  };

  // Handle Execute Customer Deletion
  const handleExecuteDeleteCustomer = async (e) => {
    e.preventDefault();
    if (!targetDeleteCustomer) return;

    const trimmedInput = deleteConfirmInput.trim().toLowerCase();
    const expectedName = targetDeleteCustomer.name.trim().toLowerCase();
    const expectedEmail = targetDeleteCustomer.email.trim().toLowerCase();

    if (trimmedInput !== expectedName && trimmedInput !== expectedEmail) {
      setDeleteModalError(`Confirmation text must match customer name ("${targetDeleteCustomer.name}") or email ("${targetDeleteCustomer.email}").`);
      return;
    }

    setDeletingCustomer(true);
    setDeleteModalError('');
    setErrorBanner('');
    setSuccessBanner('');

    try {
      const res = await apiFetch(`/admin/customers/${targetDeleteCustomer.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setShowDeleteModal(false);
        setSuccessBanner(json.message || `Customer '${targetDeleteCustomer.name}' deleted.`);
        fetchCustomers();
      } else {
        setDeleteModalError(json.error || 'Failed to delete customer.');
      }
    } catch (err) {
      setDeleteModalError(`Delete error: ${err.message}`);
    } finally {
      setDeletingCustomer(false);
    }
  };

  // 1. UNAUTHENTICATED ADMIN LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="brand-badge">ReviewForge</div>
            <h2>Admin Portal Log In</h2>
            <p>Enter your ReviewForge administrator credentials to access management dashboard.</p>
          </div>

          {loginError && (
            <div className="banner banner-error">
              <span>⚠️ {loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLoginSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="admin-username">Admin Username</label>
              <input
                id="admin-username"
                type="text"
                className="form-input"
                placeholder="Username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                disabled={loggingIn}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="admin-password">Admin Password</label>
              <input
                id="admin-password"
                type="password"
                className="form-input"
                placeholder="••••••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                disabled={loggingIn}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loggingIn} style={{ width: '100%', marginTop: '0.5rem' }}>
              {loggingIn ? 'Authenticating...' : 'Log In to Admin Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. AUTHENTICATED ADMIN DASHBOARD VIEW
  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="header">
        <div className="header-brand">
          <div className="brand-logo">RF</div>
          <div>
            <h1>ReviewForge</h1>
            <p className="subtitle">Admin Management Portal</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add New Customer
          </button>
          <button className="btn btn-logout" onClick={handleAdminLogout}>
            Log Out
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <div className="tab-navigation" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          className={`tab-btn ${activeTab === 'CUSTOMERS' ? 'active' : ''}`}
          onClick={() => setActiveTab('CUSTOMERS')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1.25rem',
            color: activeTab === 'CUSTOMERS' ? 'var(--gold)' : 'var(--text-muted)',
            borderBottom: activeTab === 'CUSTOMERS' ? '2px solid var(--gold)' : '2px solid transparent',
            fontWeight: '600',
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          Customers ({customers.length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'ANALYTICS' ? 'active' : ''}`}
          onClick={() => setActiveTab('ANALYTICS')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1.25rem',
            color: activeTab === 'ANALYTICS' ? 'var(--gold)' : 'var(--text-muted)',
            borderBottom: activeTab === 'ANALYTICS' ? '2px solid var(--gold)' : '2px solid transparent',
            fontWeight: '600',
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          📊 Founder Analytics
        </button>
      </div>

      {/* Banners */}
      {successBanner && (
        <div className="banner banner-success">
          <span>✓ {successBanner}</span>
          <button className="banner-close" onClick={() => setSuccessBanner('')}>✕</button>
        </div>
      )}

      {errorBanner && (
        <div className="banner banner-error">
          <span>⚠️ {errorBanner}</span>
          <button className="banner-close" onClick={() => setErrorBanner('')}>✕</button>
        </div>
      )}

      {/* TAB 1: ANALYTICS DASHBOARD */}
      {activeTab === 'ANALYTICS' && (
        <main className="main-content">
          {loadingAnalytics ? (
            <div className="empty-state">
              <p>Loading analytics data...</p>
            </div>
          ) : !analytics ? (
            <div className="empty-state">
              <p>No analytics data available.</p>
            </div>
          ) : (
            <div className="analytics-grid" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Stat Cards Grid */}
              <div className="stat-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="stat-card">
                  <div className="stat-card-label">Total Customers</div>
                  <div className="stat-card-value">{analytics.totalCustomers}</div>
                  <div className="stat-card-sub">
                    Active: {analytics.customersByStatus?.ACTIVE || 0} | Awaiting: {analytics.customersByStatus?.AWAITING_VERIFICATION || 0}
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-card-label">Auto-Post Adoption</div>
                  <div className="stat-card-value" style={{ color: 'var(--mint)' }}>
                    {analytics.autoPostAdoption?.enabled || 0}
                    <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}> / {analytics.customersByStatus?.ACTIVE || 0}</span>
                  </div>
                  <div className="stat-card-sub">Enabled for active customers</div>
                </div>

                <div className="stat-card">
                  <div className="stat-card-label">Approval Rate</div>
                  <div className="stat-card-value" style={{ color: 'var(--gold)' }}>
                    {analytics.approvalRate !== null ? `${analytics.approvalRate}%` : 'N/A'}
                  </div>
                  <div className="stat-card-sub">Posted vs Rejected</div>
                </div>

                <div className="stat-card">
                  <div className="stat-card-label">Draft Edit Rate</div>
                  <div className="stat-card-value">
                    {analytics.editRate !== null ? `${analytics.editRate}%` : 'N/A'}
                  </div>
                  <div className="stat-card-sub">Modified before posting</div>
                </div>
              </div>

              {/* Founder Follow-up Lists */}
              {((analytics.staleOnboarding && analytics.staleOnboarding.length > 0) ||
                (analytics.inactiveCustomers && analytics.inactiveCustomers.length > 0)) && (
                <div className="followup-section" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)' }}>Founder Action Items</h3>

                  {analytics.staleOnboarding && analytics.staleOnboarding.length > 0 && (
                    <div className="banner banner-error" style={{ display: 'block' }}>
                      <strong style={{ display: 'block', marginBottom: '0.25rem' }}>⏳ Stale Onboarding (&gt;3 Days Awaiting Setup):</strong>
                      <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                        {analytics.staleOnboarding.map((item) => (
                          <li key={item.id}>
                            <strong>{item.name}</strong> ({item.appName || item.packageName}) has been awaiting setup verification for <strong>{item.daysAwaiting} days</strong> ({item.email})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analytics.inactiveCustomers && analytics.inactiveCustomers.length > 0 && (
                    <div className="banner banner-error" style={{ display: 'block', backgroundColor: 'rgba(245, 197, 24, 0.15)', borderColor: 'rgba(245, 197, 24, 0.4)', color: 'var(--gold)' }}>
                      <strong style={{ display: 'block', marginBottom: '0.25rem' }}>⚠️ Inactive Customers (0 Replies Posted in Last 7 Days):</strong>
                      <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                        {analytics.inactiveCustomers.map((item) => (
                          <li key={item.id}>
                            <strong>{item.name}</strong> ({item.appName || item.packageName}) is Active but has <strong>0 posted reviews</strong> in the last 7 days ({item.email})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Per-Customer Activity Breakdown Table */}
              <div>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.75rem' }}>Customer Review Activity Breakdown</h3>
                {!analytics.reviewsPerCustomer || analytics.reviewsPerCustomer.length === 0 ? (
                  <div className="empty-state">
                    <p>No customer review metrics available.</p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Customer Name</th>
                          <th>App / Package Name</th>
                          <th>Total Reviews</th>
                          <th>Posted</th>
                          <th>Pending</th>
                          <th>Rejected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.reviewsPerCustomer.map((cust) => (
                          <tr key={cust.customerId}>
                            <td style={{ fontWeight: 600 }}>{cust.customerName}</td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{cust.appName || cust.packageName}</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-muted)' }}>{cust.packageName}</div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{cust.totalReviews}</td>
                            <td style={{ color: 'var(--mint)', fontWeight: 600 }}>{cust.posted}</td>
                            <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{cust.pending}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{cust.rejected}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {/* TAB 2: CUSTOMERS MANAGEMENT VIEW */}
      {activeTab === 'CUSTOMERS' && (
        <main className="main-content">
          <div className="section-header">
            <h2>Configured Customers ({customers.length})</h2>
            <button className="btn btn-secondary" onClick={fetchCustomers} disabled={loadingCustomers}>
              {loadingCustomers ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>

          {loadingCustomers ? (
            <div className="empty-state">
              <p>Loading customers...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📱</div>
              <h3>No Customers Added Yet</h3>
              <p>Click "Add New Customer" above to configure your first Google Play app.</p>
            </div>
          ) : (
            <div className="customers-list">
              {customers.map((customer) => {
                const isAwaiting = customer.onboardingStatus === 'AWAITING_VERIFICATION';
                const isSuspended = customer.active === false;

                return (
                  <div key={customer.id} className={`customer-card ${isSuspended ? 'is-suspended' : ''}`}>
                    {/* Customer Header Row */}
                    <div className="customer-card__header">
                      <div className="customer-card__identity">
                        <div className="customer-card__title-row">
                          <h3 className="customer-card__name">{customer.name}</h3>
                          {isSuspended ? (
                            <span className="badge-status suspended">SUSPENDED</span>
                          ) : isAwaiting ? (
                            <span className="badge-status awaiting">Awaiting Verification</span>
                          ) : (
                            <span className="badge-status active">Active</span>
                          )}
                        </div>
                        <p className="customer-card__email">{customer.email}</p>
                      </div>

                      {/* Customer Actions Toolbar */}
                      <div className="customer-card__actions">
                        {!isAwaiting && !isSuspended && (
                          <button
                            className="btn-add-app"
                            onClick={() => handleOpenAddAppModal(customer)}
                          >
                            + Add App
                          </button>
                        )}

                        <button
                          className="btn-suspend"
                          onClick={() => handleToggleSuspendCustomer(customer)}
                          disabled={suspendingCustomerId === customer.id}
                        >
                          {suspendingCustomerId === customer.id
                            ? 'Updating...'
                            : isSuspended
                            ? 'Reactivate'
                            : 'Suspend'}
                        </button>

                        <button
                          className="btn-danger"
                          onClick={() => handleOpenDeleteModal(customer)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Connected Apps List */}
                    <div className="nested-apps">
                      <div className="nested-apps__header">
                        Connected Apps ({customer.apps?.length || 0})
                      </div>
                      <div className="nested-apps__list">
                        {customer.apps && customer.apps.length > 0 ? (
                          customer.apps.map((app) => (
                            <div key={app.id} className="app-item">
                              <div className="app-item__info">
                                <span className="app-item__icon">📱</span>
                                <div className="app-item__details">
                                  <span className="app-item__name">{app.appName}</span>
                                  <span className="app-item__package">{app.packageName}</span>
                                </div>
                              </div>
                              <div className="app-item__badge">
                                <span className={`badge-autopost ${app.autoPostEnabled ? 'enabled' : 'disabled'}`}>
                                  Auto-Post: {app.autoPostEnabled ? 'ON' : 'OFF'}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="app-item" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                            No connected apps.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Add New Customer Modal (Brand-New Customer + First App) */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Customer</h2>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {modalError && (
              <div className="banner banner-error">
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
                <label>First App Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. AI Coding Assistant"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  required
                />
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
                  {submittingCustomer ? 'Creating Customer...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Additional App Modal (Existing Customer + New App) */}
      {showAddAppModal && (
        <div className="modal-overlay" onClick={() => setShowAddAppModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Additional App to {selectedCustomerNameForApp}</h2>
              <button className="modal-close-btn" onClick={() => setShowAddAppModal(false)}>✕</button>
            </div>

            {addAppModalError && (
              <div className="banner banner-error">
                <span>⚠️ {addAppModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAppForCustomer} className="modal-body">
              <div className="form-group">
                <label>App Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. AI Coding Assistant"
                  value={addAppName}
                  onChange={(e) => setAddAppName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Android Package Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. com.example.myapp"
                  value={addPackageName}
                  onChange={(e) => setAddPackageName(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddAppModal(false)}
                  disabled={submittingApp}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingApp}
                >
                  {submittingApp ? 'Adding App...' : 'Add App'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Customer Confirmation Modal */}
      {showDeleteModal && targetDeleteCustomer && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: 'var(--red)' }}>⚠️ Delete Customer</h2>
              <button className="modal-close-btn" onClick={() => setShowDeleteModal(false)}>✕</button>
            </div>

            {deleteModalError && (
              <div className="banner banner-error">
                <span>⚠️ {deleteModalError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteDeleteCustomer} className="modal-body">
              <div className="alert banner-error" style={{ display: 'block', fontSize: '0.875rem', lineHeight: '1.5' }}>
                <strong style={{ display: 'block', marginBottom: '0.4rem' }}>
                  This action is permanent and cannot be undone!
                </strong>
                Deleting <strong>{targetDeleteCustomer.name}</strong> will permanently remove:
                <ul style={{ margin: '0.4rem 0 0 1.25rem' }}>
                  <li>All review records and draft history</li>
                  <li>All {targetDeleteCustomer.apps?.length || 0} connected app configuration(s)</li>
                  <li>Their login account and authentication credentials</li>
                </ul>
              </div>

              <div className="form-group">
                <label>
                  Type <strong>{targetDeleteCustomer.email}</strong> or <strong>{targetDeleteCustomer.name}</strong> to confirm:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={`Type "${targetDeleteCustomer.email}"`}
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  disabled={deletingCustomer}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingCustomer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger-fill"
                  disabled={
                    deletingCustomer ||
                    (deleteConfirmInput.trim().toLowerCase() !== targetDeleteCustomer.name.trim().toLowerCase() &&
                      deleteConfirmInput.trim().toLowerCase() !== targetDeleteCustomer.email.trim().toLowerCase())
                  }
                >
                  {deletingCustomer ? 'Deleting Everything...' : 'Permanently Delete Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
