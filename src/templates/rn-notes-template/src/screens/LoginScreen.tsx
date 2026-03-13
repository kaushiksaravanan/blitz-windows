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

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<any>
  onNavigateToSignup: () => void
  isLoading?: boolean
  onGuestLogin?: () => Promise<any>
  onBack?: () => void
}

export function LoginScreen({ onLogin, onNavigateToSignup, isLoading, onGuestLogin, onBack }: LoginScreenProps) {
  const { colors } = useTheme()
  const styles = createStyles(colors)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isGuestLoading, setIsGuestLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }
    setError('')
    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleGuestLogin = async () => {
    if (!onGuestLogin) return
    setError('')
    setIsGuestLoading(true)
    try {
      await onGuestLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed')
    } finally {
      setIsGuestLoading(false)
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
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email or Username"
            placeholder="Enter your email or username"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            style={{ marginTop: 8 }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <Button
            title="Sign Up"
            onPress={onNavigateToSignup}
            variant="ghost"
          />

          {onGuestLogin && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <Button
                title="Continue as Guest"
                onPress={handleGuestLogin}
                variant="ghost"
                loading={isGuestLoading}
              />
            </>
          )}
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textSecondary,
    fontSize: 14,
    paddingHorizontal: 12,
  },
})
