import { useState, useRef, useCallback } from 'react'
import './FileUploadPreview.css'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_EXTENSIONS = '.png, .jpg, .jpeg, .gif, .webp, .pdf'

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getFileIcon(type) {
  if (type?.startsWith('image/')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  )
  if (type === 'application/pdf') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
    </svg>
  )
}

// Simulated validation results
function validateFile(file) {
  const checks = []

  // Type check
  if (ALLOWED_TYPES.includes(file.type)) {
    checks.push({ label: 'File type allowed', status: 'pass', detail: file.type })
  } else {
    checks.push({ label: 'File type not allowed', status: 'fail', detail: `${file.type || 'unknown'} is not permitted` })
  }

  // Size check
  if (file.size <= MAX_FILE_SIZE) {
    checks.push({ label: 'File size within limit', status: 'pass', detail: `${formatFileSize(file.size)} / ${formatFileSize(MAX_FILE_SIZE)}` })
  } else {
    checks.push({ label: 'File too large', status: 'fail', detail: `${formatFileSize(file.size)} exceeds ${formatFileSize(MAX_FILE_SIZE)} limit` })
  }

  // Image dimension check (simulated for preview)
  if (file.type?.startsWith('image/')) {
    checks.push({ label: 'Image dimensions OK', status: 'pass', detail: 'Will be validated on upload' })
  }

  // Virus scan (simulated)
  checks.push({ label: 'Security scan', status: 'pending', detail: 'Scanned on upload to cloud storage' })

  return checks
}

function FileDropZone({ file, onFile, onRemove, error }) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFile(e.dataTransfer.files[0])
    }
  }, [onFile])

  const handleChange = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      onFile(e.target.files[0])
    }
  }, [onFile])

  if (file) {
    return (
      <div className="file-attached">
        <div className="file-attached-icon">
          {file.type?.startsWith('image/') && file.preview ? (
            <img src={file.preview} alt="Preview" className="file-thumb" />
          ) : (
            <div className="file-type-icon">{getFileIcon(file.type)}</div>
          )}
        </div>
        <div className="file-attached-info">
          <span className="file-attached-name">{file.name}</span>
          <span className="file-attached-size">{formatFileSize(file.size)}</span>
        </div>
        <button className="file-remove-btn" onClick={onRemove} type="button" title="Remove file">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`file-dropzone ${dragActive ? 'drag-active' : ''} ${error ? 'has-error' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleChange}
        className="file-input-hidden"
      />
      <div className="dropzone-content">
        <div className="dropzone-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <p className="dropzone-text">
          <span className="dropzone-link">Choose a file</span> or drag it here
        </p>
        <p className="dropzone-hint">{ALLOWED_EXTENSIONS} up to 5 MB</p>
      </div>
      {error && <p className="dropzone-error">{error}</p>}
    </div>
  )
}

function UploadProgress({ progress, status }) {
  return (
    <div className="upload-progress-wrapper">
      <div className="upload-progress-bar">
        <div
          className={`upload-progress-fill ${status}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="upload-progress-text">
        {status === 'uploading' && `Uploading... ${progress}%`}
        {status === 'validating' && 'Validating file...'}
        {status === 'complete' && 'Upload complete'}
        {status === 'error' && 'Upload failed'}
      </span>
    </div>
  )
}

function ValidationChecks({ checks }) {
  return (
    <div className="validation-checks">
      {checks.map((check, i) => (
        <div key={i} className={`validation-check ${check.status}`}>
          <span className="check-icon">
            {check.status === 'pass' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            )}
            {check.status === 'fail' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            )}
            {check.status === 'pending' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            )}
          </span>
          <span className="check-label">{check.label}</span>
          <span className="check-detail">{check.detail}</span>
        </div>
      ))}
    </div>
  )
}

// Mock queue items with attachments for TA view
const MOCK_QUEUE = [
  {
    id: 1, name: 'Alice Chen', studentId: '1009123456', type: 'marking', status: 'waiting',
    joinedAt: '2 min ago',
    attachment: { name: 'circuit_diagram.png', size: 342000, type: 'image/png', url: '#' }
  },
  {
    id: 2, name: 'Bob Kumar', studentId: '1008234567', type: 'marking', status: 'called',
    joinedAt: '5 min ago',
    attachment: null
  },
  {
    id: 3, name: 'Carol Zhang', type: 'question', status: 'waiting',
    description: 'Getting segfault in Task 2 pathfinding when the map has one-way streets',
    joinedAt: '3 min ago',
    attachment: { name: 'error_screenshot.jpg', size: 891000, type: 'image/jpeg', url: '#' },
    followers: 4
  },
  {
    id: 4, name: 'David Park', type: 'question', status: 'assisting',
    description: 'How to handle the API rate limit in milestone 3?',
    joinedAt: '8 min ago',
    attachment: { name: 'api_response.pdf', size: 156000, type: 'application/pdf', url: '#' },
    followers: 2
  },
]

function QueueItemWithAttachment({ item }) {
  const [expanded, setExpanded] = useState(false)

  const positionClass = item.status === 'called' ? 'called'
    : item.status === 'assisting' ? 'assisting' : ''

  return (
    <div
      className={`queue-item ${item.status === 'called' ? 'is-called' : ''} ${item.status === 'assisting' ? 'is-assisting' : ''} ${expanded ? 'is-expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <div className={`queue-position ${positionClass}`}>
        {item.status === 'assisting' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        ) : item.status === 'called' ? '!' : item.id}
      </div>
      <div className="queue-item-info">
        <div className="queue-item-name">
          {item.name}
          {item.status === 'called' && <span className="status-badge called">Called</span>}
          {item.status === 'assisting' && <span className="status-badge assisting">Assisting</span>}
          <span className={`queue-badge ${item.type}`}>{item.type === 'marking' ? 'M' : 'Q'}</span>
          {item.attachment && (
            <span className="attachment-indicator" title={item.attachment.name}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </span>
          )}
        </div>
        {item.studentId && <div className="queue-item-id">ID: {item.studentId}</div>}
        {item.description && (
          <div className={`queue-item-description ${expanded ? 'expanded' : ''}`}>
            {item.description}
          </div>
        )}
        {item.followers && (
          <div className={`queue-item-followers ${expanded ? '' : 'collapsed'}`}>
            <span className="followers-label">{item.followers} students</span> also have this question
          </div>
        )}
        {expanded && item.attachment && (
          <div className="attachment-preview">
            <div className="attachment-preview-header">
              {getFileIcon(item.attachment.type)}
              <span className="attachment-preview-name">{item.attachment.name}</span>
              <span className="attachment-preview-size">{formatFileSize(item.attachment.size)}</span>
              <button className="attachment-download-btn" title="Download file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
            </div>
            {item.attachment.type?.startsWith('image/') && (
              <div className="attachment-image-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>Image preview loads here</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="queue-item-time">{item.joinedAt}</div>
    </div>
  )
}


export default function FileUploadPreview() {
  const [darkMode, setDarkMode] = useState(true)
  const [activeSection, setActiveSection] = useState('student')
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [validationChecks, setValidationChecks] = useState([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState(null) // null, uploading, validating, complete, error

  const handleFile = useCallback((f) => {
    setFileError('')
    setUploadStatus(null)
    setUploadProgress(0)
    setValidationChecks([])

    // Validate type
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError(`"${f.name}" is not a supported file type. Allowed: ${ALLOWED_EXTENSIONS}`)
      return
    }

    // Validate size
    if (f.size > MAX_FILE_SIZE) {
      setFileError(`"${f.name}" is ${formatFileSize(f.size)} — exceeds the 5 MB limit.`)
      return
    }

    // Create preview for images
    const fileObj = { name: f.name, size: f.size, type: f.type, preview: null }
    if (f.type.startsWith('image/')) {
      fileObj.preview = URL.createObjectURL(f)
    }
    setFile(fileObj)
    setValidationChecks(validateFile(f))
  }, [])

  const handleRemoveFile = useCallback(() => {
    if (file?.preview) URL.revokeObjectURL(file.preview)
    setFile(null)
    setFileError('')
    setValidationChecks([])
    setUploadStatus(null)
    setUploadProgress(0)
  }, [file])

  const simulateUpload = useCallback(() => {
    if (!file) return
    setUploadStatus('uploading')
    setUploadProgress(0)

    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setUploadProgress(100)
        setUploadStatus('validating')
        setTimeout(() => {
          setUploadStatus('complete')
          // Update the pending check to pass
          setValidationChecks(prev =>
            prev.map(c => c.status === 'pending' ? { ...c, status: 'pass', detail: 'No threats detected' } : c)
          )
        }, 1200)
      } else {
        setUploadProgress(Math.min(Math.round(progress), 99))
      }
    }, 200)
  }, [file])

  const themeAttr = darkMode ? 'dark' : 'light'

  return (
    <div className="app file-preview-app" data-theme={themeAttr}>
      {/* Design Preview Banner */}
      <div className="preview-banner">
        <div className="preview-banner-content">
          <span className="preview-banner-badge">Design Preview</span>
          <span className="preview-banner-text">File Upload Feature — UI Mockup</span>
          <a href="/" className="preview-banner-link">Back to App</a>
        </div>
      </div>

      {/* Header */}
      <div className="header">
        <h1>Attachment Upload</h1>
        <p>Optional file upload when joining a queue — screenshots, handwritten work, or relevant documents</p>
        <div className="header-controls">
          <button
            className="theme-icon-btn"
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="preview-tabs">
        <button
          className={`preview-tab ${activeSection === 'student' ? 'active' : ''}`}
          onClick={() => setActiveSection('student')}
        >
          Student View
        </button>
        <button
          className={`preview-tab ${activeSection === 'ta' ? 'active' : ''}`}
          onClick={() => setActiveSection('ta')}
        >
          TA View
        </button>
        <button
          className={`preview-tab ${activeSection === 'metadata' ? 'active' : ''}`}
          onClick={() => setActiveSection('metadata')}
        >
          Metadata Schema
        </button>
      </div>

      {/* Student View: Join form with file upload */}
      {activeSection === 'student' && (
        <div className="main-content single" style={{ animation: 'fadeInUp 0.4s ease' }}>
          <div className="queue-card marking">
            <div className="queue-header">
              <div className="queue-title">
                <div className="queue-icon marking">M</div>
                <h2>Join Marking Queue</h2>
              </div>
              <span className="queue-count">3 waiting</span>
            </div>

            <div className="join-form">
              <div className="form-group">
                <label className="form-label">Your Name</label>
                <input className="form-input" type="text" placeholder="e.g. Alice Chen" defaultValue="Alice Chen" />
              </div>
              <div className="form-group">
                <label className="form-label">Student ID</label>
                <input className="form-input" type="text" placeholder="e.g. 1009123456" defaultValue="1009123456" />
              </div>

              {/* File Upload Section */}
              <div className="form-group">
                <label className="form-label">
                  Attachment <span className="form-label-optional">(optional)</span>
                </label>
                <p className="form-hint">Upload a screenshot, photo of handwritten work, or any relevant file for the TA.</p>
                <FileDropZone
                  file={file}
                  onFile={handleFile}
                  onRemove={handleRemoveFile}
                  error={fileError}
                />
              </div>

              {/* Validation Checks */}
              {validationChecks.length > 0 && (
                <ValidationChecks checks={validationChecks} />
              )}

              {/* Upload Progress (shows after clicking Join) */}
              {uploadStatus && (
                <UploadProgress progress={uploadProgress} status={uploadStatus} />
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  className="btn btn-marking"
                  onClick={simulateUpload}
                  disabled={uploadStatus === 'uploading' || uploadStatus === 'validating'}
                >
                  {uploadStatus === 'uploading' || uploadStatus === 'validating' ? (
                    <>
                      <span className="spinner" />
                      {uploadStatus === 'uploading' ? 'Uploading...' : 'Validating...'}
                    </>
                  ) : uploadStatus === 'complete' ? (
                    <>Joined Queue</>
                  ) : (
                    <>Join Queue</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Question Queue Variant */}
          <div className="queue-card question" style={{ marginTop: '24px' }}>
            <div className="queue-header">
              <div className="queue-title">
                <div className="queue-icon question">Q</div>
                <h2>Ask a Question</h2>
              </div>
              <span className="queue-count">2 waiting</span>
            </div>
            <div className="join-form">
              <div className="form-group">
                <label className="form-label">Your Name</label>
                <input className="form-input" type="text" placeholder="e.g. Carol Zhang" defaultValue="Carol Zhang" />
              </div>
              <div className="form-group">
                <label className="form-label">Question</label>
                <input className="form-input" type="text" placeholder="Describe your question..." defaultValue="Segfault in Task 2 when map has one-way streets" />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Attachment <span className="form-label-optional">(optional)</span>
                </label>
                <p className="form-hint">Attach an error screenshot or relevant code snippet.</p>
                {/* Show a pre-filled attached state */}
                <div className="file-attached">
                  <div className="file-attached-icon">
                    <div className="file-type-icon">{getFileIcon('image/jpeg')}</div>
                  </div>
                  <div className="file-attached-info">
                    <span className="file-attached-name">error_screenshot.jpg</span>
                    <span className="file-attached-size">891 KB</span>
                  </div>
                  <button className="file-remove-btn" type="button" title="Remove file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              <button className="btn btn-question">Join Queue</button>
            </div>
          </div>
        </div>
      )}

      {/* TA View: Queue items with attachment indicators */}
      {activeSection === 'ta' && (
        <div className="main-content single" style={{ animation: 'fadeInUp 0.4s ease' }}>
          <div className="queue-card">
            <div className="queue-header">
              <div className="queue-title">
                <h2>TA Dashboard</h2>
                <span className="room-badge">
                  <svg className="room-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span className="room-name">BA3195</span>
                </span>
              </div>
              <span className="queue-count">4 in queue</span>
            </div>

            <p className="ta-hint">Click on a student to expand details and view their attachment.</p>

            <div className="queue-list">
              {MOCK_QUEUE.map(item => (
                <QueueItemWithAttachment key={item.id} item={item} />
              ))}
            </div>

            <div className="ta-controls" style={{ marginTop: '16px' }}>
              <button className="btn btn-marking btn-sm">Next Marking</button>
              <button className="btn btn-question btn-sm">Next Question</button>
            </div>
          </div>

          {/* Legend */}
          <div className="queue-card" style={{ marginTop: '24px' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '0.95rem' }}>Attachment Indicators</h3>
            <div className="legend-grid">
              <div className="legend-item">
                <span className="attachment-indicator">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </span>
                <span>Paperclip icon appears next to name when a file is attached</span>
              </div>
              <div className="legend-item">
                <span className="attachment-preview-badge">IMG</span>
                <span>Image files show a thumbnail preview when expanded</span>
              </div>
              <div className="legend-item">
                <span className="attachment-preview-badge pdf">PDF</span>
                <span>PDF files show a download link when expanded</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Schema View */}
      {activeSection === 'metadata' && (
        <div className="main-content single" style={{ animation: 'fadeInUp 0.4s ease' }}>
          <div className="queue-card">
            <div className="queue-header">
              <div className="queue-title">
                <h2>Attachment Metadata Schema</h2>
              </div>
            </div>
            <p className="schema-description">
              The file itself is stored in cloud storage. The database stores metadata linking the file to a queue request.
            </p>
            <div className="schema-block">
              <div className="schema-header">
                <span className="schema-table-name">attachments</span>
                <span className="schema-table-badge">Table</span>
              </div>
              <div className="schema-fields">
                <div className="schema-field">
                  <span className="schema-field-name">id</span>
                  <span className="schema-field-type">UUID</span>
                  <span className="schema-field-key">PK</span>
                  <span className="schema-field-desc">Primary key</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">request_id</span>
                  <span className="schema-field-type">UUID</span>
                  <span className="schema-field-key">FK</span>
                  <span className="schema-field-desc">Links to the queue request this file belongs to</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">file_url</span>
                  <span className="schema-field-type">TEXT</span>
                  <span className="schema-field-key"></span>
                  <span className="schema-field-desc">Cloud storage URL (e.g. S3 / GCS signed URL)</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">file_name</span>
                  <span className="schema-field-type">VARCHAR(255)</span>
                  <span className="schema-field-key"></span>
                  <span className="schema-field-desc">Original filename uploaded by the student</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">file_size</span>
                  <span className="schema-field-type">INTEGER</span>
                  <span className="schema-field-key"></span>
                  <span className="schema-field-desc">File size in bytes (max 5 MB)</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">mime_type</span>
                  <span className="schema-field-type">VARCHAR(100)</span>
                  <span className="schema-field-key"></span>
                  <span className="schema-field-desc">MIME type — image/png, image/jpeg, application/pdf, etc.</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">uploaded_by</span>
                  <span className="schema-field-type">UUID</span>
                  <span className="schema-field-key">FK</span>
                  <span className="schema-field-desc">User ID of the uploader (for authorization)</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">uploaded_at</span>
                  <span className="schema-field-type">TIMESTAMP</span>
                  <span className="schema-field-key"></span>
                  <span className="schema-field-desc">When the file was uploaded</span>
                </div>
                <div className="schema-field">
                  <span className="schema-field-name">scan_status</span>
                  <span className="schema-field-type">ENUM</span>
                  <span className="schema-field-key"></span>
                  <span className="schema-field-desc">pending | clean | flagged — result of security scan</span>
                </div>
              </div>
            </div>

            {/* Processing Pipeline */}
            <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '0.95rem' }}>Upload & Processing Pipeline</h3>
            <div className="pipeline-steps">
              <div className="pipeline-step">
                <div className="pipeline-step-number">1</div>
                <div className="pipeline-step-content">
                  <strong>Client-side validation</strong>
                  <p>Check file type, size (max 5 MB), and generate a preview thumbnail for images.</p>
                </div>
              </div>
              <div className="pipeline-step">
                <div className="pipeline-step-number">2</div>
                <div className="pipeline-step-content">
                  <strong>Upload to cloud storage</strong>
                  <p>File is sent to S3/GCS via a presigned URL. The backend never handles the raw file.</p>
                </div>
              </div>
              <div className="pipeline-step">
                <div className="pipeline-step-number">3</div>
                <div className="pipeline-step-content">
                  <strong>Save metadata</strong>
                  <p>Backend stores file URL, size, type, and request association in the database.</p>
                </div>
              </div>
              <div className="pipeline-step">
                <div className="pipeline-step-number">4</div>
                <div className="pipeline-step-content">
                  <strong>Server-side processing</strong>
                  <p>Image thumbnails generated, file scanned for security. PDF text extracted for search.</p>
                </div>
              </div>
              <div className="pipeline-step">
                <div className="pipeline-step-number">5</div>
                <div className="pipeline-step-content">
                  <strong>Serve to TA</strong>
                  <p>TA sees attachment indicator in queue. Can preview images inline or download files.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
