import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native'
import { notes as notesApi, Note, User } from '../api'
import { Card, Button } from '../components/ui'
import { useTheme, ThemeColors, FontSizes } from '../context/ThemeContext'

interface HomeScreenProps {
  user: User | null
  isAuthenticated: boolean
  onNavigateToNotes: () => void
  onEditNote: (note: Note) => void
  onLogin: () => void
  onGuestLogin: () => Promise<any>
}

export function HomeScreen({ user, isAuthenticated, onNavigateToNotes, onEditNote, onLogin, onGuestLogin }: HomeScreenProps) {
  const { colors, fonts } = useTheme()
  const styles = createStyles(colors, fonts)

  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [totalNotes, setTotalNotes] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isGuestLoading, setIsGuestLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const result = await notesApi.list({
        order: '-updated',
        limit: 3,
      })
      setRecentNotes(result.items)
      setTotalNotes(result.total)
    } catch (err) {
      console.error('Failed to fetch notes:', err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchData()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
      <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
            />
          }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName}>
            {isAuthenticated && user ? (user.name || user.username) : 'Guest'}
          </Text>
        </View>

        {!isAuthenticated ? (
            <Card style={styles.welcomeCard}>
              <Text style={styles.welcomeTitle}>Welcome to Notes</Text>
              <Text style={styles.welcomeText}>
                Sign in to create and manage your personal notes, sync across devices, and more.
              </Text>
              <Button
                  title="Sign In"
                  onPress={onLogin}
                  style={{ marginTop: 16 }}
              />
              <Button
                  title="Continue as Guest"
                  onPress={async () => {
                    setIsGuestLoading(true)
                    try { await onGuestLogin() } catch {} finally { setIsGuestLoading(false) }
                  }}
                  variant="ghost"
                  loading={isGuestLoading}
                  style={{ marginTop: 8 }}
              />
            </Card>
        ) : (
            <>
              <View style={styles.statsContainer}>
                <Card style={styles.statCard}>
                  <Text style={styles.statNumber}>{totalNotes}</Text>
                  <Text style={styles.statLabel}>Total Notes</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Text style={styles.statNumber}>{recentNotes.filter(n => n.is_public).length}</Text>
                  <Text style={styles.statLabel}>Public</Text>
                </Card>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent Notes</Text>
                  {totalNotes > 0 && (
                      <TouchableOpacity onPress={onNavigateToNotes}>
                        <Text style={styles.seeAll}>See all</Text>
                      </TouchableOpacity>
                  )}
                </View>

                {isLoading ? (
                    <Text style={styles.loadingText}>Loading...</Text>
                ) : recentNotes.length === 0 ? (
                    <Card style={styles.emptyCard}>
                      <Text style={styles.emptyText}>No notes yet</Text>
                      <Text style={styles.emptySubtext}>
                        Create your first note to get started
                      </Text>
                    </Card>
                ) : (
                    recentNotes.map((note) => (
                        <TouchableOpacity
                            key={note.id}
                            onPress={() => onEditNote(note)}
                            activeOpacity={0.7}
                        >
                          <Card style={styles.noteCard}>
                            <View style={styles.noteHeader}>
                              <Text style={styles.noteTitle} numberOfLines={1}>
                                {note.title || 'Untitled'}
                              </Text>
                              <Text style={styles.noteDate}>{formatDate(note.updated)}</Text>
                            </View>
                            <Text style={styles.noteContent} numberOfLines={2}>
                              {note.content || 'No content'}
                            </Text>
                          </Card>
                        </TouchableOpacity>
                    ))
                )}
              </View>
            </>
        )}
      </ScrollView>
  )
}

const createStyles = (colors: ThemeColors, fonts: FontSizes) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: fonts.base,
    color: colors.textSecondary,
  },
  userName: {
    fontSize: fonts['3xl'],
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  welcomeCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  welcomeTitle: {
    fontSize: fonts['2xl'],
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  statNumber: {
    fontSize: fonts['3xl'] + 4,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: fonts.lg,
    fontWeight: '600',
    color: colors.text,
  },
  seeAll: {
    fontSize: fonts.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  loadingText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: fonts.base,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtext: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  noteCard: {
    marginBottom: 12,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: fonts.base,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  noteDate: {
    fontSize: fonts.xs,
    color: colors.textMuted,
  },
  noteContent: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
})
