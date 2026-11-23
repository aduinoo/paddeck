import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { Admin } from './Admin'

document.body.style.overflow = 'auto'
document.body.style.userSelect = 'auto'
createRoot(document.getElementById('root')!).render(<StrictMode><Admin /></StrictMode>)
