import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native'
import { User } from '../api'
import { Button, Card } from '../components/ui'
import { useTheme, ThemeColors } from '../context/ThemeContext'

interface ProfileScreenProps {
    user: User | null
    isAuthenticated: boolean
    onLogout: () => void
    onLogin: () => void
    onSignup: () => void
    onGuestLogin: () => Promise<any>
}

export function ProfileScreen({ user, isAuthenticated, onLogout, onLogin, onSignup, onGuestLogin }: ProfileScreenProps) {
    const { colors } = useTheme()
    const styles = createStyles(colors)
    const [isGuestLoading, setIsGuestLoading] = useState(false)

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        })
    }

    // Not authenticated - show login/signup options
    if (!isAuthenticated || !user) {
        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <View style={styles.guestAvatarContainer}>
                    <View style={styles.guestAvatar}>
                        <Text style={styles.guestAvatarText}>?</Text>
                    </View>
                    <Text style={styles.guestTitle}>Not Signed In</Text>
                    <Text style={styles.guestSubtitle}>
                        Sign in to access your notes and sync across devices
                    </Text>
                </View>

                <View style={styles.authButtons}>
                    <Button
                        title="Sign In"
                        onPress={onLogin}
                        style={{ marginBottom: 12 }}
                    />
                    <Button
                        title="Create Account"
                        onPress={onSignup}
                        variant="secondary"
                        style={{ marginBottom: 12 }}
                    />
                    <Button
                        title="Continue as Guest"
                        onPress={async () => {
                            setIsGuestLoading(true)
                            try { await onGuestLogin() } catch {} finally { setIsGuestLoading(false) }
                        }}
                        variant="ghost"
                        loading={isGuestLoading}
                    />
                </View>

                <Text style={styles.version}>App Version 1.0.0</Text>
            </ScrollView>
        )
    }

    // Authenticated - show profile
    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.avatarContainer}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {getInitials(user.name || user.username)}
                    </Text>
                </View>
                <Text style={styles.name}>{user.name || user.username}</Text>
                <Text style={styles.email}>{user.email}</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account Info</Text>
                <Card style={styles.infoCard}>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Username</Text>
                        <Text style={styles.infoValue}>{user.username}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Email</Text>
                        <Text style={styles.infoValue}>{user.email}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Member since</Text>
                        <Text style={styles.infoValue}>{formatDate(user.created)}</Text>
                    </View>
                    {user.role && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Role</Text>
                                <Text style={styles.infoValue}>{user.role}</Text>
                            </View>
                        </>
                    )}
                </Card>
            </View>

            <View style={styles.section}>
                <Button
                    title="Sign Out"
                    onPress={onLogout}
                    variant="danger"
                />
            </View>

            <Text style={styles.version}>App Version 1.0.0</Text>
        </ScrollView>
    )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: 20,
        paddingTop: Platform.OS === 'ios' ? 54 : 20,
    },
    // Guest state styles
    guestAvatarContainer: {
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 40,
    },
    guestAvatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    guestAvatarText: {
        fontSize: 32,
        fontWeight: '300',
        color: colors.textMuted,
    },
    guestTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
    },
    guestSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 20,
        lineHeight: 20,
    },
    authButtons: {
        marginBottom: 32,
    },
    // Authenticated state styles
    avatarContainer: {
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 20,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    avatarText: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
    },
    name: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
    },
    email: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 4,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    infoCard: {
        padding: 0,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    infoLabel: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    infoValue: {
        fontSize: 14,
        color: colors.text,
        fontWeight: '500',
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginHorizontal: 16,
    },
    version: {
        textAlign: 'center',
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 20,
    },
})
