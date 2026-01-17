import { useState, useEffect, useCallback } from 'react';
import socket from './socket';
import {
  requestNotificationPermission,
  sendNotification,
  getNotificationPermissionStatus
} from './utils/notifications';
import {
  playNotificationSound,
  playUrgentSound,
  playSuccessSound,
  playPopSound,
  playMeTooSound
} from './utils/sounds';
import {
  getUserId,
  onUserDataChange
} from './utils/userIdentity';
import './App.css';

// Get the API base URL dynamically
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // In production, use same host; in dev, use localhost:3001
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }
  return window.location.origin;
};

const API_BASE_URL = getApiBaseUrl();

// Format time ago
const formatTimeAgo = (isoString) => {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};

// TimeAgo Component for auto-refresh
function TimeAgo({ isoString }) {
  const [timeLabel, setTimeLabel] = useState(() => formatTimeAgo(isoString));

  useEffect(() => {
    // Initial set
    setTimeLabel(formatTimeAgo(isoString));
    
    // Update every minute
    const interval = setInterval(() => {
      setTimeLabel(formatTimeAgo(isoString));
    }, 60000);

    return () => clearInterval(interval);
  }, [isoString]);

  return <span className="queue-item-time">{timeLabel}</span>;
}

// Home Link Component
function HomeLink() {
  return (
    <a
      href="#"
      className="theme-icon-btn"
      aria-label="Back to Home"
      title="Back to Home"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
    </a>
  );
}

// GitHub Link Component

function GitHubLink() {
  return (
    <a
      href="https://github.com/Leo6Leo/ece297-queue"
      target="_blank"
      rel="noopener noreferrer"
      className="theme-icon-btn"
      aria-label="View on GitHub"
      title="View source on GitHub"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
      </svg>
    </a>
  );
}

// Theme Toggle Component
function ThemeToggle({ theme, setTheme }) {
  return (
    <button
      className="theme-icon-btn"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        // Moon Icon (for Dark Mode -> switch to Light)
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      ) : (
        // Sun Icon (for Light Mode -> switch to Dark)
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      )}
    </button>
  );
}

// Notification Toggle Component
function NotificationToggle({ status, onEnable }) {
  if (status === 'unsupported') return null;

  const isEnabled = status === 'granted';

  return (
    <button
      className={`theme-icon-btn ${isEnabled ? 'enabled' : ''}`}
      onClick={!isEnabled ? onEnable : undefined}
      disabled={isEnabled}
      aria-label={isEnabled ? "Notifications Enabled" : "Enable Notifications"}
      title={isEnabled ? "Notifications Enabled" : "Enable Notifications"}
      style={isEnabled ? { color: 'var(--success)', borderColor: 'var(--success)', cursor: 'default' } : {}}
    >
      {isEnabled ? (
        // Bell with Check (Enabled)
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      ) : (
        // Bell Off (Disabled)
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          <line x1="2" y1="2" x2="22" y2="22"></line>
        </svg>
      )}
    </button>
  );
}

// Toast notification component
function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.type} ${toast.exiting ? 'exiting' : ''}`}
          onClick={() => removeToast(toast.id)}
        >
          <div className="toast-header">
            {toast.type === 'success' && '✓'}
            {toast.type === 'warning' && '!'}
            {toast.type === 'error' && '✕'}
            {toast.type === 'info' && 'i'}
            <span>{toast.title}</span>
          </div>
          <div className="toast-message">{toast.message}</div>
        </div>
      ))}
    </div>
  );
}

// Full Window Alert Component
function FullWindowAlert({ message, queueType, onDismiss }) {
  const isAutoAlert = message === "You're next! Please stay on the page.";

  return (
    <div className="full-window-alert">
      <div className="alert-content">
        <span className="alert-icon">🔔</span>
        <h2 className="alert-title">Attention</h2>
        <p className="alert-message">{message}</p>
        {!isAutoAlert && (
          <button className="alert-btn" onClick={onDismiss}>
            ACK
          </button>
        )}
      </div>
    </div>
  );
}

// Success Check-in Overlay
function SuccessOverlay({ message, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="success-overlay" onClick={onDismiss}>
      <div className="success-content">
        <div className="checkmark-circle">
          <div className="background"></div>
          <div className="checkmark draw"></div>
        </div>
        <h2 className="success-title">Checked In!</h2>
        <p className="success-message">{message}</p>
      </div>
    </div>
  );
}

// Connection Status Component
function ConnectionStatus({ isConnected }) {
  return (
    <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
      <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
      {isConnected ? 'Connected' : 'Disconnected'}
    </div>
  );
}

// Queue Item component
function QueueItem({ item, position, isYou, isTA, queueType, onRemove, onCallSpecific, onCancelCall, currentUserId, onFollow, onUnfollow, inputName }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isAssisting = item.status === 'assisting';
  const isCalled = item.status === 'called';
  const isQuestionType = queueType === 'question' || item.type === 'question';
  const isFollowing = item.followers?.some(f => f.userId === currentUserId);
  const followerCount = item.followers?.length || 0;
  const canFollow = !isTA && isQuestionType && !isYou && item.userId !== currentUserId && item.status === 'waiting' && item.description;
  // Only show expand if description is long enough (>50 chars) or has followers
  const descriptionIsLong = item.description && item.description.length > 50;
  const hasFollowers = item.followers && item.followers.length > 0;
  // Allow expand for TA (long description + followers) or for students viewing question queue items with long description
  const hasExpandableContent = (isTA && (descriptionIsLong || hasFollowers)) ||
                               (!isTA && isQuestionType && descriptionIsLong);

  const handleCardClick = () => {
    if (hasExpandableContent) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <li
      className={`queue-item ${isYou ? 'is-you' : ''} ${isAssisting ? 'is-assisting' : ''} ${isCalled ? 'is-called' : ''} ${isExpanded ? 'is-expanded' : ''} ${hasExpandableContent ? 'is-expandable' : ''}`}
      onClick={handleCardClick}
    >
      <span className={`queue-position ${isAssisting ? 'assisting' : isCalled ? 'called' : position === 1 ? 'first' : position === 2 ? 'second' : position === 3 ? 'third' : ''}`}>
        {isAssisting ? '●' : isCalled ? '!' : position}
      </span>
      <div className="queue-item-info">
        <div className="queue-item-name">
          {item.name}
          {isYou && ' (You)'}
          {isAssisting && <span className="status-badge assisting">Currently Assisting</span>}
          {isCalled && <span className="status-badge called">Called</span>}
          {isTA && queueType === 'combined' && (
             <span className={`queue-badge ${item.type || 'marking'}`}>
               {(item.type === 'marking' ? 'M' : 'Q')}
             </span>
          )}
          {followerCount > 0 && (
            <span className="follower-badge" title={`${followerCount} student${followerCount > 1 ? 's' : ''} with same question`}>
              +{followerCount}
            </span>
          )}
          {hasExpandableContent && (
            <span className="expand-indicator">▶</span>
          )}
        </div>
        {(queueType === 'marking' || item.type === 'marking') && (
          <div className="queue-item-id">ID: ****{item.studentId}</div>
        )}
        {item.description && (
          <div className={`queue-item-description ${isExpanded ? 'expanded' : ''}`}>{item.description}</div>
        )}
        {isTA && item.followers && item.followers.length > 0 && (
          <div className={`queue-item-followers ${isExpanded ? '' : 'collapsed'}`}>
            <span className="followers-label">Same question:</span> {item.followers.map(f => f.name).join(', ')}
          </div>
        )}
      </div>
      <TimeAgo isoString={item.joinedAt} />
      {canFollow && (
        <button
          className={`btn btn-sm ${isFollowing ? 'btn-following' : 'btn-follow'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isFollowing) {
              onUnfollow(item.id);
            } else {
              onFollow(item.id, inputName);
            }
          }}
          title={isFollowing ? 'Click to unfollow this question' : 'Click if you have the same question - you\'ll be notified when it\'s answered'}
        >
          {isFollowing ? '✓ Following' : '🙋 Me too!'}
        </button>
      )}
      {isFollowing && isCalled && (
        <span className="status-badge called">Come join!</span>
      )}
      {isTA && item.status === 'waiting' && (
        <button
           className="btn btn-sm btn-secondary"
           style={{ margin: '0 8px', padding: '4px 10px', fontSize: '0.75rem', width: 'auto', cursor: 'pointer', position: 'relative', zIndex: 20 }}
           onClick={(e) => {
             e.stopPropagation();
             onCallSpecific(item.type || queueType, item.id);
           }}
           title="Call this student"
        >
          Call
        </button>
      )}
      {isTA && item.status === 'called' && (
        <button
           className="btn btn-sm btn-secondary"
           style={{ margin: '0 8px', padding: '4px 10px', fontSize: '0.75rem', width: 'auto', cursor: 'pointer', position: 'relative', zIndex: 20, color: 'var(--warning)', borderColor: 'var(--warning)' }}
           onClick={(e) => {
             e.stopPropagation();
             onCancelCall(item.type || queueType, item.id);
           }}
           title="Cancel call (return to waiting)"
        >
          Cancel
        </button>
      )}
      {isTA && (
        <button
          className="btn btn-icon btn-danger"
          onClick={(e) => {
             e.stopPropagation();
             onRemove(item.id);
          }}
          title="Remove from queue"
        >
          ✕
        </button>
      )}
    </li>
  );
}

// Queue Card component
function QueueCard({
  type,
  title,
  icon,
  queue,
  myEntry,      // For single queue mode
  allMyEntries, // For combined mode
  isTA,
  onJoin,
  onLeave,
  onCall,
  onCallMarking,
  onCallQuestion,
  onCallSpecific,
  onCancelCall,
  onStartAssisting,
  onNext,
  onPushBack,
  onRemove,
  onFollow,
  onUnfollow
}) {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinType, setJoinType] = useState('marking'); // For combined view joining

  // Initialize userId
  useEffect(() => {
    getUserId(); // Ensure userId exists
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Determine effective type for validation and join
    const effectiveType = type === 'combined' ? joinType : type;
    
    if (effectiveType === 'marking' && (!studentId.trim() || studentId.length !== 4)) return;

    setIsJoining(true);
    await onJoin(effectiveType)({ // onJoin now expects type if curried, or we adjust how onJoin is passed
      name: name.trim(),
      studentId: studentId.trim(),
      email: email.trim(),
      description: description.trim(),
      userId: getUserId()
    });
    setDescription('');
    setIsJoining(false);
  };

  // Helper to find position
  function itemPosition(queue, entryId) {
    const entry = queue.find(item => item.id === entryId);
    if (!entry || (entry.status !== 'waiting' && entry.status !== 'called')) return null;
    return entry.position;
  }

  // Calculate positions for combined view or single view
  let myPositions = [];
  if (type === 'combined' && !isTA && allMyEntries) {
    if (allMyEntries.marking) {
        // Find in the combined queue
        const pos = itemPosition(queue, allMyEntries.marking.entryId);
        if (pos !== null) myPositions.push({ type: 'marking', position: pos, status: allMyEntries.marking.status, entryId: allMyEntries.marking.entryId });
        else if (allMyEntries.marking.status === 'assisting') myPositions.push({ type: 'marking', status: 'assisting' });
    }
    if (allMyEntries.question) {
        const pos = itemPosition(queue, allMyEntries.question.entryId);
        if (pos !== null) myPositions.push({ type: 'question', position: pos, status: allMyEntries.question.status, entryId: allMyEntries.question.entryId });
        else if (allMyEntries.question.status === 'assisting') myPositions.push({ type: 'question', status: 'assisting' });
    }
  } else if (myEntry) {
     const pos = itemPosition(queue, myEntry.entryId);
     if (pos !== null) myPositions.push({ type, position: pos, status: myEntry.status, entryId: myEntry.entryId });
     else if (myEntry.status === 'assisting') myPositions.push({ type, status: 'assisting' });
  }

  const isAssistingAny = queue.some(item => item.status === 'assisting');
  const topItem = queue.find(item => item.status === 'waiting' || item.status === 'called');
  const isTopCalled = topItem && topItem.status === 'called';
  const waitingCount = queue.filter(item => item.status === 'waiting' || item.status === 'called').length;

  return (
    <div className={`queue-card ${type}`}>
      <div className="queue-header">
        <div className="queue-title">
          <div className={`queue-icon ${type === 'combined' ? 'marking' : type}`}>{icon}</div>
          <h2>{title}</h2>
        </div>
        <span className="queue-count">{waitingCount} waiting</span>
      </div>

      {/* Your position banner (student view only) */}
      {!isTA && myPositions.length > 0 && (
        <div className={`your-position ${myPositions.some(p => p.status === 'called') ? 'is-called' : myPositions.some(p => p.status === 'assisting') ? 'is-assisting' : ''}`}>
          {myPositions.map((pos, idx) => (
            <div key={idx} style={{ marginBottom: idx < myPositions.length - 1 ? '16px' : '0', borderBottom: idx < myPositions.length - 1 ? '1px solid rgba(255,255,255,0.3)' : 'none', paddingBottom: idx < myPositions.length - 1 ? '16px' : '0' }}>
              <h3>
                {pos.status === 'assisting' ? `You're Being Assisted (${pos.type})!` : 
                 pos.status === 'called' ? `Raise your hand (${pos.type})!` : `Your Position (${pos.type})`}
              </h3>
              
              {pos.status === 'assisting' ? (
                <p className="position-number">✓</p>
              ) : pos.status === 'called' ? (
                 <p className="position-number">!</p>
              ) : (
                <>
                  <p className="position-number">#{pos.position}</p>
                  <p>{pos.position === 1 ? "You're next!" : `${pos.position - 1} ahead of you`}</p>
                </>
              )}
              
              <div className="leave-btn-container" style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                {pos.status === 'waiting' && pos.position <= 3 && waitingCount > 1 && (
                    <button 
                      className="btn btn-sm" 
                      style={{ background: 'rgba(255,255,255,0.9)', color: '#333' }}
                      onClick={onPushBack(pos.type, pos.entryId)}
                    >
                      Push Back
                    </button>
                )}
                {pos.status !== 'assisting' && (
                  <button 
                      className="btn btn-sm" 
                      style={{ color: 'white', borderColor: 'white' }}
                      onClick={onLeave(pos.type, pos.entryId)}
                  >
                    Leave Queue
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Queue list */}
      {queue.length > 0 ? (
        <ul className="queue-list">
          {queue.map((item, index) => (
            <QueueItem
              key={item.id}
              item={item}
              position={item.position}
              isYou={myPositions.some(p => p.entryId === item.id)}
              isTA={isTA}
              queueType={type}
              onRemove={onRemove}
              onCallSpecific={onCallSpecific}
              onCancelCall={onCancelCall}
              currentUserId={getUserId()}
              onFollow={onFollow}
              onUnfollow={onUnfollow}
              inputName={name}
            />
          ))}
        </ul>
      ) : (
        <div className="queue-empty">
          <div className="queue-empty-icon">—</div>
          <p>No one in queue</p>
        </div>
      )}

      {/* TA Controls */}
      {isTA && (
        <div className="ta-controls">
          {isAssistingAny ? (
            <button className={`btn btn-${type === 'combined' ? 'marking' : type}`} onClick={onNext}>
              Finish Assisting
            </button>
          ) : isTopCalled ? (
             <>
               <button 
                 className={`btn btn-success`}
                 style={{ background: '#22c55e', color: 'white', flex: 2 }} 
                 onClick={() => onStartAssisting(topItem.id)}
               >
                 Start Assisting {topItem.name}
               </button>
               <button 
                 className={`btn btn-secondary`}
                 style={{ color: 'var(--warning)', borderColor: 'var(--warning)', flex: 1 }}
                 onClick={() => onCancelCall(topItem.type || type, topItem.id)}
               >
                 Cancel Call
               </button>
             </>
          ) : type === 'combined' ? (
             <>
                <button className="btn btn-marking" onClick={onCallMarking}>Next Marking</button>
                <button className="btn btn-question" onClick={onCallQuestion}>Next Question</button>
             </>
          ) : (
            <button 
              className={`btn btn-${type === 'combined' ? 'marking' : type}`} 
              onClick={onCall}
              disabled={waitingCount === 0}
            >
              Call Next Student
            </button>
          )}
        </div>
      )}

      {/* Join form (only for students not in queue) */}
      {!isTA && (type !== 'combined' ? !myEntry : (!allMyEntries?.marking || !allMyEntries?.question)) && (
        <div className="join-container">
           {type === 'combined' && (
             <div className="join-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                <button 
                  className={`btn btn-sm ${joinType === 'marking' ? 'btn-marking' : 'btn-secondary'}`}
                  onClick={() => setJoinType('marking')}
                  disabled={allMyEntries?.marking}
                >
                  Join Marking
                </button>
                <button 
                  className={`btn btn-sm ${joinType === 'question' ? 'btn-question' : 'btn-secondary'}`}
                  onClick={() => setJoinType('question')}
                  disabled={allMyEntries?.question}
                >
                  Join Question
                </button>
             </div>
           )}
           
           {/* Only show form if the selected type is not already joined */}
           {((type === 'combined' && !allMyEntries?.[joinType]) || (type !== 'combined' && !myEntry)) && (
            <form className="join-form" onSubmit={handleSubmit} style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
              <div className="form-group">
                <label className="form-label">Your Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {(type === 'marking' || (type === 'combined' && joinType === 'marking')) && (
                <div className="form-group">
                  <label className="form-label">Last 4 Digits of Student ID</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., 1234"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    pattern="\d{4}"
                    required
                  />
                </div>
              )}

              {(type === 'question' || (type === 'combined' && joinType === 'question')) && (
                <div className="form-group">
                  <label className="form-label">Brief Description (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Need help with pathfinding algorithm"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={100}
                  />
                </div>
              )}

              {/* Email field temporarily hidden
              <div className="form-group">
                <label className="form-label">Email (optional, for notifications)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              */}

              <button
                type="submit"
                className={`btn btn-${type === 'combined' ? joinType : type}`}
                disabled={isJoining || !name.trim() || ((type === 'marking' || (type === 'combined' && joinType === 'marking')) && studentId.length !== 4)}
              >
                {isJoining ? <span className="spinner"></span> : `Join Queue`}
              </button>
            </form>
           )}
        </div>
      )}
    </div>
  );
}

// Home Page Component
function HomePage({ theme, setTheme }) {
  return (
    <div className="home-page">
      <h1 className="home-title">ECE297 Queue</h1>
      <p className="home-subtitle">TA Practical Session Queue Management</p>

      <div className="home-buttons">
        <a href="#student" className="home-btn student">
          Student
        </a>
        <a href="#ta" className="home-btn ta">
          TA Login
        </a>
      </div>

      <div className="home-footer">
        <GitHubLink />
        <ThemeToggle theme={theme} setTheme={setTheme} />
      </div>
    </div>
  );
}

// TA Login Page Component
function TALoginPage({ onLogin, theme, setTheme }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/ta-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        onLogin();
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Authentication failed. Please try again.');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>TA Login</h1>
        <p>Enter the TA password to access the dashboard</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              required
              autoFocus
            />
          </div>

          <button type="submit" className="btn btn-marking" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <a href="#" className="nav-link" style={{ display: 'inline-flex' }}>
            ← Back to Home
          </a>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <GitHubLink />
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </div>
  );
}

// Student View Component
function StudentView({
  queues,
  myEntries,
  isConnected,
  theme,
  setTheme,
  notificationStatus,
  onEnableNotifications,
  joinQueue,
  leaveQueue,
  pushBack,
  followQuestion,
  unfollowQuestion
}) {
  return (
    <div className="app">
      <header className="header">
        <div className="page-header">
          <div className="page-header-left">
            <HomeLink />
          </div>
          <div className="header-controls">
            <ConnectionStatus isConnected={isConnected} />
            <NotificationToggle status={notificationStatus} onEnable={onEnableNotifications} />
            <GitHubLink />
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>

        <h1>ECE297 Queue</h1>
        <p>Join a queue below and wait for your turn</p>
      </header>

      <main className="main-content">
        <QueueCard
          type="marking"
          title="Marking Queue"
          icon="M"
          queue={queues.marking}
          myEntry={myEntries.marking}
          isTA={false}
          onJoin={joinQueue}
          onLeave={leaveQueue}
          onPushBack={pushBack}
          onCall={() => { }}
          onCallMarking={() => { }}
          onCallQuestion={() => { }}
          onCallSpecific={() => { }}
          onStartAssisting={() => { }}
          onNext={() => { }}
          onRemove={() => { }}
          onFollow={followQuestion}
          onUnfollow={unfollowQuestion}
        />

        <QueueCard
          type="question"
          title="Question Queue"
          icon="Q"
          queue={queues.question}
          myEntry={myEntries.question}
          isTA={false}
          onJoin={joinQueue}
          onLeave={leaveQueue}
          onPushBack={pushBack}
          onCall={() => { }}
          onCallMarking={() => { }}
          onCallQuestion={() => { }}
          onCallSpecific={() => { }}
          onStartAssisting={() => { }}
          onNext={() => { }}
          onRemove={() => { }}
          onFollow={followQuestion}
          onUnfollow={unfollowQuestion}
        />
      </main>
    </div>
  );
}

// TA View Component
function TAView({
  queues,
  isConnected,
  theme,
  setTheme,
  onLogout,
  taCall,
  taCallSpecific,
  taCancelCall,
  taStartAssisting,
  taNext,
  taRemove,
  taClearAll
}) {
  // Merge and sort queues
  const combinedQueue = [
    ...queues.marking.map(item => ({ ...item, type: 'marking' })),
    ...queues.question.map(item => ({ ...item, type: 'question' }))
  ].sort((a, b) => {
    // Sort by status priority then time
    // Priority: assisting > called > waiting
    const statusScore = (status) => {
      if (status === 'assisting') return 3;
      if (status === 'called') return 2;
      return 1;
    };
    
    const scoreA = statusScore(a.status);
    const scoreB = statusScore(b.status);
    
    if (scoreA !== scoreB) return scoreB - scoreA; // Higher score first
    return new Date(a.joinedAt) - new Date(b.joinedAt); // Older time first
  });

  return (
    <div className="app">
      <header className="header">
        <div className="page-header">
          <div className="page-header-left">
            <a href="#" className="back-link">← Home</a>
            <span className="ta-badge">TA Mode</span>
          </div>
          <div className="header-controls">
            <ConnectionStatus isConnected={isConnected} />
            <GitHubLink />
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button className="logout-btn" onClick={onLogout}>Logout</button>
          </div>
        </div>

        <h1>TA Dashboard</h1>
        <p>Manage students (Marking & Questions)</p>
      </header>

      <main className="main-content single">
        <QueueCard
          type="combined"
          title="All Students"
          icon="∑"
          queue={combinedQueue}
          myEntry={null}
          isTA={true}
          onJoin={() => { }}
          onLeave={() => { }}
          onCall={() => { }} // Unused in combined mode
          onCallMarking={taCall('marking')}
          onCallQuestion={taCall('question')}
          onCallSpecific={taCallSpecific}
          onCancelCall={taCancelCall}
          onStartAssisting={taStartAssisting('combined')}
          onNext={taNext('combined')}
          onRemove={taRemove('combined')}
          onFollow={() => { }}
          onUnfollow={() => { }}
        />

        <div style={{ marginTop: '40px', padding: '20px', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', opacity: 0.8 }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Danger Zone</h3>
          <p style={{ fontSize: '0.875rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Resetting the queue will remove everyone from all queues. This is usually done at the end of a session.
          </p>
          <button className="btn btn-secondary" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={taClearAll}>
            Clear All Queues
          </button>
        </div>
      </main>
    </div>
  );
}

// Helper to get room from URL
const getRoomFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('ta');
};

// No Room Error Page
function NoRoomPage({ theme, setTheme }) {
  return (
    <div className="home-page">
      <h1 className="home-title">ECE297 Queue</h1>
      <p className="home-subtitle">Queue Management System</p>
      
      <div className="login-card" style={{ maxWidth: '500px' }}>
        <h2 style={{ color: 'var(--danger)', marginBottom: '16px' }}>Invalid Link</h2>
        <p style={{ marginBottom: '24px' }}>
          Please use the link provided by your TA (e.g., ?ta=name).
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          No specific TA room was found in the URL.
        </p>
      </div>

      <div className="home-footer">
        <GitHubLink />
        <ThemeToggle theme={theme} setTheme={setTheme} />
      </div>
    </div>
  );
}

// Main App
function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [queues, setQueues] = useState({ marking: [], question: [] });
  const [myEntries, setMyEntries] = useState({ marking: null, question: null });
  const [toasts, setToasts] = useState([]);
  const [notificationStatus, setNotificationStatus] = useState(getNotificationPermissionStatus());
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'light';
  });
  const [page, setPage] = useState('home');
  const [isTAAuthenticated, setIsTAAuthenticated] = useState(() => {
    return sessionStorage.getItem('ta_auth') === 'true';
  });
  const [turnAlert, setTurnAlert] = useState(null);
  const [successOverlay, setSuccessOverlay] = useState(null);
  
  // Get room from URL
  const [room] = useState(getRoomFromUrl);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Handle hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'student') {
        setPage('student');
      } else if (hash === 'ta') {
        setPage(isTAAuthenticated ? 'ta' : 'ta-login');
      } else {
        setPage('home');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isTAAuthenticated]);

  // Sync TA Auth to session storage
  useEffect(() => {
    sessionStorage.setItem('ta_auth', isTAAuthenticated);
  }, [isTAAuthenticated]);

  // Register identity with socket
  useEffect(() => {
    const userId = getUserId();

    if (isConnected && room) {
      socket.emit('register-user', { userId, room });
    }
  }, [isConnected, room]);

  // Listen for user data changes from other tabs
  useEffect(() => {
    return onUserDataChange((data) => {
      // Logic if we were saving user entries in localStorage
      // Currently we rely on server pushing state
    });
  }, []);

  const removeToast = useCallback((id) => {
    // Mark as exiting first
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    // Remove after animation
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  // Toast management
  const addToast = useCallback((title, message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  // Socket event handlers
  useEffect(() => {
    if (!room) return; // Don't setup socket listeners if no room

    const onConnect = () => {
      setIsConnected(true);
      addToast('Connected', 'You are now connected to the queue server.', 'success');
      // Re-register user on reconnect
      socket.emit('register-user', { userId: getUserId(), room });
    };

    const onDisconnect = () => {
      setIsConnected(false);
      addToast('Disconnected', 'Connection lost. Trying to reconnect...', 'error');
    };

    const onQueuesUpdate = (data) => {
      setQueues(data);
      
      // Update status in myEntries if user is in queue
      setMyEntries(prev => {
        const next = { ...prev };
        ['marking', 'question'].forEach(type => {
          if (next[type]) {
            const entry = data[type].find(item => item.id === next[type].entryId);
            if (entry) {
              next[type] = { 
                ...next[type], 
                status: entry.status,
                position: entry.position
              };
            } else {
              next[type] = null;
            }
          }
        });
        return next;
      });
    };

    const onRestoreEntries = (data) => {
      setMyEntries(data);
    };

    const onJoinedQueue = (data) => {
      setMyEntries(prev => ({
        ...prev,
        [data.queueType]: { 
          entryId: data.entryId, 
          position: data.position,
          status: 'waiting'
        }
      }));
      addToast('Joined Queue', `You are #${data.position} in the ${data.queueType} queue.`, 'success');
    };

    const onLeftQueue = (data) => {
      setMyEntries(prev => ({
        ...prev,
        [data.queueType]: null
      }));
      setTurnAlert(null); // Clear any alerts if you leave
    };

    const onTurnApproaching = (data) => {
      // Play sound
      playNotificationSound();

      // Show full screen alert
      setTurnAlert({
        message: data.message,
        queueType: data.queueType,
      });

      addToast('Your Turn is Coming', data.message, 'warning');
      sendNotification('Your Turn is Coming!', {
        body: data.message,
        tag: `turn-${data.queueType}`,
      });
    };

    const onBeingCalled = (data) => {
      // Play alert sound
      playUrgentSound();

      // Show full screen alert
      setTurnAlert({
        message: data.message,
        queueType: data.queueType,
      });

      sendNotification("It's Your Turn!", {
        body: data.message,
        tag: 'being-called',
        requireInteraction: true,
      });
    };
    
    const onPushedBack = (data) => {
      addToast('Pushed Back', `You are now #${data.position} in the queue.`, 'info');
      setTurnAlert(null); // Dismiss any turn alerts
    };

    const onFinishedAssisting = (data) => {
      addToast('Session Finished', data.message, 'success');
      playSuccessSound();
      // Status will be updated via queues-update (entry removed)
    };

    const onAssistingStarted = (data) => {
      setTurnAlert(null); // Dismiss alert when TA starts assisting
    };

    const onRemovedFromQueue = (data) => {
      addToast('Removed from Queue', data.message, 'info');
      setMyEntries(prev => ({
        ...prev,
        [data.queueType]: null
      }));
      setTurnAlert(null);
    };

    const onError = (data) => {
      addToast('Error', data.message, 'error');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('queues-update', onQueuesUpdate);
    socket.on('restore-entries', onRestoreEntries);
    socket.on('joined-queue', onJoinedQueue);
    socket.on('left-queue', onLeftQueue);
    socket.on('turn-approaching', onTurnApproaching);
    socket.on('being-called', onBeingCalled);
    socket.on('pushed-back', onPushedBack);
    socket.on('finished-assisting', onFinishedAssisting);
    socket.on('assisting-started', onAssistingStarted);
    socket.on('removed-from-queue', onRemovedFromQueue);
    socket.on('error', onError);

    if (socket.connected) {
      setIsConnected(true);
      socket.emit('register-user', { userId: getUserId(), room });
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('queues-update', onQueuesUpdate);
      socket.off('restore-entries', onRestoreEntries);
      socket.off('joined-queue', onJoinedQueue);
      socket.off('left-queue', onLeftQueue);
      socket.off('turn-approaching', onTurnApproaching);
      socket.off('being-called', onBeingCalled);
      socket.off('pushed-back', onPushedBack);
      socket.off('finished-assisting', onFinishedAssisting);
      socket.off('assisting-started', onAssistingStarted);
      socket.off('removed-from-queue', onRemovedFromQueue);
      socket.off('error', onError);
    };
  }, [addToast, room]);

  // If no room is provided, show error page
  if (!room) {
    return <NoRoomPage theme={theme} setTheme={setTheme} />;
  }

  // Handle notification permission
  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    const status = getNotificationPermissionStatus();
    setNotificationStatus(status);
    
    if (granted) {
      addToast('Notifications Enabled', 'You will receive alerts when your turn approaches.', 'success');
      playNotificationSound(); // Test sound
    } else if (status === 'denied') {
      addToast('Notifications Blocked', 'Please enable notifications in your browser settings (address bar).', 'error');
    }
  };

  // Queue actions
  const joinQueue = (queueType) => (data) => {
    // Store user's name for future use (e.g., when following questions)
    if (data.name) {
      localStorage.setItem('queue_user_name', data.name);
    }
    const payload = { ...data, room };
    if (queueType === 'marking') {
      socket.emit('join-marking', payload);
    } else {
      socket.emit('join-question', payload);
    }
  };

  const leaveQueue = (queueType, entryId) => () => {
    socket.emit('leave-queue', {
      queueType,
      entryId,
      userId: getUserId(),
      room
    });
  };
  
  const pushBack = (queueType, entryId) => () => {
    socket.emit('push-back', {
      queueType,
      entryId,
      userId: getUserId(),
      room
    });
    // Optimistic toast
    addToast('Pushing Back...', 'Delaying your turn by 1 position.', 'info');
  };

  const followQuestion = (entryId, inputName) => {
    const userId = getUserId();

    // Try to get user's name from: 1) input box, 2) existing queue entry, 3) localStorage
    const userEntry = queues.marking.find(e => e.userId === userId) ||
                      queues.question.find(e => e.userId === userId);
    let name = inputName?.trim() || userEntry?.name || localStorage.getItem('queue_user_name');

    if (!name) {
      addToast('Name Required', 'Please enter your name in the form first.', 'error');
      return;
    }

    // Store for future use
    localStorage.setItem('queue_user_name', name);

    socket.emit('follow-question', {
      entryId,
      userId,
      name,
      room
    });
    playMeTooSound();
    addToast('Following Question', 'You will be notified when this question is answered.', 'success');
  };

  const unfollowQuestion = (entryId) => {
    socket.emit('unfollow-question', {
      entryId,
      userId: getUserId(),
      room
    });
    playPopSound();
    addToast('Unfollowed', 'You will no longer be notified for this question.', 'info');
  };

  const taCall = (queueType) => () => {
    socket.emit('ta-checkin', { queueType, room });
    setSuccessOverlay(`Called next student`);
    playSuccessSound();
  };
  
  const taCallSpecific = (queueType, entryId) => {
    // Debug toast to confirm action
    addToast('Calling Student', `Sending call request...`, 'info');
    socket.emit('ta-call-specific', { queueType, entryId, room });
    playSuccessSound();
  };
  
  const taCancelCall = (queueType, entryId) => {
    socket.emit('ta-cancel-call', { queueType, entryId, room });
    addToast('Call Cancelled', 'Student returned to waiting status.', 'info');
  };
  
  const taStartAssisting = (queueType) => (entryId) => {
     socket.emit('ta-start-assisting', { queueType, entryId, room });
     // No overlay needed, UI updates immediately
  };

  const taNext = (queueType) => () => {
    socket.emit('ta-next', { queueType, room });
    setSuccessOverlay(`Session finished`);
    playSuccessSound();
  };

  const taClearAll = () => {
    if (window.confirm('Are you sure you want to CLEAR ALL queues? This cannot be undone.')) {
      socket.emit('ta-clear-all', { room });
      setSuccessOverlay(`All queues cleared`);
    }
  };

  const taRemove = (queueType) => (entryId) => {
    // If combined, we need to know the real type, which is inside entry usually?
    // But socket.emit expects queueType. 
    // In TAView combined queue, items have 'type' property.
    // QueueCard passes onRemove(item.id). 
    // We need to fix this in QueueCard or here.
    
    // Quick fix: if queueType is combined, find the item to get its real type
    if (queueType === 'combined') {
       const item = [...queues.marking, ...queues.question].find(i => i.id === entryId);
       if (item) {
          // Determine type if item doesn't have it (it should in TAView)
          // But here we are looking at raw queues state which doesn't have 'type' prop injected
          // We can infer type by checking which queue it is in
          const type = queues.marking.find(i => i.id === entryId) ? 'marking' : 'question';
          socket.emit('ta-remove', { queueType: type, entryId, room });
       }
    } else {
       socket.emit('ta-remove', { queueType, entryId, room });
    }
  };

  const handleTALogin = () => {
    setIsTAAuthenticated(true);
    setPage('ta');
    window.location.hash = 'ta';
  };

  const handleTALogout = () => {
    setIsTAAuthenticated(false);
    setPage('home');
    window.location.hash = '';
  };

  // Dismiss turn alert
  const handleDismissAlert = () => {
    setTurnAlert(null);
    playSuccessSound(); // Confirmation sound
  };

  // Render based on page
  let content;
  switch (page) {
    case 'student':
      content = (
        <StudentView
          queues={queues}
          myEntries={myEntries}
          isConnected={isConnected}
          theme={theme}
          setTheme={setTheme}
          notificationStatus={notificationStatus}
          onEnableNotifications={handleEnableNotifications}
          joinQueue={joinQueue}
          leaveQueue={leaveQueue}
          pushBack={pushBack}
          followQuestion={followQuestion}
          unfollowQuestion={unfollowQuestion}
        />
      );
      break;
    case 'ta-login':
      content = (
        <TALoginPage
          onLogin={handleTALogin}
          theme={theme}
          setTheme={setTheme}
        />
      );
      break;
    case 'ta':
      content = (
        <TAView
          queues={queues}
          isConnected={isConnected}
          theme={theme}
          setTheme={setTheme}
          onLogout={handleTALogout}
          taCall={taCall}
          taCallSpecific={taCallSpecific}
          taCancelCall={taCancelCall}
          taStartAssisting={taStartAssisting}
          taNext={taNext}
          taRemove={taRemove}
          taClearAll={taClearAll}
        />
      );
      break;
    default:
      content = <HomePage theme={theme} setTheme={setTheme} />;
  }

  return (
    <>
      {content}
      <Toast toasts={toasts} removeToast={removeToast} />
      {turnAlert && !isTAAuthenticated && (
        <FullWindowAlert
          message={turnAlert.message}
          queueType={turnAlert.queueType}
          onDismiss={handleDismissAlert}
        />
      )}
      {successOverlay && (
        <SuccessOverlay
          message={successOverlay}
          onDismiss={() => setSuccessOverlay(null)}
        />
      )}
    </>
  );
}

export default App;
