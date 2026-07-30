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
  const [hasAuthAccount, setHasAuthAccount] = useState(false);

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
        setDashboardError(`Failed to update auto-post mode: ${json.error}`);
      }
    } catch (err) {
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

  // Step 1: Check Email Pre-Provisioning & Auth Account Status
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
        setHasAuthAccount(false);
      } else {
        setSubStep('PROVISIONED');
        setHasAuthAccount(Boolean(checkData.data?.hasAuthAccount));
      }
    } catch (err) {
      console.error('Email verification error:', err);
      setErrorMsg(`Cannot verify account: ${err.message}. Please check your connection.`);
    } finally {
      setChecking(false);
    }
  };

  // Step 2: Handle Password Submit (Deterministic Path Driven by Backend hasAuthAccount)
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
      if (hasAuthAccount) {
        // Returning User Path -> Log In
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        // First-Time Setup Path -> Create Password & Account
        try {
          await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        } catch (createErr) {
          if (createErr.code === 'auth/weak-password') {
            setErrorMsg('Password must be at least 6 characters long.');
          } else {
            setErrorMsg(`Account creation failed: ${createErr.message}`);
          }
          return;
        }
      }
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg('Incorrect password, please try again.');
        return;
      }
      if (err.code === 'auth/weak-password') {
        setErrorMsg('Password must be at least 6 characters long.');
        return;
      }
      setErrorMsg(err.message || 'Something went wrong, please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setSubStep(null);
    setHasAuthAccount(false);
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
              <div className="key-box" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Google Play Service Account Email
                  </label>
                  <button className="btn-ghost" onClick={handleCopyEmail} style={{ padding: '4px 10px', fontSize: '12px' }}>
                    {copied ? '✓ Copied' : 'Copy Email'}
                  </button>
                </div>
                <div className="mono" style={{ fontSize: '13.5px', wordBreak: 'break-all', color: 'var(--gold)', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  {customerProfile?.serviceAccountEmail || 'Loading service account email...'}
                </div>
              </div>

              {/* Onboarding Instructions List */}
              <div style={{ background: 'var(--bg-panel-2)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Instructions</h4>
                <ol style={{ paddingLeft: '20px', fontSize: '14px', lineHeight: '1.7', color: 'var(--text-muted)' }}>
                  <li>Open <strong>Google Play Console</strong> and select <strong>Users and Permissions</strong></li>
                  <li>Click <strong>Invite new users</strong> and paste the email address above</li>
                  <li>Under App Permissions, grant permission for <strong style={{ color: 'var(--text)' }}>{customerProfile?.packageName}</strong></li>
                  <li>Enable the <strong style={{ color: 'var(--text)' }}>"Reply to reviews"</strong> permission and click Send Invite</li>
                  <li>Return here and click <strong>Verify Connection</strong> below</li>
                </ol>
              </div>

              {verifyingError && (
                <div className="alert alert-error" style={{ marginBottom: '20px' }}>
                  ⚠️ {verifyingError}
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleVerifyConnection}
                disabled={verifying}
                style={{ width: '100%', padding: '12px', fontSize: '15px' }}
              >
                {verifying ? 'Testing Play Console Permission...' : 'Verify Connection & Activate'}
              </button>
            </div>
          ) : isActive ? (
            /* STATE B: ACTIVE (Live Review Approval Dashboard with Auto-Post Toggle) */
            <div style={{ width: '100%' }}>

              {/* Self-Serve Auto-Post Toggle Control Box */}
              <div className="dashboard-card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '18px', margin: 0 }}>Auto-Post Mode</h3>
                      <span className={`status-chip ${isAutoPost ? 'active' : 'awaiting'}`}>
                        {isAutoPost ? 'ACTIVE (AUTOMATIC)' : 'DISABLED (MANUAL APPROVAL)'}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', margin: 0 }}>
                      {isAutoPost
                        ? 'AI-generated replies are posted immediately to Google Play Store during review detection.'
                        : 'Review drafts require your manual review and approval before being posted to Google Play.'}
                    </p>
                  </div>

                  <label className="toggle-switch" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isAutoPost}
                      onChange={handleToggleAutoPost}
                      disabled={togglingAutoPost}
                      style={{ display: 'none' }}
                    />
                    <span
                      style={{
                        position: 'relative',
                        width: '46px',
                        height: '24px',
                        backgroundColor: isAutoPost ? 'var(--gold)' : 'var(--bg-panel-2)',
                        borderRadius: '24px',
                        transition: 'background-color 0.2s',
                        display: 'inline-block',
                        border: '1px solid var(--border)',
                        opacity: togglingAutoPost ? 0.6 : 1,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: isAutoPost ? '24px' : '2px',
                          width: '18px',
                          height: '18px',
                          backgroundColor: isAutoPost ? '#0f1115' : 'var(--text-muted)',
                          borderRadius: '50%',
                          transition: 'left 0.2s',
                        }}
                      />
                    </span>
                  </label>
                </div>
              </div>

              {/* Pending Reviews Section Header */}
              <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px' }}>
                  Pending Review Approvals ({reviews.length})
                </h3>
                <button className="btn-ghost" onClick={() => fetchCustomerReviews(currentUser)} disabled={loadingReviews} style={{ padding: '6px 12px', fontSize: '13px' }}>
                  {loadingReviews ? 'Refreshing...' : '↻ Refresh Queue'}
                </button>
              </div>

              {dashboardSuccess && (
                <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                  ✓ {dashboardSuccess}
                </div>
              )}

              {dashboardError && (
                <div className="alert alert-error" style={{ marginBottom: '20px' }}>
                  ⚠️ {dashboardError}
                </div>
              )}

              {/* Reviews List / Empty Queue State */}
              {loadingReviews ? (
                <div className="dashboard-card" style={{ textAlign: 'center' }}>
                  <p className="mono" style={{ color: 'var(--text-muted)' }}>Loading pending reviews...</p>
                </div>
              ) : reviews.length === 0 ? (
                <div className="dashboard-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎉</div>
                  <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>All caught up!</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14.5px' }}>
                    No reviews are currently awaiting approval for <strong style={{ color: 'var(--text)' }}>{customerProfile?.packageName}</strong>.
                  </p>
                </div>
              ) : (
                <div className="reviews-grid" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {reviews.map((review) => {
                    const isProcessing = processingDocs[review.id];
                    const currentText = editedTexts[review.id] ?? (review.draftReply || '');
                    const charCount = currentText.length;
                    const isOverLimit = charCount > 350;

                    return (
                      <div key={review.id} className="review-card">
                        {/* Review Author & Rating Bar */}
                        <div className="review-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div>
                            <strong style={{ fontSize: '15px' }}>{review.authorName || 'Anonymous User'}</strong>
                            <div style={{ fontSize: '13px', color: 'var(--gold)', marginTop: '2px' }}>
                              <StarRating rating={review.starRating} /> ({review.starRating} / 5 stars)
                            </div>
                          </div>
                          <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            ID: {review.id}
                          </span>
                        </div>

                        {/* Customer Review Text */}
                        <div className="review-body" style={{ background: 'var(--bg-panel-2)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '16px', fontSize: '14px', lineHeight: '1.6' }}>
                          "{review.reviewText}"
                        </div>

                        {/* Editable AI Draft Reply Box */}
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '12.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              AI Draft Reply (Editable)
                            </label>
                            <span className="mono" style={{ fontSize: '12px', color: isOverLimit ? 'var(--red)' : 'var(--text-muted)' }}>
                              {charCount} / 350 max characters
                            </span>
                          </div>
                          <textarea
                            className="form-textarea"
                            value={currentText}
                            onChange={(e) => setEditedTexts({ ...editedTexts, [review.id]: e.target.value })}
                            disabled={isProcessing}
                            rows={3}
                            style={{
                              borderColor: isOverLimit ? 'var(--red)' : undefined,
                            }}
                          />
                        </div>

                        {/* Action Buttons Toolbar */}
                        <div className="review-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
              {step === 2 && subStep === 'PROVISIONED' && (hasAuthAccount ? 'Welcome back! Enter your password' : 'Welcome! Set your password to get started')}
            </h2>
            <p className="auth-card__sub">
              {step === 1 && 'Enter your email address to continue'}
              {step === 2 && subStep === 'NOT_INVITED' && 'Invitation required for access'}
              {step === 2 && subStep === 'PROVISIONED' && (hasAuthAccount ? 'Enter your password to log in' : 'Create a password to set up your account')}
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

              {/* Sub-Outcome B: Pre-Provisioned -> Deterministic Password Flow Driven by hasAuthAccount */}
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
                    {submitting
                      ? (hasAuthAccount ? 'Logging in...' : 'Setting up account...')
                      : (hasAuthAccount ? 'Log In' : 'Create Password')}
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
