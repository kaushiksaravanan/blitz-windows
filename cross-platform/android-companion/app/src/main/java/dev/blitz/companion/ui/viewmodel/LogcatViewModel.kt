package dev.blitz.companion.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.blitz.companion.BlitzCompanionApp
import dev.blitz.companion.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class LogcatViewModel : ViewModel() {

    private val api get() = BlitzCompanionApp.instance.apiClient

    private val _devices = MutableStateFlow<List<AdbDevice>>(emptyList())
    val devices: StateFlow<List<AdbDevice>> = _devices.asStateFlow()

    private val _selectedSerial = MutableStateFlow<String?>(null)
    val selectedSerial: StateFlow<String?> = _selectedSerial.asStateFlow()

    private val _logLines = MutableStateFlow<List<String>>(emptyList())
    val logLines: StateFlow<List<String>> = _logLines.asStateFlow()

    private val _filterText = MutableStateFlow("")
    val filterText: StateFlow<String> = _filterText.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /**
     * Derived StateFlow that recomputes whenever logLines or filterText changes.
     * This ensures Compose properly recomposes when the filter is updated.
     */
    val filteredLines: StateFlow<List<String>> = combine(_logLines, _filterText) { lines, filter ->
        if (filter.isBlank()) {
            lines
        } else {
            lines.filter { it.contains(filter, ignoreCase = true) }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        refreshDevices()
    }

    fun refreshDevices() {
        viewModelScope.launch {
            try {
                _devices.value = api.listDevices()
                // Auto-select first device if none selected
                if (_selectedSerial.value == null && _devices.value.isNotEmpty()) {
                    selectDevice(_devices.value.first().serial)
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load devices"
            }
        }
    }

    fun selectDevice(serial: String) {
        _selectedSerial.value = serial
        refreshLogcat()
    }

    fun refreshLogcat() {
        val serial = _selectedSerial.value ?: return
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                _logLines.value = api.getLogcat(serial)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load logcat"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun clearLogcat() {
        val serial = _selectedSerial.value ?: return
        viewModelScope.launch {
            try {
                api.clearLogcat(serial)
                _logLines.value = emptyList()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to clear logcat"
            }
        }
    }

    fun setFilter(text: String) {
        _filterText.value = text
    }

    fun clearError() {
        _error.value = null
    }
}
