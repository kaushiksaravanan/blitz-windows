/**
 * API Client for Teenybase Backend
 * Handles authentication and CRUD operations
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const PREVIEW_PROJECT_PREFIX = '__preview__'

// NOTE: BASE_URL is hardcoded to '/' for React Native compatibility
// Web builds don't use this file (they use Vite's routing instead)
const BASE_URL = '/'

const RUNTIME_PROJECT_ID = (() => {
  const match = BASE_URL.match(/\/__runtime__\/([^/]+)\/?/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
})()
const API_PORT = RUNTIME_PROJECT_ID?.startsWith(PREVIEW_PROJECT_PREFIX) ? 8786 : 8787
const resolveApiBase = () => {
  const fallbackBase = `http://localhost:${API_PORT}/api/v1`
  if (typeof globalThis === 'undefined') {
    return fallbackBase
  }
  const runtime = globalThis as { __blitzApiBase?: unknown; __blitzApiHost?: unknown }
  const explicitBase = typeof runtime.__blitzApiBase === 'string' ? runtime.__blitzApiBase.trim() : ''
  if (explicitBase) {
    return explicitBase.replace(/\/$/, '')
  }
  const hostValue = typeof runtime.__blitzApiHost === 'string' ? runtime.__blitzApiHost.trim() : ''
  if (!hostValue) {
    return fallbackBase
  }
  const schemeSeparator = '://'
  const schemeIndex = hostValue.indexOf(schemeSeparator)
  const protocol = schemeIndex > 0 ? hostValue.slice(0, schemeIndex).toLowerCase() : 'http'
  const hostStart = schemeIndex > 0 ? schemeIndex + schemeSeparator.length : 0
  const hostWithPort = hostValue.slice(hostStart).split('/')[0] ?? ''
  if (!hostWithPort) {
    return fallbackBase
  }
  const hostParts = hostWithPort.split(':')
  const hostname = hostParts[0]
  if (!hostname) {
    return fallbackBase
  }
  const port = hostParts[1] && hostParts[1].trim() ? hostParts[1].trim() : String(API_PORT)
  return `${protocol}://${hostname}:${port}/api/v1`
}
const API_BASE = resolveApiBase()
const blitzLog = (
  level: 'log' | 'info' | 'warn' | 'error',
  ...data: unknown[]
) => {
  if (typeof globalThis !== 'undefined') {
    const runtime = globalThis as {
      __blitzForwardLog?: (lvl: string, args: unknown[]) => void
      __blitzLogBuffer?: Array<{ level: string; args: unknown[] }>
    }
    if (typeof runtime.__blitzForwardLog === 'function') {
      runtime.__blitzForwardLog(level, data)
      return
    }
    if (Array.isArray(runtime.__blitzLogBuffer)) {
      runtime.__blitzLogBuffer.push({ level, args: data })
      return
    }
  }
  const fallback = console[level] ?? console.log
  fallback(...data)
}
if (typeof globalThis !== 'undefined') {
  const runtime = globalThis as { __blitzApiBase?: unknown; __blitzApiHost?: unknown }
  const explicitBase = typeof runtime.__blitzApiBase === 'string' ? runtime.__blitzApiBase : 'n/a'
  const hostValue = typeof runtime.__blitzApiHost === 'string' ? runtime.__blitzApiHost : 'n/a'
  blitzLog('log', `[API] Base URL: ${API_BASE} (host=${hostValue}, explicit=${explicitBase})`)
}
let requestCounter = 0
const logRequest = (message: string) => blitzLog('log', `[API] ${message}`)
const logRequestWarn = (message: string) => blitzLog('warn', `[API] ${message}`)
const STORAGE_PREFIX = RUNTIME_PROJECT_ID ? `blitz:${RUNTIME_PROJECT_ID}` : 'blitz'
const storageKey = (key: string) => `${STORAGE_PREFIX}:${key}`

const clearLegacyAuth = async () => {
  const legacyKeys = ['auth_token', 'refresh_token', 'auth_user']
  for (const key of legacyKeys) {
    try {
      await AsyncStorage.removeItem(key)
    } catch {
      // Ignore errors when clearing legacy keys
    }
  }
}

// Token storage (in-memory cache, persisted to AsyncStorage)
let authToken: string | null = null
let refreshToken: string | null = null

export interface User {
  id: string
  username: string
  email: string
  name: string
  avatar: string | null
  role: string
  created: string
  updated: string
}

export interface Note {
  id: string
  owner_id: string
  title: string
  content: string
  is_public: boolean
  slug: string
  tags: string | null
  cover: string | null
  views: number
  archived: boolean
  deleted_at: string | null
  created: string
  updated: string
}

export interface AuthResponse {
  token: string
  refresh_token: string
  verified?: boolean
  record: User
}

export interface ListResponse<T> {
  items: T[]
  total: number
}

// Token and user storage
export const setTokens = async (token: string | null, refresh: string | null = null, user: User | null = null) => {
  authToken = token
  refreshToken = refresh
  try {
    if (token) {
      await AsyncStorage.setItem(storageKey('auth_token'), token)
      if (refresh) await AsyncStorage.setItem(storageKey('refresh_token'), refresh)
      if (user) await AsyncStorage.setItem(storageKey('auth_user'), JSON.stringify(user))
    } else {
      await AsyncStorage.removeItem(storageKey('auth_token'))
      await AsyncStorage.removeItem(storageKey('refresh_token'))
      await AsyncStorage.removeItem(storageKey('auth_user'))
    }
  } catch (error) {
    console.error('Failed to persist tokens:', error)
  }
}

export const loadTokens = async () => {
  await clearLegacyAuth()
  try {
    authToken = await AsyncStorage.getItem(storageKey('auth_token'))
    refreshToken = await AsyncStorage.getItem(storageKey('refresh_token'))
  } catch (error) {
    console.error('Failed to load tokens:', error)
    authToken = null
    refreshToken = null
  }
  return { authToken, refreshToken }
}

export const getAuthToken = () => authToken

export const getStoredUser = async (): Promise<User | null> => {
  try {
    const stored = await AsyncStorage.getItem(storageKey('auth_user'))
    if (!stored) return null
    return JSON.parse(stored) as User
  } catch {
    return null
  }
}

// Get current user ID from JWT token
export const getCurrentUserId = (): string | null => {
  if (!authToken) return null
  try {
    const payload = JSON.parse(atob(authToken.split('.')[1]))
    return payload.id || payload.uid || null
  } catch {
    return null
  }
}

// API request helper
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const REQUEST_TIMEOUT_MS = 10000
  const requestId = ++requestCounter
  const method = (options.method ?? 'GET').toUpperCase()
  const url = `${API_BASE}${endpoint}`
  const start = Date.now()
  logRequest(`Request ${requestId} start ${method} ${url}`)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null
  let response: Response
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller?.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logRequestWarn(
      `Request ${requestId} failed ${method} ${url} after ${Date.now() - start}ms: ${message}`
    )
    if (controller && (error as Error).name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }

  logRequest(
    `Request ${requestId} response ${method} ${url} status=${response.status} duration=${
      Date.now() - start
    }ms`
  )
  let data: any
  try {
    data = await response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logRequestWarn(
      `Request ${requestId} failed to parse JSON ${method} ${url} after ${
        Date.now() - start
      }ms: ${message}`
    )
    throw error
  }

  if (!response.ok) {
    // Handle validation errors with field-specific messages
    if (data.data && typeof data.data === 'object') {
      const fieldErrors: string[] = []
      for (const [field, value] of Object.entries(data.data)) {
        if (field !== '_errors' && value && typeof value === 'object' && '_errors' in value) {
          const errors = (value as { _errors: string[] })._errors
          if (errors.length > 0) {
            fieldErrors.push(`${field}: ${errors.join(', ')}`)
          }
        }
      }
      if (fieldErrors.length > 0) {
        throw new Error(fieldErrors.join('; '))
      }
    }
    // Handle issues array (zod-style errors)
    if (data.issues && Array.isArray(data.issues)) {
      const messages = data.issues.map((issue: { path?: string[]; message?: string }) => {
        const path = issue.path?.join('.') || 'field'
        return `${path}: ${issue.message || 'invalid'}`
      })
      if (messages.length > 0) {
        throw new Error(messages.join('; '))
      }
    }
    throw new Error(data.message || data.error || 'API Error')
  }

  return data as T
}

// Auth API
export const auth = {
  async signUp(data: {
    username: string
    email: string
    password: string
    passwordConfirm: string
    name: string
  }): Promise<AuthResponse> {
    const result = await request<AuthResponse>('/table/users/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({ ...data, role: 'guest' }),
    })
    await setTokens(result.token, result.refresh_token, result.record)
    return result
  },

  async login(identity: string, password: string): Promise<AuthResponse> {
    const result = await request<AuthResponse>('/table/users/auth/login-password', {
      method: 'POST',
      body: JSON.stringify({ identity, password }),
    })
    await setTokens(result.token, result.refresh_token, result.record)
    return result
  },

  async logout(): Promise<void> {
    try {
      await request('/table/users/auth/logout', { method: 'POST' })
    } finally {
      await setTokens(null)
    }
  },

  async refreshToken(): Promise<AuthResponse> {
    if (!refreshToken) throw new Error('No refresh token')
    const result = await request<AuthResponse>('/table/users/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    await setTokens(result.token, result.refresh_token)
    return result
  },

  async getCurrentUser(): Promise<User | null> {
    if (!authToken) return null
    try {
      // Decode JWT to get user ID (basic decode, not verification)
      const payload = JSON.parse(atob(authToken.split('.')[1]))
      const userId = payload.id || payload.uid
      if (!userId) return null
      return await request<User>(`/table/users/view/${userId}`)
    } catch {
      return null
    }
  },
}

// Notes API
export const notes = {
  async list(params: {
    limit?: number
    offset?: number
    order?: string
    where?: string
  } = {}): Promise<ListResponse<Note>> {
    const queryParts: string[] = []
    if (params.limit) queryParts.push(`limit=${encodeURIComponent(String(params.limit))}`)
    if (params.offset) queryParts.push(`offset=${encodeURIComponent(String(params.offset))}`)
    if (params.order) queryParts.push(`order=${encodeURIComponent(params.order)}`)
    if (params.where) queryParts.push(`where=${encodeURIComponent(params.where)}`)

    const queryString = queryParts.join('&')
    return request<ListResponse<Note>>(
      `/table/notes/list${queryString ? '?' + queryString : ''}`
    )
  },

  async get(id: string): Promise<Note> {
    return request<Note>(`/table/notes/view/${id}`)
  },

  async create(data: {
    title: string
    content: string
    slug: string
    is_public?: boolean
    tags?: string
  }): Promise<Note> {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not authenticated')

    const result = await request<Note[]>('/table/notes/insert', {
      method: 'POST',
      body: JSON.stringify({
        values: {
          ...data,
          owner_id: userId,
          is_public: data.is_public ?? false,
        },
        returning: '*',
      }),
    })

    if (!result || result.length === 0) {
      throw new Error('Failed to create note - access denied or validation failed')
    }

    return result[0]
  },

  async update(id: string, data: Partial<{
    title: string
    content: string
    is_public: boolean
    tags: string
    archived: boolean
  }>): Promise<Note> {
    return request<Note>(`/table/notes/edit/${id}?returning=id`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async delete(id: string): Promise<void> {
    await request('/table/notes/delete', {
      method: 'POST',
      body: JSON.stringify({ where: `id = '${id}'` }),
    })
  },
}

// Export default API object
export const api = {
  auth,
  notes,
  request,
}

export default api
