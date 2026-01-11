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
  playSuccessSound
} from './utils/sounds';
import {
  getUserId,
  onUserDataChange
} from './utils/userIdentity';
import './App.css';

// TA Password - In production, this should be environment variable or server-side auth
const TA_PASSWORD = 'ece297ta';

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

// Theme Toggle Component
function ThemeToggle({ theme, setTheme }) {
  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
      {theme === 'dark' ? 'Light' : 'Dark'}
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
          className={`toast ${toast.type}`}
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
  return (
    <div className="full-window-alert">
      <div className="alert-content">
        <span className="alert-icon">🔔</span>
        <h2 className="alert-title">It's Your Turn!</h2>
        <p className="alert-message">{message}</p>
        <button className="alert-btn" onClick={onDismiss}>
          I'm Coming!
        </button>
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
function QueueItem({ item, position, isYou, isTA, queueType, onRemove, onCallSpecific }) {
  const isAssisting = item.status === 'assisting';
  const isCalled = item.status === 'called';

  return (
    <li className={`queue-item ${isYou ? 'is-you' : ''} ${isAssisting ? 'is-assisting' : ''} ${isCalled ? 'is-called' : ''}`}>
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
        </div>
        {(queueType === 'marking' || item.type === 'marking') && (
          <div className="queue-item-id">ID: ****{item.studentId}</div>
        )}
      </div>
      <TimeAgo isoString={item.joinedAt} />
      {isTA && item.status === 'waiting' && (
        <button
           className="btn btn-sm btn-secondary"
           style={{ margin: '0 8px', padding: '4px 10px', fontSize: '0.75rem', width: 'auto' }}
           onClick={() => onCallSpecific(item.type || queueType, item.id)}
           title="Call this student"
        >
          Call
        </button>
      )}
      {isTA && (
        <button
          className="btn btn-icon btn-danger"
          onClick={() => onRemove(item.id)}
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
  onStartAssisting,
  onNext,
  onPushBack,
  onRemove
}) {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
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
      userId: getUserId()
    });
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
        <div className="your-position">
          {myPositions.map((pos, idx) => (
            <div key={idx} style={{ marginBottom: idx < myPositions.length - 1 ? '16px' : '0', borderBottom: idx < myPositions.length - 1 ? '1px solid rgba(255,255,255,0.3)' : 'none', paddingBottom: idx < myPositions.length - 1 ? '16px' : '0' }}>
              <h3>
                {pos.status === 'assisting' ? `You're Being Assisted (${pos.type})!` : 
                 pos.status === 'called' ? `Go to TA Station (${pos.type})!` : `Your Position (${pos.type})`}
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
                {pos.status === 'waiting' && pos.position <= 3 && (
                    <button 
                      className="btn btn-sm" 
                      style={{ background: 'rgba(255,255,255,0.9)', color: '#333' }}
                      onClick={onPushBack(pos.type, pos.entryId)}
                    >
                      Push Back
                    </button>
                )}
                <button 
                    className="btn btn-sm" 
                    style={{ color: 'white', borderColor: 'white' }}
                    onClick={onLeave(pos.type, pos.entryId)}
                >
                  Leave Queue
                </button>
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
             <button 
               className={`btn btn-success`}
               style={{ background: '#22c55e', color: 'white' }} 
               onClick={() => onStartAssisting(topItem.id)}
             >
               Start Assisting {topItem.name}
             </button>
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

              <button
                type="submit"
                className={`btn btn-${type === 'combined' ? joinType : type}`}
                disabled={isJoining || !name.trim() || ((type === 'marking' || joinType === 'marking') && studentId.length !== 4)}
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
        <ThemeToggle theme={theme} setTheme={setTheme} />
      </div>
    </div>
  );
}

// TA Login Page Component
function TALoginPage({ onLogin, theme, setTheme }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === TA_PASSWORD) {
      onLogin();
    } else {
      setError('Incorrect password');
      setPassword('');
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

          <button type="submit" className="btn btn-marking">
            Login
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <a href="#" className="nav-link" style={{ display: 'inline-flex' }}>
            ← Back to Home
          </a>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
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
  pushBack
}) {
  // Merge and sort queues for student view (same logic as TA)
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
          </div>
          <div className="header-controls">
            <ConnectionStatus isConnected={isConnected} />
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>

        <h1>ECE297 Queue</h1>
        <p>Join a queue below and wait for your turn</p>

        <div className="header-controls">
          {notificationStatus !== 'granted' && notificationStatus !== 'unsupported' && (
            <button className="notification-btn" onClick={onEnableNotifications}>
              Enable Notifications
            </button>
          )}
          {notificationStatus === 'granted' && (
            <button className="notification-btn enabled" disabled>
              Notifications Enabled
            </button>
          )}
        </div>
      </header>

      <main className="main-content single">
        <QueueCard
          type="combined"
          title="All Queues"
          icon="∑"
          queue={combinedQueue}
          myEntry={null} // unused in combined mode
          allMyEntries={myEntries}
          isTA={false}
          onJoin={joinQueue} // Pass factory
          onLeave={leaveQueue} // Pass factory
          onPushBack={pushBack} // Pass factory
          onCall={() => { }}
          onCallMarking={() => { }}
          onCallQuestion={() => { }}
          onCallSpecific={() => { }}
          onStartAssisting={() => { }}
          onNext={() => { }}
          onRemove={() => { }}
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
  taStartAssisting,
  taNext,
  taRemove
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
          onStartAssisting={taStartAssisting('combined')}
          onNext={taNext('combined')}
          onRemove={taRemove('combined')}
        />
      </main>
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
  const [isTAAuthenticated, setIsTAAuthenticated] = useState(false);
  const [turnAlert, setTurnAlert] = useState(null);
  const [successOverlay, setSuccessOverlay] = useState(null);

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

  // Register identity with socket
  useEffect(() => {
    const userId = getUserId();

    if (isConnected) {
      socket.emit('register-user', { userId });
    }
  }, [isConnected]);

  // Listen for user data changes from other tabs
  useEffect(() => {
    return onUserDataChange((data) => {
      // Logic if we were saving user entries in localStorage
      // Currently we rely on server pushing state
    });
  }, []);

  // Toast management
  const addToast = useCallback((title, message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Socket event handlers
  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      addToast('Connected', 'You are now connected to the queue server.', 'success');
      // Re-register user on reconnect
      socket.emit('register-user', { userId: getUserId() });
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
    };

    const onFinishedAssisting = (data) => {
      addToast('Session Finished', data.message, 'success');
      playSuccessSound();
      // Status will be updated via queues-update (entry removed)
    };

    const onRemovedFromQueue = (data) => {
      addToast('Removed from Queue', data.message, 'info');
      setMyEntries(prev => ({
        ...prev,
        [data.queueType]: null
      }));
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
    socket.on('removed-from-queue', onRemovedFromQueue);
    socket.on('error', onError);

    if (socket.connected) {
      setIsConnected(true);
      socket.emit('register-user', { userId: getUserId() });
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
      socket.off('removed-from-queue', onRemovedFromQueue);
      socket.off('error', onError);
    };
  }, [addToast]);

  // Handle notification permission
  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationStatus(getNotificationPermissionStatus());
    if (granted) {
      addToast('Notifications Enabled', 'You will receive alerts when your turn approaches.', 'success');
      playNotificationSound(); // Test sound
    }
  };

  // Queue actions
  const joinQueue = (queueType) => (data) => {
    if (queueType === 'marking') {
      socket.emit('join-marking', data);
    } else {
      socket.emit('join-question', data);
    }
  };

  const leaveQueue = (queueType, entryId) => () => {
    socket.emit('leave-queue', {
      queueType,
      entryId,
      userId: getUserId()
    });
  };
  
  const pushBack = (queueType, entryId) => () => {
    socket.emit('push-back', {
      queueType,
      entryId,
      userId: getUserId()
    });
    // Optimistic toast
    addToast('Pushing Back...', 'Delaying your turn by 2 positions.', 'info');
  };

  const taCall = (queueType) => () => {
    socket.emit('ta-checkin', { queueType });
    setSuccessOverlay(`Called next student`);
    playSuccessSound();
  };
  
  const taCallSpecific = (queueType, entryId) => {
    socket.emit('ta-call-specific', { queueType, entryId });
    playSuccessSound();
  };
  
  const taStartAssisting = (queueType) => (entryId) => {
     socket.emit('ta-start-assisting', { queueType, entryId });
     // No overlay needed, UI updates immediately
  };

  const taNext = (queueType) => () => {
    socket.emit('ta-next', { queueType });
    setSuccessOverlay(`Session finished`);
    playSuccessSound();
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
          socket.emit('ta-remove', { queueType: type, entryId });
       }
    } else {
       socket.emit('ta-remove', { queueType, entryId });
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
          taStartAssisting={taStartAssisting}
          taNext={taNext}
          taRemove={taRemove}
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
      {turnAlert && (
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
