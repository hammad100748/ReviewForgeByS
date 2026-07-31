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

function TagBadge({ tag }) {
  const safeTag = (tag || 'other').toLowerCase();
  const labelMap = {
    praise: 'Praise',
    bug: 'Bug',
    feature: 'Feature',
    other: 'Other',
  };
  return (
    <span className={`tag-badge tag-${safeTag}`}>
      {labelMap[safeTag] || 'Other'}
    </span>
  );
}

function formatRelativeTime(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
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

  // Multi-App State
  const [apps, setApps] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [loadingApps, setLoadingApps] = useState(false);

  // Derived Selected App
  const selectedApp = apps.find(a => a.id === selectedAppId) || apps[0] || null;

  // Connection Verification State
  const [verifying, setVerifying] = useState(false);
  const [verifyingError, setVerifyingError] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-Post Toggle State
  const [togglingAutoPost, setTogglingAutoPost] = useState(false);

  // Tab State ('PENDING' | 'HISTORY')
  const [activeTab, setActiveTab] = useState('PENDING');

  // Customer Dashboard Reviews State
  const [reviews, setReviews] = useState([]);
  const [editedTexts, setEditedTexts] = useState({});
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [processingDocs, setProcessingDocs] = useState({});
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardSuccess, setDashboardSuccess] = useState('');

  // History Reviews State
  const [historyReviews, setHistoryReviews] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [undoingDocs, setUndoingDocs] = useState({});

  // Scalable Pending Reviews UI State (Filter, Sort, Accordion, Pagination, Bulk)
  const [filterBucket, setFilterBucket] = useState('ALL'); // 'ALL' | '1-2' | '3' | '4-5'
  const [sortBy, setSortBy] = useState('RATING_LOW'); // 'RATING_LOW' | 'RATING_HIGH' | 'NEWEST' | 'OLDEST'
  const [expandedDocId, setExpandedDocId] = useState(null);
  const [visibleLimit, setVisibleLimit] = useState(15);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);

      if (user) {
        fetchCustomerProfile(user);
      } else {
        setCustomerProfile(null);
        setApps([]);
        setSelectedAppId('');
        setReviews([]);
        setHistoryReviews([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Customer Apps List
  const fetchCustomerApps = async (user = currentUser) => {
    if (!user) return;
    setLoadingApps(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/customer/apps`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setApps(json.data);
        if (json.data.length > 0) {
          setSelectedAppId(prev => {
            const exists = json.data.some(a => a.id === prev);
            return exists ? prev : json.data[0].id;
          });
        }
      }
    } catch (err) {
      console.error('Fetch customer apps error:', err);
    } finally {
      setLoadingApps(false);
    }
  };

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
          fetchCustomerApps(user);
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

  // Fetch Customer Reviews Scoped to selectedAppId
  const fetchCustomerReviews = async (user = currentUser, appId = selectedAppId) => {
    if (!user) return;
    setLoadingReviews(true);
    setDashboardError('');
    try {
      const token = await user.getIdToken();
      const queryParam = appId ? `?appId=${encodeURIComponent(appId)}` : '';
      const res = await fetch(`${API_BASE}/customer/reviews/pending${queryParam}`, {
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

  // Fetch Customer History Scoped to selectedAppId
  const fetchCustomerHistory = async (user = currentUser, appId = selectedAppId) => {
    if (!user) return;
    setLoadingHistory(true);
    setDashboardError('');
    try {
      const token = await user.getIdToken();
      const queryParam = appId ? `?appId=${encodeURIComponent(appId)}` : '';
      const res = await fetch(`${API_BASE}/customer/reviews/history${queryParam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        setHistoryReviews(json.data || []);
      } else {
        setDashboardError(`Failed to load review history: ${json.error}`);
      }
    } catch (err) {
      setDashboardError(`Cannot fetch history: ${err.message}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Refetch reviews and history whenever selectedAppId changes
  useEffect(() => {
    if (currentUser && customerProfile?.onboardingStatus === 'ACTIVE' && selectedAppId) {
      fetchCustomerReviews(currentUser, selectedAppId);
      fetchCustomerHistory(currentUser, selectedAppId);
    }
  }, [selectedAppId]);

  // Customer Action: Undo Rejection
  const handleUndoReject = async (docId) => {
    if (!currentUser) return;
    setUndoingDocs(prev => ({ ...prev, [docId]: true }));
    setDashboardError('');
    setDashboardSuccess('');
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/customer/reviews/${docId}/undo-reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setHistoryReviews(prev => prev.filter(r => r.id !== docId));
        fetchCustomerReviews(currentUser, selectedAppId);
        setDashboardSuccess('Moved back to pending — check your Pending queue');
      } else {
        setDashboardError(`Failed to undo rejection: ${json.error}`);
      }
    } catch (err) {
      setDashboardError(`API error during undo: ${err.message}`);
    } finally {
      setUndoingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Customer Toggle Auto-Post Mode Handler per Selected App
  const handleToggleAutoPost = async () => {
    if (!currentUser || !selectedAppId) return;

    const previousState = Boolean(selectedApp?.autoPostEnabled);
    const nextState = !previousState;

    setTogglingAutoPost(true);
    setDashboardError('');
    setDashboardSuccess('');

    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/customer/apps/${selectedAppId}/autopost`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: nextState }),
      });

      const json = await res.json();

      if (json.success) {
        setApps(prev => prev.map(a => a.id === selectedAppId ? { ...a, autoPostEnabled: nextState } : a));

        if (nextState === true) {
          try {
            const bulkRes = await fetch(`${API_BASE}/customer/autopost/bulk-post-pending`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            const bulkJson = await bulkRes.json();
            if (bulkJson.success) {
              await fetchCustomerReviews(currentUser, selectedAppId);
              await fetchCustomerHistory(currentUser, selectedAppId);
              if (bulkJson.postedCount > 0) {
                setDashboardSuccess(`Auto-post enabled for ${selectedApp?.appName || 'app'} — ${bulkJson.postedCount} pending review(s) posted to Google Play.`);
              } else {
                setDashboardSuccess(`Auto-post mode ENABLED for ${selectedApp?.appName || 'selected app'}.`);
              }
            } else {
              setDashboardSuccess(`Auto-post mode ENABLED for ${selectedApp?.appName || 'selected app'}.`);
            }
          } catch (bulkErr) {
            setDashboardSuccess(`Auto-post mode ENABLED for ${selectedApp?.appName || 'selected app'}.`);
          }
        } else {
          setDashboardSuccess(`Auto-post mode DISABLED for ${selectedApp?.appName || 'selected app'}.`);
        }
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
        fetchCustomerApps(currentUser);
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

  // Single Merged Customer Action: Approve & Post Reply
  const handleApprove = async (docId) => {
    if (!currentUser) return;
    const currentText = editedTexts[docId] ?? '';
    const trimmedText = currentText.trim();

    if (!trimmedText) {
      setDashboardError('Reply text cannot be empty.');
      return;
    }

    if (trimmedText.length > 350) {
      setDashboardError(`Reply text length (${trimmedText.length} chars) exceeds Google's 350-character limit.`);
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
        body: JSON.stringify({ newText: trimmedText }),
      });

      const json = await res.json();
      if (json.success) {
        setReviews(prev => prev.filter(r => r.id !== docId));
        if (expandedDocId === docId) setExpandedDocId(null);
        fetchCustomerHistory(currentUser, selectedAppId);
        setDashboardSuccess('Reply posted to Google Play Store!');
      } else {
        setDashboardError(`Failed to post reply: ${json.error}`);
      }
    } catch (err) {
      setDashboardError(`API error during post: ${err.message}`);
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
        if (expandedDocId === docId) setExpandedDocId(null);
        fetchCustomerHistory(currentUser, selectedAppId);
        setDashboardSuccess(`Review draft rejected and moved to Sent History.`);
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
      if (hasAuthAccount) {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
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

  // Derived Statistics for Summary Bar & Filter Chips
  const totalCount = reviews.length;
  const totalPending = totalCount;
  const lowCount = reviews.filter(r => r.starRating <= 2).length;
  const midCount = reviews.filter(r => r.starRating === 3).length;
  const highCount = reviews.filter(r => r.starRating >= 4).length;

  // Unedited 4-5 star reviews for Bulk Approval
  const qualifyingBulkReviews = reviews.filter(r => {
    if (r.starRating < 4) return false;
    const currentText = editedTexts[r.id];
    if (typeof currentText === 'string' && currentText.trim() !== (r.draftReply || '').trim()) {
      return false;
    }
    return true;
  });

  // Client-Side Filtered Reviews
  const filteredReviews = reviews.filter(r => {
    if (filterBucket === '1-2') return r.starRating <= 2;
    if (filterBucket === '3') return r.starRating === 3;
    if (filterBucket === '4-5') return r.starRating >= 4;
    return true;
  });

  // Client-Side Sorted Reviews
  const sortedReviews = [...filteredReviews].sort((a, b) => {
    const getTime = (item) => {
      if (item.createdAtDate) return new Date(item.createdAtDate).getTime();
      if (item.createdAt) {
        return typeof item.createdAt.toDate === 'function' ? item.createdAt.toDate().getTime() : new Date(item.createdAt).getTime();
      }
      return 0;
    };

    if (sortBy === 'RATING_LOW') {
      if (a.starRating !== b.starRating) return a.starRating - b.starRating;
      return getTime(a) - getTime(b);
    }
    if (sortBy === 'RATING_HIGH') {
      if (a.starRating !== b.starRating) return b.starRating - a.starRating;
      return getTime(a) - getTime(b);
    }
    if (sortBy === 'NEWEST') {
      return getTime(b) - getTime(a);
    }
    if (sortBy === 'OLDEST') {
      return getTime(a) - getTime(b);
    }
    return 0;
  });

  const visibleReviews = sortedReviews.slice(0, visibleLimit);

  // Bulk Approve Action Execution
  const handleBulkApproveExecution = async () => {
    if (!currentUser || qualifyingBulkReviews.length === 0) return;

    setBulkProcessing(true);
    setShowBulkModal(false);
    setDashboardError('');
    setDashboardSuccess('');

    const total = qualifyingBulkReviews.length;
    let successCount = 0;
    const postedIds = [];

    for (let i = 0; i < total; i++) {
      const review = qualifyingBulkReviews[i];
      setDashboardSuccess(`Bulk posting in progress: ${i + 1} of ${total}...`);

      try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE}/customer/reviews/${review.id}/approve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.success) {
          successCount++;
          postedIds.push(review.id);
        }
      } catch (err) {
        console.error(`Bulk approve error for review ${review.id}:`, err);
      }
    }

    if (postedIds.length > 0) {
      setReviews(prev => prev.filter(r => !postedIds.includes(r.id)));
      if (postedIds.includes(expandedDocId)) setExpandedDocId(null);
      fetchCustomerHistory(currentUser, selectedAppId);
      setDashboardSuccess(`${successCount} replies posted successfully to Google Play Store!`);
    } else {
      setDashboardError(`Bulk approval process finished, but 0 replies were posted.`);
    }

    setBulkProcessing(false);
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
    const isAutoPost = Boolean(selectedApp?.autoPostEnabled);

    return (
      <div className="page-container">
        <header className="nav">
          <div className="nav__wrap">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <a href="#" className="nav__brand">
                <span className="nav__brand-mark"></span> ReviewForge
              </a>

              {/* APP SWITCHER DROPDOWN (Top-Left next to logo) */}
              {isActive && apps.length > 0 && (
                <div className="app-switcher-box">
                  <select
                    className="app-switcher-select"
                    value={selectedAppId || ''}
                    onChange={(e) => setSelectedAppId(e.target.value)}
                  >
                    {apps.map((app) => (
                      <option key={app.id} value={app.id}>
                        📱 {app.appName}
                      </option>
                    ))}
                  </select>
                  {selectedApp && (
                    <span className="app-switcher-subtext">
                      {selectedApp.packageName}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text)' }}>
                  {customerProfile?.name}
                </div>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {customerProfile?.email}
                </div>
              </div>
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
                  Grant ReviewForge permission to reply to reviews for <strong style={{ color: 'var(--text)' }}>{customerProfile?.appName || customerProfile?.packageName}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>({customerProfile?.packageName})</span>
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
                  <li>Under App Permissions, grant permission for <strong style={{ color: 'var(--text)' }}>{customerProfile?.appName || customerProfile?.packageName}</strong></li>
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
            /* STATE B: ACTIVE (Scalable Reviews Dashboard with App Switcher) */
            <div style={{ width: '100%' }}>

              {/* App-Specific Auto-Post Toggle Control Box */}
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
                        ? `AI-generated replies for ${selectedApp?.appName || 'this app'} are posted immediately to Google Play Store.`
                        : `Review drafts for ${selectedApp?.appName || 'this app'} require your manual approval before being posted.`}
                    </p>
                  </div>

                  <label className="toggle-switch" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isAutoPost}
                      onChange={handleToggleAutoPost}
                      disabled={togglingAutoPost || !selectedAppId}
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

              {/* MAIN DASHBOARD TABS NAVIGATION */}
              <div className="dashboard-tabs">
                <button
                  className={`dashboard-tab-btn ${activeTab === 'PENDING' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('PENDING');
                    fetchCustomerReviews(currentUser, selectedAppId);
                  }}
                >
                  Pending Queue ({reviews.length})
                </button>
                <button
                  className={`dashboard-tab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('HISTORY');
                    fetchCustomerHistory(currentUser, selectedAppId);
                  }}
                >
                  Sent History ({historyReviews.length})
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

              {/* ============================================================ */}
              {/* TAB 1: PENDING QUEUE VIEW */}
              {/* ============================================================ */}
              {activeTab === 'PENDING' && (
                <div>
                  {/* Pending Reviews Section Header */}
                  <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px' }}>
                      Pending Review Approvals ({reviews.length})
                    </h3>
                    <button className="btn-ghost" onClick={() => fetchCustomerReviews(currentUser, selectedAppId)} disabled={loadingReviews || bulkProcessing} style={{ padding: '6px 12px', fontSize: '13px' }}>
                      {loadingReviews ? 'Refreshing...' : '↻ Refresh Queue'}
                    </button>
                  </div>

                  {/* SUMMARY BAR & BULK APPROVE ACTION */}
                  {reviews.length > 0 && (
                    <div className="pending-summary-bar">
                      <div className="summary-left">
                        <span className="summary-total">{totalPending} Pending</span>
                        <span style={{ color: 'var(--line)' }}>•</span>
                        <div className="summary-breakdown">
                          <span className="summary-chip">{lowCount} are 1-2★</span>
                          <span className="summary-chip">{midCount} are 3★</span>
                          <span className="summary-chip">{highCount} are 4-5★</span>
                        </div>
                      </div>

                      {/* BULK APPROVE FOR UNEDITED POSITIVE REVIEWS */}
                      {qualifyingBulkReviews.length > 0 && (
                        <button
                          className="btn-bulk-approve"
                          onClick={() => setShowBulkModal(true)}
                          disabled={bulkProcessing}
                        >
                          ⚡ Approve All Unedited 4-5★ ({qualifyingBulkReviews.length})
                        </button>
                      )}
                    </div>
                  )}

                  {/* FILTER CHIPS & SORT CONTROLS */}
                  {reviews.length > 0 && (
                    <div className="pending-controls-bar">
                      <div className="filter-chips">
                        <button
                          className={`chip-btn ${filterBucket === 'ALL' ? 'active' : ''}`}
                          onClick={() => { setFilterBucket('ALL'); setVisibleLimit(15); }}
                        >
                          All ({totalCount})
                        </button>
                        <button
                          className={`chip-btn ${filterBucket === '1-2' ? 'active' : ''}`}
                          onClick={() => { setFilterBucket('1-2'); setVisibleLimit(15); }}
                        >
                          1-2★ ({lowCount})
                        </button>
                        <button
                          className={`chip-btn ${filterBucket === '3' ? 'active' : ''}`}
                          onClick={() => { setFilterBucket('3'); setVisibleLimit(15); }}
                        >
                          3★ ({midCount})
                        </button>
                        <button
                          className={`chip-btn ${filterBucket === '4-5' ? 'active' : ''}`}
                          onClick={() => { setFilterBucket('4-5'); setVisibleLimit(15); }}
                        >
                          4-5★ ({highCount})
                        </button>
                      </div>

                      <div className="sort-group">
                        <label>Sort by:</label>
                        <select
                          className="sort-select"
                          value={sortBy}
                          onChange={(e) => { setSortBy(e.target.value); setVisibleLimit(15); }}
                        >
                          <option value="RATING_LOW">Lowest Rating First</option>
                          <option value="RATING_HIGH">Highest Rating First</option>
                          <option value="NEWEST">Newest First</option>
                          <option value="OLDEST">Oldest First</option>
                        </select>
                      </div>
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
                        No reviews are currently awaiting approval for{' '}
                        <strong style={{ color: 'var(--text)' }}>
                          {selectedApp?.appName || selectedApp?.packageName || 'this app'}
                        </strong>
                        {selectedApp && selectedApp.appName !== selectedApp.packageName && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}> ({selectedApp.packageName})</span>
                        )}
                        .
                      </p>
                    </div>
                  ) : sortedReviews.length === 0 ? (
                    <div className="dashboard-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
                      <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>No reviews match filter</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                        Try selecting a different star rating filter above.
                      </p>
                    </div>
                  ) : (
                    <div className="reviews-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {visibleReviews.map((review) => {
                        const isExpanded = expandedDocId === review.id;
                        const isProcessing = processingDocs[review.id];
                        const currentText = editedTexts[review.id] ?? (review.draftReply || '');
                        const charCount = currentText.length;
                        const isOverLimit = charCount > 350;

                        // Check if edited in current session
                        const isEditedInSession = typeof editedTexts[review.id] === 'string' &&
                          editedTexts[review.id].trim() !== (review.draftReply || '').trim();

                        return (
                          <div key={review.id} style={{ display: 'flex', flexDirection: 'column' }}>
                            {/* COLLAPSED ROW VIEW WITH TAG BADGE */}
                            <div
                              className={`collapsed-row ${isExpanded ? 'expanded-active' : ''}`}
                              onClick={() => setExpandedDocId(isExpanded ? null : review.id)}
                            >
                              <div className="collapsed-left">
                                <StarRating rating={review.starRating} />
                                <TagBadge tag={review.tag} />
                                <span className="collapsed-author">{review.authorName || 'Anonymous'}</span>
                                <span className="collapsed-snippet">"{review.reviewText}"</span>
                              </div>

                              <div className="collapsed-right">
                                {isEditedInSession && <span className="badge-edited">Edited</span>}
                                <span className="chevron-icon">{isExpanded ? '▲' : '▼'}</span>
                              </div>
                            </div>

                            {/* EXPANDED CARD VIEW (ACCORDION) WITH TAG BADGE */}
                            {isExpanded && (
                              <div className="expanded-card-wrap">
                                <div className="review-card">
                                  {/* Review Author & Rating Bar */}
                                  <div className="review-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <div>
                                      <strong style={{ fontSize: '15px' }}>{review.authorName || 'Anonymous User'}</strong>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--gold)', marginTop: '4px' }}>
                                        <StarRating rating={review.starRating} />
                                        <TagBadge tag={review.tag} />
                                        <span style={{ color: 'var(--text-muted)' }}>({review.starRating} / 5 stars)</span>
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
                                      className="btn btn-reject"
                                      onClick={() => handleReject(review.id)}
                                      disabled={isProcessing}
                                    >
                                      {isProcessing ? 'Rejecting...' : '✕ Reject'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* PAGINATION / LOAD MORE BUTTON */}
                      {sortedReviews.length > visibleLimit && (
                        <div className="load-more-container">
                          <button
                            className="btn-ghost"
                            onClick={() => setVisibleLimit(prev => prev + 15)}
                            style={{ padding: '10px 24px', fontSize: '14px' }}
                          >
                            Load More ({sortedReviews.length - visibleLimit} remaining)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 2: SENT / HISTORY VIEW */}
              {/* ============================================================ */}
              {activeTab === 'HISTORY' && (
                <div>
                  <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px' }}>
                      Sent & Decision History ({historyReviews.length})
                    </h3>
                    <button className="btn-ghost" onClick={() => fetchCustomerHistory(currentUser, selectedAppId)} disabled={loadingHistory} style={{ padding: '6px 12px', fontSize: '13px' }}>
                      {loadingHistory ? 'Refreshing...' : '↻ Refresh History'}
                    </button>
                  </div>

                  {loadingHistory ? (
                    <div className="dashboard-card" style={{ textAlign: 'center' }}>
                      <p className="mono" style={{ color: 'var(--text-muted)' }}>Loading history...</p>
                    </div>
                  ) : historyReviews.length === 0 ? (
                    <div className="dashboard-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>📜</div>
                      <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>No review history yet</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '14.5px' }}>
                        Posted or rejected reviews for{' '}
                        <strong style={{ color: 'var(--text)' }}>
                          {selectedApp?.appName || selectedApp?.packageName || 'this app'}
                        </strong>
                        {selectedApp && selectedApp.appName !== selectedApp.packageName && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}> ({selectedApp.packageName})</span>
                        )}
                        {' '}will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="reviews-grid" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {historyReviews.map((item) => {
                        const isPosted = item.status === 'posted';
                        const isRejected = item.status === 'rejected';
                        const isUndoing = undoingDocs[item.id];

                        const eventDate = item.postedAt || item.updatedAt || item.createdAt;
                        const relativeTimeStr = formatRelativeTime(eventDate);
                        const timeLabel = isPosted
                          ? `posted ${relativeTimeStr}`
                          : `rejected ${relativeTimeStr}`;

                        return (
                          <div key={item.id} className="review-card" style={{ background: 'var(--bg-panel)' }}>
                            {/* Header */}
                            <div className="review-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                              <div>
                                <strong style={{ fontSize: '15px' }}>{item.authorName || 'Anonymous User'}</strong>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                  <StarRating rating={item.starRating} />
                                  <TagBadge tag={item.tag} />
                                  <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                                    {timeLabel}
                                  </span>
                                </div>
                              </div>

                              <span className={`status-chip ${isPosted ? 'active' : 'awaiting'}`} style={{ borderColor: isRejected ? 'rgba(168, 68, 43, 0.4)' : undefined, color: isRejected ? '#f7a390' : undefined, background: isRejected ? 'rgba(168, 68, 43, 0.15)' : undefined }}>
                                {isPosted ? 'POSTED' : 'REJECTED'}
                              </span>
                            </div>

                            {/* User Review Text */}
                            <div className="review-body" style={{ background: 'var(--bg-panel-2)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '16px', fontSize: '14px', lineHeight: '1.6' }}>
                              "{item.reviewText}"
                            </div>

                            {/* Posted Reply vs Rejected Action Bar */}
                            {isPosted && (
                              <div style={{ background: 'rgba(95, 203, 155, 0.06)', border: '1px solid rgba(95, 203, 155, 0.25)', borderRadius: '6px', padding: '12px 14px' }}>
                                <label style={{ fontSize: '11.5px', color: 'var(--mint)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                                  ✓ Posted Developer Reply
                                </label>
                                <p style={{ fontSize: '13.5px', color: 'var(--text)', margin: 0, lineHeight: '1.5' }}>
                                  "{item.draftReply}"
                                </p>
                              </div>
                            )}

                            {isRejected && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(168, 68, 43, 0.08)', border: '1px solid rgba(168, 68, 43, 0.25)', borderRadius: '6px', padding: '12px 14px' }}>
                                <span style={{ fontSize: '13.5px', color: '#f7a390' }}>
                                  ✕ Review draft was rejected
                                </span>
                                <button
                                  className="btn-ghost"
                                  onClick={() => handleUndoReject(item.id)}
                                  disabled={isUndoing}
                                  style={{ padding: '6px 14px', fontSize: '13px', borderColor: 'var(--gold)', color: 'var(--gold)' }}
                                >
                                  {isUndoing ? 'Undoing...' : '↩ Undo Rejection'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
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

        {/* BULK APPROVE CONFIRMATION MODAL */}
        {showBulkModal && (
          <div className="bulk-modal-overlay" onClick={() => setShowBulkModal(false)}>
            <div className="bulk-modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: '20px', marginBottom: '12px', color: 'var(--text)' }}>
                Bulk Approve Positive Reviews
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: '1.6', marginBottom: '24px' }}>
                This will immediately post <strong>{qualifyingBulkReviews.length}</strong> review replies for <strong>{selectedApp?.appName || 'this app'}</strong> to Google Play Store using their AI-generated drafts as-is. Continue?
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  className="btn-ghost"
                  onClick={() => setShowBulkModal(false)}
                  disabled={bulkProcessing}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleBulkApproveExecution}
                  disabled={bulkProcessing}
                  style={{ width: 'auto' }}
                >
                  {bulkProcessing ? 'Posting Replies...' : 'Yes, Approve All'}
                </button>
              </div>
            </div>
          </div>
        )}
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
