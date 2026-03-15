package dev.blitz.companion.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.blitz.companion.BlitzCompanionApp
import dev.blitz.companion.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DashboardViewModel : ViewModel() {

    private val api get() = BlitzCompanionApp.instance.apiClient

    private val _hostStatus = MutableStateFlow<HostStatus?>(null)
    val hostStatus: StateFlow<HostStatus?> = _hostStatus.asStateFlow()

    private val _devices = MutableStateFlow<List<AdbDevice>>(emptyList())
    val devices: StateFlow<List<AdbDevice>> = _devices.asStateFlow()

    private val _avds = MutableStateFlow<List<AvdInfo>>(emptyList())
    val avds: StateFlow<List<AvdInfo>> = _avds.asStateFlow()

    private val _projects = MutableStateFlow<List<ProjectInfo>>(emptyList())
    val projects: StateFlow<List<ProjectInfo>> = _projects.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isHostOnline = MutableStateFlow(false)
    val isHostOnline: StateFlow<Boolean> = _isHostOnline.asStateFlow()

    init {
        refreshAll()
    }

    fun refreshAll() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                // Health check
                val health = api.health()
                _isHostOnline.value = health.status == "ok"

                // Fetch everything in parallel
                val devicesResult = runCatching { api.listDevices() }
                val avdsResult = runCatching { api.listAvds() }
                val projectsResult = runCatching { api.listProjects() }

                _devices.value = devicesResult.getOrDefault(emptyList())
                _avds.value = avdsResult.getOrDefault(emptyList())
                _projects.value = projectsResult.getOrDefault(ProjectsResponse(emptyList())).projects
            } catch (e: Exception) {
                _isHostOnline.value = false
                _error.value = e.message ?: "Connection failed"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
