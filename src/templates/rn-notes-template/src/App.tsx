import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useAuth } from './hooks/useAuth'
import { Note } from './api'
import { Loading } from './components/ui'
import { TabBar, TabName } from './components/TabBar'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { LoginScreen } from './screens/LoginScreen'
import { SignupScreen } from './screens/SignupScreen'
import { HomeScreen } from './screens/HomeScreen'
import { NotesScreen } from './screens/NotesScreen'
import { NoteEditorScreen } from './screens/NoteEditorScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { SettingsScreen } from './screens/SettingsScreen'

type AuthScreen = 'login' | 'signup' | null

function AppContent() {
  const { colors } = useTheme()
  const { user, isLoading, isActionLoading, isAuthenticated, login, signUp, logout } = useAuth()
  const [authScreen, setAuthScreen] = useState<AuthScreen>(null)
  const [activeTab, setActiveTab] = useState<TabName>('home')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  // Show loading while checking auth
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading message="Loading..." />
      </View>
    )
  }

  // Show auth screens when explicitly requested
  if (authScreen === 'login') {
    return (
      <LoginScreen
        onLogin={async (email, password) => {
          await login(email, password)
          setAuthScreen(null)
        }}
        onNavigateToSignup={() => setAuthScreen('signup')}
        isLoading={isActionLoading}
        onGuestLogin={async () => {
          await login('guest@example.com', '12345678')
          setAuthScreen(null)
        }}
        onBack={() => setAuthScreen(null)}
      />
    )
  }

  if (authScreen === 'signup') {
    return (
      <SignupScreen
        onSignup={async (data) => {
          await signUp(data)
          setAuthScreen(null)
        }}
        onNavigateToLogin={() => setAuthScreen('login')}
        isLoading={isActionLoading}
        onBack={() => setAuthScreen(null)}
      />
    )
  }

  // Show note editor if open (requires auth)
  if (isEditorOpen && isAuthenticated && user) {
    return (
      <NoteEditorScreen
        note={editingNote}
        onSave={() => {
          setEditingNote(null)
          setIsEditorOpen(false)
        }}
        onCancel={() => {
          setEditingNote(null)
          setIsEditorOpen(false)
        }}
      />
    )
  }

  // Main tabbed app (always shown)
  const handleEditNote = (note: Note) => {
    if (!isAuthenticated) {
      setAuthScreen('login')
      return
    }
    setEditingNote(note)
    setIsEditorOpen(true)
  }

  const handleCreateNote = () => {
    if (!isAuthenticated) {
      setAuthScreen('login')
      return
    }
    setEditingNote(null)
    setIsEditorOpen(true)
  }

  const handleLogout = async () => {
    await logout()
    setActiveTab('home')
  }

  const handleLogin = () => setAuthScreen('login')
  const handleSignup = () => setAuthScreen('signup')
  const handleGuestLogin = async () => {
    await login('guest@example.com', '12345678')
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            user={user}
            isAuthenticated={isAuthenticated}
            onNavigateToNotes={() => setActiveTab('notes')}
            onEditNote={handleEditNote}
            onLogin={handleLogin}
            onGuestLogin={handleGuestLogin}
          />
        )
      case 'notes':
        return (
          <NotesScreen
            isAuthenticated={isAuthenticated}
            onCreateNote={handleCreateNote}
            onEditNote={handleEditNote}
            onLogin={handleLogin}
          />
        )
      case 'profile':
        return (
          <ProfileScreen
            user={user}
            isAuthenticated={isAuthenticated}
            onLogout={handleLogout}
            onLogin={handleLogin}
            onSignup={handleSignup}
            onGuestLogin={handleGuestLogin}
          />
        )
      case 'settings':
        return <SettingsScreen />
      default:
        return null
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {renderActiveTab()}
      </View>
      <TabBar activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
})
