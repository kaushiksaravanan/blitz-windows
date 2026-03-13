import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native'
import { notes as notesApi, Note } from '../api'
import { Header, Card, Loading, EmptyState, Button } from '../components/ui'
import { useTheme, ThemeColors, FontSizes } from '../context/ThemeContext'

interface NotesScreenProps {
  isAuthenticated: boolean
  onCreateNote: () => void
  onEditNote: (note: Note) => void
  onLogin: () => void
}

export function NotesScreen({ isAuthenticated, onCreateNote, onEditNote, onLogin }: NotesScreenProps) {
  const { colors, fonts } = useTheme()
  const styles = createStyles(colors, fonts)

  const [notes, setNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchNotes = useCallback(async () => {
    try {
      setError('')
      const result = await notesApi.list({
        order: '-updated',
        limit: 50,
      })
      setNotes(result.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchNotes()
  }

  const handleDelete = async (note: Note) => {
    try {
      await notesApi.delete(note.id)
      setNotes(notes.filter(n => n.id !== note.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const renderNote = ({ item }: { item: Note }) => (
    <Card style={styles.noteCard} onPress={() => isAuthenticated ? onEditNote(item) : undefined}>
      <View style={styles.noteHeader}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {item.title || 'Untitled'}
        </Text>
        {!!item.is_public && (
          <View style={styles.publicBadge}>
            <Text style={styles.publicBadgeText}>Public</Text>
          </View>
        )}
      </View>
      <Text style={styles.noteContent} numberOfLines={2}>
        {item.content || 'No content'}
      </Text>
      <View style={styles.noteFooter}>
        <Text style={styles.noteDate}>{formatDate(item.updated)}</Text>
        {isAuthenticated && (
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.deleteButton}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  )

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header title={isAuthenticated ? "My Notes" : "Public Notes"} />
        <Loading message="Loading notes..." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Header title={isAuthenticated ? "My Notes" : "Public Notes"} />

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" onPress={fetchNotes} variant="secondary" />
        </View>
      ) : notes.length === 0 ? (
        <EmptyState
          title={isAuthenticated ? "No notes yet" : "No public notes"}
          message={isAuthenticated ? "Create your first note to get started" : "Sign in to create your own notes"}
          action={isAuthenticated
            ? { label: 'Create Note', onPress: onCreateNote }
            : { label: 'Sign In', onPress: onLogin }
          }
        />
      ) : (
        <FlatList
          data={notes}
          renderItem={renderNote}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {isAuthenticated && (
        <View style={styles.fab}>
          <TouchableOpacity style={styles.fabButton} onPress={onCreateNote}>
            <Text style={styles.fabIcon}>+</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const createStyles = (colors: ThemeColors, fonts: FontSizes) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  noteCard: {
    marginBottom: 0,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: fonts.lg,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  publicBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  publicBadgeText: {
    color: '#fff',
    fontSize: fonts.xs,
    fontWeight: '600',
  },
  noteContent: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  noteDate: {
    fontSize: fonts.xs,
    color: colors.textMuted,
  },
  deleteButton: {
    fontSize: fonts.xs,
    color: colors.danger,
    fontWeight: '500',
  },
  separator: {
    height: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: colors.danger,
    fontSize: fonts.sm,
    marginBottom: 16,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabIcon: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
})
