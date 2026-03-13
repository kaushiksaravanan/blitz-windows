import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { useTheme, ThemeMode, FontSizes } from '../context/ThemeContext'
import { Header } from '../components/ui'

interface SettingsScreenProps {
  onBack?: () => void
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { colors, fonts, isDark, settings, updateSettings } = useTheme()

  const themeModeOptions: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'weather-sunny' },
    { value: 'dark', label: 'Dark', icon: 'weather-night' },
    { value: 'system', label: 'System', icon: 'theme-light-dark' },
  ]

  const fontSizeOptions: { value: 'small' | 'medium' | 'large'; label: string }[] = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ]

  const styles = createStyles(colors, fonts)

  return (
    <View style={styles.container}>
      <Header
        title="Settings"
        leftAction={onBack ? { label: 'Back', onPress: onBack } : undefined}
      />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>

          <View style={styles.settingCard}>
            <Text style={styles.settingLabel}>Theme</Text>
            <View style={styles.themeOptions}>
              {themeModeOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.themeOption,
                    settings.themeMode === option.value && styles.themeOptionActive,
                  ]}
                  onPress={() => updateSettings({ themeMode: option.value })}
                >
                  <Icon
                    name={option.icon}
                    size={20}
                    color={settings.themeMode === option.value ? '#fff' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.themeOptionText,
                      settings.themeMode === option.value && styles.themeOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.settingCard, { marginTop: 12 }]}>
            <Text style={styles.settingLabel}>Font Size</Text>
            <View style={styles.fontSizeOptions}>
              {fontSizeOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.fontSizeOption,
                    settings.fontSize === option.value && styles.fontSizeOptionActive,
                  ]}
                  onPress={() => updateSettings({ fontSize: option.value })}
                >
                  <Text
                    style={[
                      styles.fontSizeOptionText,
                      settings.fontSize === option.value && styles.fontSizeOptionTextActive,
                      option.value === 'small' && { fontSize: 12 },
                      option.value === 'medium' && { fontSize: 14 },
                      option.value === 'large' && { fontSize: 16 },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Notes Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto-save</Text>
              <Text style={styles.settingDescription}>
                Automatically save notes while editing
              </Text>
            </View>
            <Switch
              value={settings.autoSave}
              onValueChange={(value) => updateSettings({ autoSave: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={settings.autoSave ? '#fff' : colors.textMuted}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDescription}>
                Receive notifications about your notes
              </Text>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={settings.notificationsEnabled ? '#fff' : colors.textMuted}
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.settingCard}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>1.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Build</Text>
              <Text style={styles.aboutValue}>2024.01</Text>
            </View>
          </View>
        </View>

        {/* Current Theme Indicator */}
        <View style={styles.themeIndicator}>
          <Icon
            name={isDark ? 'weather-night' : 'weather-sunny'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.themeIndicatorText}>
            Currently using {isDark ? 'dark' : 'light'} theme
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], fonts: FontSizes) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: fonts.sm,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
      marginLeft: 4,
    },
    settingCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    settingInfo: {
      flex: 1,
      marginRight: 16,
    },
    settingLabel: {
      fontSize: fonts.base,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
    },
    settingDescription: {
      fontSize: fonts.sm,
      color: colors.textSecondary,
    },
    themeOptions: {
      flexDirection: 'row',
      marginTop: 12,
      gap: 8,
    },
    themeOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.surfaceHover,
      gap: 6,
    },
    themeOptionActive: {
      backgroundColor: colors.primary,
    },
    themeOptionText: {
      fontSize: fonts.sm,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    themeOptionTextActive: {
      color: '#fff',
    },
    fontSizeOptions: {
      flexDirection: 'row',
      marginTop: 12,
      gap: 8,
    },
    fontSizeOption: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.surfaceHover,
    },
    fontSizeOptionActive: {
      backgroundColor: colors.primary,
    },
    fontSizeOptionText: {
      fontWeight: '500',
      color: colors.textSecondary,
    },
    fontSizeOptionTextActive: {
      color: '#fff',
    },
    aboutRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    aboutLabel: {
      fontSize: fonts.base,
      color: colors.text,
    },
    aboutValue: {
      fontSize: fonts.base,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    themeIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 8,
    },
    themeIndicatorText: {
      fontSize: fonts.xs,
      color: colors.textMuted,
    },
  })
