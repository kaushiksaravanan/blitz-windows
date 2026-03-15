package dev.blitz.companion.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.blitz.companion.BlitzCompanionApp
import dev.blitz.companion.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DevicesViewModel : ViewModel() {

    private val api get() = BlitzCompanionApp.instance.apiClient

    private val _devices = MutableStateFlow<List<AdbDevice>>(emptyList())
    val devices: StateFlow<List<AdbDevice>> = _devices.asStateFlow()

    private val _selectedDevice = MutableStateFlow<AdbDevice?>(null)
    val selectedDevice: StateFlow<AdbDevice?> = _selectedDevice.asStateFlow()

    private val _screenshotBase64 = MutableStateFlow<String?>(null)
    val screenshotBase64: StateFlow<String?> = _screenshotBase64.asStateFlow()

    private val _packages = MutableStateFlow<List<String>>(emptyList())
    val packages: StateFlow<List<String>> = _packages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init {
        refreshDevices()
    }

    fun refreshDevices() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                _devices.value = api.listDevices()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load devices"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun selectDevice(device: AdbDevice) {
        _selectedDevice.value = device
        _screenshotBase64.value = null
        _packages.value = emptyList()
    }

    fun takeScreenshot(serial: String) {
        viewModelScope.launch {
            try {
                val result = api.takeScreenshot(serial)
                if (result.success && result.data != null) {
                    _screenshotBase64.value = result.data
                } else {
                    _error.value = result.error ?: "Screenshot failed"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Screenshot failed"
            }
        }
    }

    fun loadPackages(serial: String) {
        viewModelScope.launch {
            try {
                _packages.value = api.listPackages(serial)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load packages"
            }
        }
    }

    fun installApk(serial: String, apkPath: String) {
        viewModelScope.launch {
            try {
                val result = api.installApk(serial, apkPath)
                _message.value = if (result.success) "APK installed" else result.message
            } catch (e: Exception) {
                _error.value = e.message ?: "Install failed"
            }
        }
    }

    fun uninstallPackage(serial: String, packageName: String) {
        viewModelScope.launch {
            try {
                val result = api.uninstallPackage(serial, packageName)
                _message.value = if (result.success) "Package removed" else result.message
                if (result.success) loadPackages(serial)
            } catch (e: Exception) {
                _error.value = e.message ?: "Uninstall failed"
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
