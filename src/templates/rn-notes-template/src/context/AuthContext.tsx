import React, { createContext, useContext, ReactNode } from 'react'
import { useAuth as useAuthHook, AuthState } from '../hooks/useAuth'

interface AuthContextType extends AuthState {
    login: (email: string, password: string) => Promise<any>
    signUp: (data: {
        username: string
        email: string
        password: string
        passwordConfirm: string
        name: string
    }) => Promise<any>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const auth = useAuthHook()

    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
