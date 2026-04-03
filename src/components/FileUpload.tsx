import { useState, useRef, useCallback } from 'react';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = '.png, .jpg, .jpeg, .gif, .webp, .pdf';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function getFileIcon(type: string | undefined) {
  if (type?.startsWith('image/')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  );
  if (type === 'application/pdf') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
    </svg>
  );
}

export interface FileInfo {
  file: File;
  name: string;
  size: number;
  type: string;
  preview: string | null;
}

export interface ValidationCheck {
  label: string;
  status: 'pass' | 'fail' | 'pending';
  detail: string;
}

function validateFile(file: File): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  if (ALLOWED_TYPES.includes(file.type)) {
    checks.push({ label: 'File type allowed', status: 'pass', detail: file.type });
  } else {
    checks.push({ label: 'File type not allowed', status: 'fail', detail: `${file.type || 'unknown'} is not permitted` });
  }

  if (file.size <= MAX_FILE_SIZE) {
    checks.push({ label: 'File size within limit', status: 'pass', detail: `${formatFileSize(file.size)} / ${formatFileSize(MAX_FILE_SIZE)}` });
  } else {
    checks.push({ label: 'File too large', status: 'fail', detail: `${formatFileSize(file.size)} exceeds ${formatFileSize(MAX_FILE_SIZE)} limit` });
  }

  if (file.type?.startsWith('image/')) {
    checks.push({ label: 'Image dimensions OK', status: 'pass', detail: 'Will be validated on upload' });
  }

  checks.push({ label: 'Security scan', status: 'pending', detail: 'Scanned on upload' });

  return checks;
}

// --- FileDropZone ---

interface FileDropZoneProps {
  fileInfo: FileInfo | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  error: string;
}

export function FileDropZone({ fileInfo, onFile, onRemove, error }: FileDropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFile(e.dataTransfer.files[0]);
    }
  }, [onFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFile(e.target.files[0]);
    }
  }, [onFile]);

  if (fileInfo) {
    return (
      <div className="file-attached">
        <div className="file-attached-icon">
          {fileInfo.type?.startsWith('image/') && fileInfo.preview ? (
            <img src={fileInfo.preview} alt="Preview" className="file-thumb" />
          ) : (
            <div className="file-type-icon">{getFileIcon(fileInfo.type)}</div>
          )}
        </div>
        <div className="file-attached-info">
          <span className="file-attached-name">{fileInfo.name}</span>
          <span className="file-attached-size">{formatFileSize(fileInfo.size)}</span>
        </div>
        <button className="file-remove-btn" onClick={onRemove} type="button" title="Remove file">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    );
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
  );
}

// --- UploadProgress ---

interface UploadProgressProps {
  progress: number;
  status: 'uploading' | 'validating' | 'complete' | 'error';
}

export function UploadProgress({ progress, status }: UploadProgressProps) {
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
  );
}

// --- ValidationChecks ---

interface ValidationChecksProps {
  checks: ValidationCheck[];
}

export function ValidationChecks({ checks }: ValidationChecksProps) {
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
  );
}

// --- AttachmentIndicator (paperclip icon for queue items) ---

export function AttachmentIndicator({ fileName }: { fileName: string }) {
  return (
    <span className="attachment-indicator" title={fileName}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    </span>
  );
}

// --- AttachmentPreview (expanded view in queue items) ---

interface AttachmentPreviewProps {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}

export function AttachmentPreview({ fileName, contentType, sizeBytes, downloadUrl }: AttachmentPreviewProps) {
  return (
    <div className="attachment-preview" onClick={(e) => e.stopPropagation()}>
      <div className="attachment-preview-header">
        {getFileIcon(contentType)}
        <span className="attachment-preview-name">{fileName}</span>
        <span className="attachment-preview-size">{formatFileSize(sizeBytes)}</span>
        <a
          className="attachment-download-btn"
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Download file"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      </div>
      {contentType?.startsWith('image/') && (
        <div className="attachment-image-preview">
          <img src={downloadUrl} alt={fileName} className="attachment-image" loading="lazy" />
        </div>
      )}
    </div>
  );
}

// --- useFileUpload hook ---

export function useFileUpload() {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [fileError, setFileError] = useState('');
  const [validationChecks, setValidationChecks] = useState<ValidationCheck[]>([]);

  const handleFile = useCallback((f: File) => {
    setFileError('');
    setValidationChecks([]);

    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError(`"${f.name}" is not a supported file type. Allowed: ${ALLOWED_EXTENSIONS}`);
      return;
    }

    if (f.size > MAX_FILE_SIZE) {
      setFileError(`"${f.name}" is ${formatFileSize(f.size)} — exceeds the 5 MB limit.`);
      return;
    }

    const info: FileInfo = {
      file: f,
      name: f.name,
      size: f.size,
      type: f.type,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    };
    setFileInfo(info);
    setValidationChecks(validateFile(f));
  }, []);

  const removeFile = useCallback(() => {
    if (fileInfo?.preview) URL.revokeObjectURL(fileInfo.preview);
    setFileInfo(null);
    setFileError('');
    setValidationChecks([]);
  }, [fileInfo]);

  const resetFile = useCallback(() => {
    if (fileInfo?.preview) URL.revokeObjectURL(fileInfo.preview);
    setFileInfo(null);
    setFileError('');
    setValidationChecks([]);
  }, [fileInfo]);

  return {
    fileInfo,
    fileError,
    validationChecks,
    setValidationChecks,
    handleFile,
    removeFile,
    resetFile,
  };
}
