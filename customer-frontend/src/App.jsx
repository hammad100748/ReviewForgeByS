import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const API_BASE = `${rawApiBaseUrl.replace(/\/$/, '')}/api`;

function StarRating({ rating }) {
  const stars = [];
  const numStars = typeof rating === 'number' ? Math.max(1, Math.min(5, rating)) : 0;
  for (let i = 1; i <= 5; i++) {
    stars.push(i <= numStars ? '★' : '☆');
  }
  return <span className="star-rating" title={`${numStars} out of 5 stars`}>{stars.join('')}</span>;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Flow State
  const [step, setStep] = useState(1);
  const [subStep, setSubStep] = useState(null);

  // UI State
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Customer Profile & Onboarding State
  const [customerProfile, setCustomerProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Connection Verification State
  const [verifying, setVerifying] = useState(false);
  const [verifyingError, setVerifyingError] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-Post Toggle State
  const [togglingAutoPost, setTogglingAutoPost] = useState(false);

  // Customer Dashboard Reviews State
  const [reviews, setReviews] = useState([]);
  const [editedTexts, setEditedTexts] = useState({});
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [processingDocs, setProcessingDocs] = useState({});
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardSuccess, setDashboardSuccess] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);

      if (user) {
        fetchCustomerProfile(user);
      } else {
        setCustomerProfile(null);
        setReviews([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Logged-In Customer Profile from Backend
  const fetchCustomerProfile = async (user) => {
    setLoadingProfile(true);
    setProfileError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/customer/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();
      if (json.success) {
        setCustomerProfile(json.data);
        if (json.data.onboardingStatus === 'ACTIVE') {
          fetchCustomerReviews(user);
        }
      } else {
        setProfileError(json.error || 'Failed to load customer profile.');
      }
    } catch (err) {
      console.error('Fetch profile error:', err);
      setProfileError('Cannot connect to backend server. Please verify the server is running.');
    } finally {
      setLoadingProfile(false);
    }
  };

  // Fetch Customer-Scoped Pending Reviews
  const fetchCustomerReviews = async (user = currentUser) => {
    if (!user) return;
    setLoadingReviews(true);
    setDashboardError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/customer/reviews/pending`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        setReviews(json.data || []);
        const textMap = {};
        (json.data || []).forEach(r => {
          textMap[r.id] = r.draftReply || '';
        });
        setEditedTexts(textMap);
      } else {
        setDashboardError(`Failed to load pending reviews: ${json.error}`);
      }
    } catch (err) {
      setDashboardError(`Cannot fetch reviews: ${err.message}`);
    } finally {
      setLoadingReviews(false);
    }
  };

  // Customer Toggle Auto-Post Mode Handler (with Error Reversion)
  const handleToggleAutoPost = async () => {
    if (!currentUser || !customerProfile) return;

    const previousState = Boolean(customerProfile.autoPostEnabled);
    const nextState = !previousState;

    setTogglingAutoPost(true);
    setDashboardError('');
    setDashboardSuccess('');

    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/customer/autopost`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: nextState }),
      });

      const json = await res.json();

      if (json.success) {
        setCustomerProfile(prev => prev ? { ...prev, autoPostEnabled: nextState } : prev);
        setDashboardSuccess(`Auto-post mode ${nextState ? 'ENABLED' : 'DISABLED'} for your account.`);
      } else {
        // Revert toggle state visually on failure
        setDashboardError(`Failed to update auto-post mode: ${json.error}`);
      }
    } catch (err) {
      // Revert toggle state visually on failure
      setDashboardError(`Failed to update auto-post mode: ${err.message}`);
    } finally {
      setTogglingAutoPost(false);
    }
  };

  // Trigger Google Play Connection Verification
  const handleVerifyConnection = async () => {
    if (!currentUser) return;
    setVerifying(true);
    setVerifyingError('');

    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/customer/verify-connection`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();

      if (json.success) {
        setCustomerProfile(prev => prev ? { ...prev, onboardingStatus: 'ACTIVE' } : prev);
        fetchCustomerReviews(currentUser);
      } else {
        setVerifyingError(json.error || "Unable to verify Play Console permission. Please confirm the service account email has been added with 'Reply to reviews' permission.");
      }
    } catch (err) {
      setVerifyingError(`Connection verification error: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  // Copy Service Account Email to Clipboard
  const handleCopyEmail = () => {
    if (!customerProfile?.serviceAccountEmail) return;
    navigator.clipboard.writeText(customerProfile.serviceAccountEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Customer Action: Approve & Post Reply
  const handleApprove = async (docId) => {
    if (!currentUser) return;
    setProcessingDocs(prev => ({ ...prev, [docId]: true }));
    setDashboardError('');
    setDashboardSuccess('');
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/customer/reviews/${docId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setReviews(prev => prev.filter(r => r.id !== docId));
        setDashboardSuccess(`Review reply approved and posted to Google Play Store!`);
      } else {
        setDashboardError(`Failed to approve review: ${json.error}`);
      }
    } catch (err) {
      setDashboardError(`API error during approve: ${err.message}`);
    } finally {
      setProcessingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Customer Action: Save Edit & Post Reply
  const handleEditAndApprove = async (docId) => {
    if (!currentUser) return;
    const newText = editedTexts[docId] || '';
    if (!newText.trim()) {
      setDashboardError('Reply text cannot be empty.');
      return;
    }
    setProcessingDocs(prev => ({ ...prev, [docId]: true }));
    setDashboardError('');
    setDashboardSuccess('');
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/customer/reviews/${docId}/edit-approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newText: newText.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setReviews(prev => prev.filter(r => r.id !== docId));
        setDashboardSuccess(`Edited reply successfully posted to Google Play Store!`);
      } else {
        setDashboardError(`Failed to post edited reply: ${json.error}`);
      }
    } catch (err) {
      setDashboardError(`API error during edit & approve: ${err.message}`);
    } finally {
      setProcessingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Customer Action: Reject Reply Draft
  const handleReject = async (docId) => {
    if (!currentUser) return;
    setProcessingDocs(prev => ({ ...prev, [docId]: true }));
    setDashboardError('');
    setDashboardSuccess('');
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/customer/reviews/${docId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setReviews(prev => prev.filter(r => r.id !== docId));
        setDashboardSuccess(`Review draft rejected and removed from pending queue.`);
      } else {
        setDashboardError(`Failed to reject review: ${json.error}`);
      }
    } catch (err) {
      setDashboardError(`API error during reject: ${err.message}`);
    } finally {
      setProcessingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Step 1: Check Email Pre-Provisioning
  const handleEmailContinue = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setChecking(true);

    try {
      const res = await fetch(`${API_BASE}/customers/by-email?email=${encodeURIComponent(trimmedEmail)}`);
      const checkData = await res.json();

      setStep(2);
      if (!checkData.success || checkData.exists === false) {
        setSubStep('NOT_INVITED');
      } else {
        setSubStep('PROVISIONED');
      }
    } catch (err) {
      console.error('Email verification error:', err);
      setErrorMsg(`Cannot verify account: ${err.message}. Please check your connection.`);
    } finally {
      setChecking(false);
    }
  };

  // Step 2: Handle Password Submit
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedEmail = email.trim();
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        try {
          await createUserWithEmailAndPassword(auth, trimmedEmail, password);
          return;
        } catch (createErr) {
          if (createErr.code === 'auth/weak-password') {
            setErrorMsg('Password must be at least 6 characters long.');
          } else {
            setErrorMsg(`Account creation failed: ${createErr.message}`);
          }
          return;
        }
      }

      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg('Incorrect password, please try again.');
        return;
      }

      setErrorMsg('Something went wrong, please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setSubStep(null);
    setPassword('');
    setErrorMsg('');
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      resetFlow();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  if (authLoading) {
    return (
      <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="auth-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="nav__brand-mark" style={{ margin: '0 auto 16px' }}></div>
          <p className="mono" style={{ color: 'var(--text-muted)' }}>Loading authentication state...</p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // LOGGED-IN CUSTOMER ROUTING BASED ON onboardingStatus
  // ============================================================================
  if (currentUser) {
    const isAwaiting = customerProfile?.onboardingStatus === 'AWAITING_VERIFICATION';
    const isActive = customerProfile?.onboardingStatus === 'ACTIVE';
    const isAutoPost = Boolean(customerProfile?.autoPostEnabled);

    return (
      <div className="page-container">
        <header className="nav">
          <div className="nav__wrap">
            <a href="#" className="nav__brand">
              <span className="nav__brand-mark"></span> ReviewForge
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {customerProfile?.email || currentUser.email}
              </span>
              <button className="btn-ghost" onClick={handleSignOut} style={{ padding: '8px 16px', fontSize: '13.5px' }}>
                Sign Out
              </button>
            </div>
          </div>
        </header>

        <main className="auth-wrapper" style={{ alignItems: 'flex-start', paddingTop: '32px' }}>
          {loadingProfile ? (
            <div className="dashboard-card" style={{ textAlign: 'center' }}>
              <p className="mono" style={{ color: 'var(--text-muted)' }}>Fetching account details...</p>
            </div>
          ) : profileError ? (
            <div className="dashboard-card">
              <div className="alert alert-error">
                ⚠️ {profileError}
              </div>
              <button className="btn-ghost" onClick={() => fetchCustomerProfile(currentUser)}>
                ↻ Retry Profile Check
              </button>
            </div>
          ) : isAwaiting ? (
            /* STATE A: AWAITING_VERIFICATION (Setup & Connection Steps) */
            <div className="dashboard-card" style={{ textAlign: 'left' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <span className="status-chip awaiting">
                  <span className="nav__brand-mark" style={{ width: '6px', height: '6px' }}></span> SETUP REQUIRED
                </span>
                <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Invite Service Account</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '14.5px' }}>
                  Grant ReviewForge permission to reply to reviews for <strong style={{ color: 'var(--text)' }}>{customerProfile?.packageName}</strong>
                </p>
              </div>

              {/* Service Account Email Copy Box */}
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Your Dedicated Service Account Email</label>
                <div className="service-email-box">
                  <span className="service-email-text">{customerProfile?.serviceAccountEmail || 'Loading...'}</span>
                  <button className="btn-copy" onClick={handleCopyEmail}>
                    {copied ? 'Copied ✓' : 'Copy Email'}
                  </button>
                </div>
              </div>

              {/* Numbered Setup Instructions */}
              <div className="instruction-steps">
                <div className="instruction-step">
                  <span className="step-num">1</span>
                  <div className="step-text">
                    Open your <strong><a href="https://play.google.com/console" target="_blank" rel="noreferrer">Google Play Console</a></strong>.
                  </div>
                </div>

                <div className="instruction-step">
                  <span className="step-num">2</span>
                  <div className="step-text">
                    Navigate to <strong>Users and permissions</strong> → click <strong>Invite new users</strong>.
                  </div>
                </div>

                <div className="instruction-step">
                  <span className="step-num">3</span>
                  <div className="step-text">
                    Paste the Service Account email copied above into the email address field.
                  </div>
                </div>

                <div className="instruction-step">
                  <span className="step-num">4</span>
                  <div className="step-text">
                    Under App permissions, select <strong>{customerProfile?.packageName}</strong> and grant <strong>"Reply to reviews"</strong> permission only.
                  </div>
                </div>

                <div className="instruction-step">
                  <span className="step-num">5</span>
                  <div className="step-text">
                    Click <strong>Invite user</strong> and send the invitation.
                  </div>
                </div>
              </div>

              {/* Verification Error Banner */}
              {verifyingError && (
                <div className="alert alert-error" style={{ marginBottom: '16px' }}>
                  <strong>Verification Failed</strong>
                  <p style={{ marginTop: '4px', fontSize: '13px' }}>{verifyingError}</p>
                </div>
              )}

              {/* Action Button */}
              <button
                className="btn-primary"
                onClick={handleVerifyConnection}
                disabled={verifying}
              >
                {verifying ? 'Verifying Connection...' : "I've Done This — Verify Connection"}
              </button>

              {verifyingError && (
                <p className="retry-hint">
                  Double-check the invite was sent to the exact email above with "Reply to reviews" permission.
                </p>
              )}
            </div>
          ) : isActive ? (
            /* STATE B: ACTIVE CUSTOMER DASHBOARD */
            <div className="active-dashboard-container">
              {/* Connected Settings & Read-Only Info Banner */}
              <div className="settings-info-banner">
                <div className="settings-meta-item">
                  <span className="settings-meta-label">Connected App Package</span>
                  <span className="settings-meta-value gold">{customerProfile?.packageName}</span>
                </div>
                <div className="settings-meta-item">
                  <span className="settings-meta-label">Service Account Email</span>
                  <span className="settings-meta-value">{customerProfile?.serviceAccountEmail}</span>
                </div>
                <div className="settings-meta-item">
                  <span className="settings-meta-label">Status</span>
                  <span className="status-chip" style={{ margin: 0 }}>
                    <span className="nav__brand-mark" style={{ width: '6px', height: '6px' }}></span> ACTIVE & CONNECTED
                  </span>
                </div>
              </div>

              {/* Auto-Post Toggle Card */}
              <div className="autopost-card">
                <div className="autopost-info">
                  <h3 className="autopost-title">
                    ⚡ Auto-Post Replies
                  </h3>
                  <p className="autopost-desc">
                    When enabled, AI-generated replies are posted automatically without requiring your approval. When disabled, you review and approve every reply before it's posted.
                  </p>
                </div>

                <div className="toggle-wrapper">
                  <span className={`toggle-status ${isAutoPost ? 'enabled' : 'disabled'}`}>
                    {togglingAutoPost ? 'Saving...' : (isAutoPost ? 'Enabled' : 'Disabled')}
                  </span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={isAutoPost}
                      disabled={togglingAutoPost}
                      onChange={handleToggleAutoPost}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              {/* Notifications Banners */}
              {dashboardError && (
                <div className="alert alert-error">
                  <span>⚠️ {dashboardError}</span>
                  <button onClick={() => setDashboardError('')} style={{ background: 'none', border: 'none', color: 'inherit', float: 'right', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>
              )}

              {dashboardSuccess && (
                <div className="alert alert-success">
                  <span>✓ {dashboardSuccess}</span>
                  <button onClick={() => setDashboardSuccess('')} style={{ background: 'none', border: 'none', color: 'inherit', float: 'right', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>
              )}

              {/* Persistent Auto-Post Enabled Informational Banner */}
              {isAutoPost && (
                <div className="autopost-banner-note">
                  ⚡ <strong>Auto-post is on</strong> — new reviews will be replied to automatically. Manually approved reviews below are from before you enabled this.
                </div>
              )}

              {/* Header Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', color: 'var(--text)' }}>
                  Pending Review Approvals ({reviews.length})
                </h2>
                <button className="btn-ghost" onClick={() => fetchCustomerReviews(currentUser)} disabled={loadingReviews} style={{ padding: '8px 16px', fontSize: '13.5px' }}>
                  {loadingReviews ? 'Refreshing...' : '↻ Refresh Reviews'}
                </button>
              </div>

              {/* Reviews List / Cards Grid */}
              {loadingReviews ? (
                <div className="empty-state">
                  <p className="mono">Loading your pending reviews...</p>
                </div>
              ) : reviews.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🎉</div>
                  <h3>No pending reviews right now</h3>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>We'll notify you when new ones come in.</p>
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
            </div>
          ) : (
            /* FALLBACK / UNKNOWN STATUS */
            <div className="dashboard-card" style={{ textAlign: 'center' }}>
              <h2>Account Status Check</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '15px' }}>
                Please contact support if you need assistance activating your account.
              </p>
              <div style={{ marginTop: '28px' }}>
                <button className="btn-ghost" onClick={handleSignOut}>
                  Log Out
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // 2. UNAUTHENTICATED "GET STARTED" AUTH FLOW
  return (
    <div className="page-container">
      <header className="nav">
        <div className="nav__wrap">
          <a href="#" className="nav__brand">
            <span className="nav__brand-mark"></span> ReviewForge
          </a>
        </div>
      </header>

      <main className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-card__header">
            <div className="auth-card__icon">
              <span className="nav__brand-mark"></span>
            </div>
            <h2 className="auth-card__title">
              {step === 1 && 'Get Started with ReviewForge'}
              {step === 2 && subStep === 'NOT_INVITED' && 'Account Not Found'}
              {step === 2 && subStep === 'PROVISIONED' && 'Enter your password'}
            </h2>
            <p className="auth-card__sub">
              {step === 1 && 'Enter your email address to continue'}
              {step === 2 && subStep === 'NOT_INVITED' && 'Invitation required for access'}
              {step === 2 && subStep === 'PROVISIONED' && 'Enter your password to continue'}
            </p>
          </div>

          {errorMsg && (
            <div className="alert alert-error">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* STEP 1: Enter Email */}
          {step === 1 && (
            <form onSubmit={handleEmailContinue} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="developer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={checking}
                  required
                  autoFocus
                />
              </div>

              <button type="submit" className="btn-primary" disabled={checking}>
                {checking ? 'Checking Account...' : 'Continue'}
              </button>
            </form>
          )}

          {/* STEP 2: Email Disabled Header & Action Form */}
          {step === 2 && (
            <div className="auth-form">
              {/* Disabled Email Field with Change Email link */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="disabled-email">Email Address</label>
                  <button
                    type="button"
                    onClick={resetFlow}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--gold)',
                      fontSize: '12px',
                      fontFamily: "'IBM Plex Mono', monospace",
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Change email
                  </button>
                </div>
                <input
                  id="disabled-email"
                  type="email"
                  className="form-input"
                  value={email}
                  disabled
                  style={{ opacity: 0.65, cursor: 'not-allowed', backgroundColor: 'var(--bg-panel-2)' }}
                />
              </div>

              {/* Sub-Outcome A: Email Not Invited */}
              {subStep === 'NOT_INVITED' && (
                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                  <div className="alert alert-error" style={{ textAlign: 'left', marginBottom: '20px' }}>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>Access Restricted</strong>
                    This email address hasn't been invited to ReviewForge yet. If you believe this is a mistake, please contact your account administrator or support.
                  </div>
                  <button type="button" className="btn-ghost" onClick={resetFlow} style={{ width: '100%' }}>
                    ← Try a different email
                  </button>
                </div>
              )}

              {/* Sub-Outcome B: Pre-Provisioned -> Single Password Input & Single "Continue" Button */}
              {subStep === 'PROVISIONED' && (
                <form onSubmit={handlePasswordSubmit} className="auth-form">
                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      id="password"
                      type="password"
                      className="form-input"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      required
                      autoFocus
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Processing...' : 'Continue'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
