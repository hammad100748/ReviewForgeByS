import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3001/api';

function StarRating({ rating }) {
  const stars = [];
  const numStars = typeof rating === 'number' ? Math.max(1, Math.min(5, rating)) : 0;
  for (let i = 1; i <= 5; i++) {
    stars.push(i <= numStars ? '★' : '☆');
  }
  return <span className="star-rating" title={`${numStars} out of 5 stars`}>{stars.join('')}</span>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('reviews'); // 'reviews' | 'customers'

  // Reviews State
  const [reviews, setReviews] = useState([]);
  const [editedTexts, setEditedTexts] = useState({});
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [processingDocs, setProcessingDocs] = useState({});

  // Customers State
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [togglingCustomers, setTogglingCustomers] = useState({});

  // Notification Banners
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  // Fetch Pending Reviews
  const fetchPendingReviews = async () => {
    setLoadingReviews(true);
    setErrorBanner('');
    try {
      const res = await fetch(`${API_BASE}/reviews/pending`);
      const json = await res.json();
      if (json.success) {
        setReviews(json.data || []);
        // Initialize edited text state map
        const textMap = {};
        (json.data || []).forEach(r => {
          textMap[r.id] = r.draftReply || '';
        });
        setEditedTexts(textMap);
      } else {
        setErrorBanner(`Failed to load pending reviews: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`Cannot connect to ReviewForge backend API (http://localhost:3001). Please verify the backend server is running. (${err.message})`);
    } finally {
      setLoadingReviews(false);
    }
  };

  // Fetch Customers
  const fetchCustomers = async () => {
    setLoadingCustomers(true);
    setErrorBanner('');
    try {
      const res = await fetch(`${API_BASE}/customers`);
      const json = await res.json();
      if (json.success) {
        setCustomers(json.data || []);
      } else {
        setErrorBanner(`Failed to load customers: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`Cannot connect to ReviewForge backend API (http://localhost:3001). Please verify the backend server is running. (${err.message})`);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reviews') {
      fetchPendingReviews();
    } else if (activeTab === 'customers') {
      fetchCustomers();
    }
  }, [activeTab]);

  // Action: Approve & Post as-is
  const handleApprove = async (docId) => {
    setProcessingDocs(prev => ({ ...prev, [docId]: true }));
    setErrorBanner('');
    setSuccessBanner('');
    try {
      const res = await fetch(`${API_BASE}/reviews/${docId}/approve`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setReviews(prev => prev.filter(r => r.id !== docId));
        setSuccessBanner(`Review reply approved and posted to Google Play!`);
      } else {
        setErrorBanner(`Failed to approve review: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`API error during approve: ${err.message}`);
    } finally {
      setProcessingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Action: Save Edit & Post
  const handleEditAndApprove = async (docId) => {
    const newText = editedTexts[docId] || '';
    if (!newText.trim()) {
      setErrorBanner('Reply text cannot be empty.');
      return;
    }
    setProcessingDocs(prev => ({ ...prev, [docId]: true }));
    setErrorBanner('');
    setSuccessBanner('');
    try {
      const res = await fetch(`${API_BASE}/reviews/${docId}/edit-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newText: newText.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setReviews(prev => prev.filter(r => r.id !== docId));
        setSuccessBanner(`Edited reply successfully posted to Google Play!`);
      } else {
        setErrorBanner(`Failed to post edited reply: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`API error during edit & approve: ${err.message}`);
    } finally {
      setProcessingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Action: Reject
  const handleReject = async (docId) => {
    setProcessingDocs(prev => ({ ...prev, [docId]: true }));
    setErrorBanner('');
    setSuccessBanner('');
    try {
      const res = await fetch(`${API_BASE}/reviews/${docId}/reject`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setReviews(prev => prev.filter(r => r.id !== docId));
        setSuccessBanner(`Review draft rejected and removed from pending queue.`);
      } else {
        setErrorBanner(`Failed to reject review: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`API error during reject: ${err.message}`);
    } finally {
      setProcessingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Action: Toggle Auto-Post Mode for Customer
  const handleToggleAutoPost = async (customerId, currentEnabled) => {
    setTogglingCustomers(prev => ({ ...prev, [customerId]: true }));
    setErrorBanner('');
    setSuccessBanner('');
    const nextState = !currentEnabled;
    try {
      const res = await fetch(`${API_BASE}/customers/${customerId}/autopost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const json = await res.json();
      if (json.success) {
        setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, autoPostEnabled: nextState } : c));
        setSuccessBanner(`Auto-Post mode ${nextState ? 'ENABLED' : 'DISABLED'} for customer.`);
      } else {
        setErrorBanner(`Failed to toggle Auto-Post mode: ${json.error}`);
      }
    } catch (err) {
      setErrorBanner(`API error during toggle: ${err.message}`);
    } finally {
      setTogglingCustomers(prev => ({ ...prev, [customerId]: false }));
    }
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <h1 className="brand-title">Review<span>Forge</span> Dashboard</h1>
        </div>
        <nav className="nav-tabs">
          <button
            className={`nav-button ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            Pending Reviews
            {reviews.length > 0 && <span className="badge">{reviews.length}</span>}
          </button>
          <button
            className={`nav-button ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            Customers & Auto-Post
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

      {/* Tab 1: Pending Reviews */}
      {activeTab === 'reviews' && (
        <main>
          <div className="section-title">
            <span>Pending Review Approvals ({reviews.length})</span>
            <button className="refresh-btn" onClick={fetchPendingReviews} disabled={loadingReviews}>
              {loadingReviews ? 'Refreshing...' : '↻ Refresh List'}
            </button>
          </div>

          {loadingReviews ? (
            <div className="loading-state">
              <p>Loading pending reviews from backend...</p>
            </div>
          ) : reviews.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎉</div>
              <h3>No pending reviews right now</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>All reviews have been processed or auto-posted.</p>
            </div>
          ) : (
            <div className="cards-grid">
              {reviews.map(review => {
                const isProcessing = processingDocs[review.id];
                const currentText = editedTexts[review.id] ?? (review.draftReply || '');
                const charCount = currentText.length;
                const isOverLimit = charCount > 350;

                return (
                  <div key={review.id} className="review-card">
                    <div className="card-header">
                      <div className="author-info">
                        <span className="author-name">{review.authorName || 'Anonymous Reviewer'}</span>
                        <span className="package-name">{review.packageName}</span>
                      </div>
                      <StarRating rating={review.starRating} />
                    </div>

                    <div className="review-text-box">
                      "{review.reviewText || '(No text provided)'}"
                    </div>

                    <div className="draft-section">
                      <label className="draft-label">AI Draft Reply (Editable)</label>
                      <textarea
                        className="draft-textarea"
                        value={currentText}
                        onChange={(e) => setEditedTexts({ ...editedTexts, [review.id]: e.target.value })}
                        disabled={isProcessing}
                        placeholder="Type AI reply draft..."
                      />
                      <div className={`char-counter ${isOverLimit ? 'over-limit' : ''}`}>
                        {charCount} / 350 characters {isOverLimit && '(Exceeds 350 char limit!)'}
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className="btn btn-approve"
                        onClick={() => handleApprove(review.id)}
                        disabled={isProcessing || isOverLimit}
                      >
                        {isProcessing ? 'Posting...' : '✓ Approve & Post'}
                      </button>

                      <button
                        className="btn btn-edit"
                        onClick={() => handleEditAndApprove(review.id)}
                        disabled={isProcessing || isOverLimit}
                      >
                        {isProcessing ? 'Posting...' : '✏️ Save Edit & Post'}
                      </button>

                      <button
                        className="btn btn-reject"
                        onClick={() => handleReject(review.id)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? 'Rejecting...' : '✕ Reject'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Tab 2: Customers & Auto-Post */}
      {activeTab === 'customers' && (
        <main>
          <div className="section-title">
            <span>Customer Settings & Auto-Post Configuration</span>
            <button className="refresh-btn" onClick={fetchCustomers} disabled={loadingCustomers}>
              {loadingCustomers ? 'Refreshing...' : '↻ Refresh Customers'}
            </button>
          </div>

          {loadingCustomers ? (
            <div className="loading-state">
              <p>Loading customers from backend...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3>No active customers found</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Use <code>npm run add-customer</code> in the backend to onboard new customers.</p>
            </div>
          ) : (
            <div className="customers-list">
              {customers.map(customer => {
                const isToggling = togglingCustomers[customer.id];
                const isEnabled = customer.autoPostEnabled;

                return (
                  <div key={customer.id} className="customer-row">
                    <div className="customer-meta">
                      <h3>{customer.name}</h3>
                      <p>{customer.packageName} • {customer.email}</p>
                    </div>

                    <div className="toggle-wrapper">
                      <span className={`toggle-status ${isEnabled ? 'enabled' : 'disabled'}`}>
                        {isEnabled ? 'Auto-Post Enabled' : 'Manual Approval'}
                      </span>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          disabled={isToggling}
                          onChange={() => handleToggleAutoPost(customer.id, isEnabled)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
