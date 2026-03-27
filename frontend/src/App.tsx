import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { Layout } from './components/layout/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { R5ChecksPage } from './pages/R5ChecksPage'
import { R5CheckDetailPage } from './pages/R5CheckDetailPage'
import { FilesPage } from './pages/FilesPage'
import { FileDetailPage } from './pages/FileDetailPage'
import { LogViewerPage } from './pages/LogViewerPage'
import { MemoryLeaksPage } from './pages/MemoryLeaksPage'
import { MemoryLeakDetailPage } from './pages/MemoryLeakDetailPage'
import { AdminPage } from './pages/AdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <UnauthenticatedTemplate><LoginPage /></UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/r5checks"      element={<R5ChecksPage />} />
            <Route path="/r5checks/:id"  element={<R5CheckDetailPage />} />
            <Route path="/memory-leaks"      element={<MemoryLeaksPage />} />
            <Route path="/memory-leaks/:id"  element={<MemoryLeakDetailPage />} />
            <Route path="/files"         element={<FilesPage />} />
            <Route path="/files/:id"     element={<FileDetailPage />} />
            <Route path="/files/:id/log" element={<LogViewerPage />} />
            <Route path="/admin"         element={<AdminPage />} />
          </Routes>
        </Layout>
      </AuthenticatedTemplate>
    </BrowserRouter>
  )
}
