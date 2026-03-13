import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Theme color definitions
const darkColors = {
  background: '#101417',
  surface: '#1a1f24',
  surfaceHover: '#242a31',
  border: '#2d353e',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  danger: '#ef4444',
  dangerHover: '#dc2626',
  success: '#22c55e',
}

const lightColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceHover: '#f1f5f9',
  border: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  danger: '#ef4444',
  dangerHover: '#dc2626',
  success: '#22c55e',
}

export type ThemeColors = typeof darkColors

export type ThemeMode = 'light' | 'dark' | 'system'

export type FontSizeOption = 'small' | 'medium' | 'large'

// Font size scales for different size options
const fontSizes = {
  small: {
    xs: 10,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 22,
    '3xl': 26,
  },
  medium: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  large: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 34,
  },
}

export type FontSizes = typeof fontSizes.medium

interface Settings {
  themeMode: ThemeMode
  notificationsEnabled: boolean
  autoSave: boolean
  fontSize: FontSizeOption
}

interface ThemeContextType {
  colors: ThemeColors
  fonts: FontSizes
  isDark: boolean
  settings: Settings
  updateSettings: (updates: Partial<Settings>) => void
}

const defaultSettings: Settings = {
  themeMode: 'system',
  notificationsEnabled: true,
  autoSave: true,
  fontSize: 'medium',
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const SETTINGS_KEY = '@app_settings'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme()
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load settings from storage on mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY)
      if (stored) {
        setSettings({ ...defaultSettings, ...JSON.parse(stored) })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setIsLoaded(true)
    }
  }

  const saveSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  const updateSettings = (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates }
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  // Determine if dark mode based on settings
  const isDark =
    settings.themeMode === 'dark' ||
    (settings.themeMode === 'system' && systemColorScheme === 'dark')

  const colors = isDark ? darkColors : lightColors
  const fonts = fontSizes[settings.fontSize]

  // Don't render until settings are loaded to prevent flash
  if (!isLoaded) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ colors, fonts, isDark, settings, updateSettings }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// For backwards compatibility - returns current theme colors
export function useColors() {
  const { colors } = useTheme()
  return colors
}