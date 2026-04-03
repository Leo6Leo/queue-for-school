import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import FileUploadPreview from './FileUploadPreview.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FileUploadPreview />
  </StrictMode>,
)
