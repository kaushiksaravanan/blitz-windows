import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { notes as notesApi, Note } from '../api'
import { Header, Button } from '../components/ui'
import { useTheme, ThemeColors } from '../context/ThemeContext'

interface NoteEditorScreenProps {
  note?: Note | null
  onSave: () => void
  onCancel: () => void
}

export function NoteEditorScreen({ note, onSave, onCancel }: NoteEditorScreenProps) {
  const { colors } = useTheme()
  const styles = createStyles(colors)

  const [title, setTitle] = useState(note?.title || '')
  const [content, setContent] = useState(note?.content || '')
  const [isPublic, setIsPublic] = useState(note?.is_public || false)
  const [tags, setTags] = useState(note?.tags || '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const isEditing = !!note

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!content.trim()) {
      setError('Content is required')
      return
    }

    setError('')
    setIsSaving(true)

    try {
      if (isEditing) {
        await notesApi.update(note.id, {
          title: title.trim(),
          content: content.trim(),
          is_public: isPublic,
          tags: tags.trim() || undefined,
        })
      } else {
        await notesApi.create({
          title: title.trim(),
          content: content.trim(),
          slug: generateSlug(title),
          is_public: isPublic,
          tags: tags.trim() || undefined,
        })
      }
      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
      setIsSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      <Header
        title={isEditing ? 'Edit Note' : 'New Note'}
        leftAction={{ label: 'Cancel', onPress: onCancel }}
        rightAction={{ label: 'Save', onPress: handleSave }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="Enter note title"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              autoFocus={!isEditing}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Content</Text>
            <TextInput
              style={styles.contentInput}
              placeholder="Write your note content here..."
              placeholderTextColor={colors.textMuted}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Tags (comma separated)</Text>
            <TextInput
              style={styles.tagsInput}
              placeholder="e.g., work, ideas, important"
              placeholderTextColor={colors.textMuted}
              value={tags}
              onChangeText={setTags}
            />
          </View>

          <View style={styles.switchField}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Make Public</Text>
              <Text style={styles.switchDescription}>
                Public notes can be viewed by anyone
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.buttonContainer}>
            <Button
              title={isEditing ? 'Save Changes' : 'Create Note'}
              onPress={handleSave}
              loading={isSaving}
            />
            <Button
              title="Cancel"
              onPress={onCancel}
              variant="secondary"
              style={{ marginTop: 12 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  field: {
    marginBottom: 20,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: colors.border,
  },
  contentInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 200,
    lineHeight: 24,
  },
  tagsInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  switchDescription: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  buttonContainer: {
    marginTop: 8,
  },
})
