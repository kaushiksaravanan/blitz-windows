package dev.blitz.companion.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.blitz.companion.BlitzCompanionApp
import dev.blitz.companion.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class EmulatorViewModel : ViewModel() {

    private val api get() = BlitzCompanionApp.instance.apiClient

    private val _avds = MutableStateFlow<List<AvdInfo>>(emptyList())
    val avds: StateFlow<List<AvdInfo>> = _avds.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init {
        refreshAvds()
    }

    fun refreshAvds() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                _avds.value = api.listAvds()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load AVDs"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun startAvd(name: String, coldBoot: Boolean = false) {
        viewModelScope.launch {
            try {
                val result = api.startAvd(name, coldBoot)
                _message.value = if (result.success) "Emulator starting: $name" else result.message
                // Refresh after a short delay to pick up running status
                kotlinx.coroutines.delay(3000)
                refreshAvds()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to start emulator"
            }
        }
    }

    fun stopAvd(name: String) {
        viewModelScope.launch {
            try {
                val result = api.stopAvd(name)
                _message.value = if (result.success) "Emulator stopped: $name" else result.message
                kotlinx.coroutines.delay(1000)
                refreshAvds()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to stop emulator"
            }
        }
    }

    fun clearMessage() {
        _message.value = null
    }

    fun clearError() {
        _error.value = null
    }
}
