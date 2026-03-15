package dev.blitz.companion.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

private val Context.dataStore by preferencesDataStore(name = "blitz_prefs")

private val HOST_KEY = stringPreferencesKey("host_ip")
private val PORT_KEY = intPreferencesKey("host_port")
private val API_KEY_KEY = stringPreferencesKey("host_api_key")
private val IS_CONNECTED_KEY = booleanPreferencesKey("is_connected")

/**
 * Persists connection settings for the Windows Blitz controller.
 * Uses Jetpack DataStore under the hood.
 */
class ConnectionPreferences private constructor(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob())

    val host: StateFlow<String?> = context.dataStore.data
        .map { it[HOST_KEY] }
        .stateIn(scope, SharingStarted.Lazily, null)

    val port: StateFlow<Int?> = context.dataStore.data
        .map { it[PORT_KEY] }
        .stateIn(scope, SharingStarted.Lazily, null)

    val apiKey: StateFlow<String?> = context.dataStore.data
        .map { it[API_KEY_KEY] }
        .stateIn(scope, SharingStarted.Lazily, null)

    val isConnected: StateFlow<Boolean> = context.dataStore.data
        .map { it[IS_CONNECTED_KEY] ?: false }
        .stateIn(scope, SharingStarted.Lazily, false)

    suspend fun saveConnection(host: String, port: Int, apiKey: String) {
        context.dataStore.edit { prefs ->
            prefs[HOST_KEY] = host
            prefs[PORT_KEY] = port
            prefs[API_KEY_KEY] = apiKey
            prefs[IS_CONNECTED_KEY] = true
        }
    }

    suspend fun clearConnection() {
        context.dataStore.edit { prefs ->
            prefs.remove(HOST_KEY)
            prefs.remove(PORT_KEY)
            prefs.remove(API_KEY_KEY)
            prefs[IS_CONNECTED_KEY] = false
        }
    }

    /**
     * Build a [HostConnection] from currently saved preferences, or null if missing.
     */
    fun toHostConnection(): HostConnection? {
        val h = host.value ?: return null
        val p = port.value ?: return null
        val k = apiKey.value ?: return null
        return HostConnection(h, p, k)
    }

    companion object {
        @Volatile
        private var INSTANCE: ConnectionPreferences? = null

        fun getInstance(context: Context): ConnectionPreferences {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ConnectionPreferences(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}
