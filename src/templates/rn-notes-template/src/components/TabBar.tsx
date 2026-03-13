import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'
import { useTheme, ThemeColors, FontSizes } from '../context/ThemeContext'

export type TabName = 'home' | 'notes' | 'profile' | 'settings'

interface Tab {
  name: TabName
  label: string
  icon: string
  iconActive: string
}

const tabs: Tab[] = [
  { name: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'notes', label: 'Notes', icon: 'note-text-outline', iconActive: 'note-text' },
  { name: 'profile', label: 'Profile', icon: 'account-outline', iconActive: 'account' },
  { name: 'settings', label: 'Settings', icon: 'cog-outline', iconActive: 'cog' },
]

interface TabBarProps {
  activeTab: TabName
  onTabPress: (tab: TabName) => void
}

export function TabBar({ activeTab, onTabPress }: TabBarProps) {
  const { colors, fonts } = useTheme()
  const styles = createStyles(colors, fonts)

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => onTabPress(tab.name)}
            activeOpacity={0.7}
          >
            <Icon
              name={isActive ? tab.iconActive : tab.icon}
              size={24}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const createStyles = (colors: ThemeColors, fonts: FontSizes) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingBottom: 8,
      paddingTop: 8,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    label: {
      fontSize: fonts.xs,
      color: colors.textMuted,
      fontWeight: '500',
      marginTop: 4,
    },
    labelActive: {
      color: colors.primary,
      fontWeight: '600',
    },
  })
