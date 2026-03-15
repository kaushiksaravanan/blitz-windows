package dev.blitz.companion

import android.app.Application
import dev.blitz.companion.data.BlitzApiClient
import dev.blitz.companion.data.ConnectionPreferences

class BlitzCompanionApp : Application() {

    lateinit var apiClient: BlitzApiClient
        private set

    lateinit var connectionPreferences: ConnectionPreferences
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        connectionPreferences = ConnectionPreferences.getInstance(this)
        apiClient = BlitzApiClient()

        // Auto-connect if saved preferences exist
        connectionPreferences.toHostConnection()?.let { conn ->
            apiClient.connect(conn)
        }
    }

    companion object {
        lateinit var instance: BlitzCompanionApp
            private set
    }
}
