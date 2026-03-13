import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native'
import { Button, Input } from '../components/ui'
import { useTheme, ThemeColors } from '../context/ThemeContext'

interface SignupScreenProps {
  onSignup: (data: {
    username: string
    email: string
    password: string
    passwordConfirm: string
    name: string
  }) => Promise<any>
  onNavigateToLogin: () => void
  isLoading?: boolean
  onBack?: () => void
}

export function SignupScreen({ onSignup, onNavigateToLogin, isLoading, onBack }: SignupScreenProps) {
  const { colors } = useTheme()
  const styles = createStyles(colors)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')

  // Validate username format (lowercase letters, numbers, underscores, 3-20 chars)
  const isValidUsername = (value: string) => /^[a-z0-9_]{3,20}$/.test(value)

  const handleSignup = async () => {
    if (!name || !username || !email || !password || !passwordConfirm) {
      setError('Please fill in all fields')
      return
    }
    if (!isValidUsername(username)) {
      setError('Username must be 3-20 characters, lowercase letters, numbers, and underscores only')
      return
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setError('')
    try {
      await onSignup({ username, email, password, passwordConfirm, name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {onBack && (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      )}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Name"
            placeholder="Enter your full name"
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />

          <Input
            label="Username"
            placeholder="lowercase letters, numbers, _ (3-20 chars)"
            value={username}
            onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoCapitalize="none"
            autoComplete="username"
          />

          <Input
            label="Email"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Input
            label="Password"
            placeholder="Create a password (min 8 characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <Input
            label="Confirm Password"
            placeholder="Confirm your password"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
            autoComplete="new-password"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Create Account"
            onPress={handleSignup}
            loading={isLoading}
            style={{ marginTop: 8 }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Button
            title="Sign In"
            onPress={onNavigateToLogin}
            variant="ghost"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 0,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  form: {
    marginBottom: 24,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
})
