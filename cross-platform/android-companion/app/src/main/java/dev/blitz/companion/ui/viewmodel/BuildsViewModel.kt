package dev.blitz.companion.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.blitz.companion.BlitzCompanionApp
import dev.blitz.companion.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class BuildsViewModel : ViewModel() {

    private val api get() = BlitzCompanionApp.instance.apiClient

    private val _projects = MutableStateFlow<List<ProjectInfo>>(emptyList())
    val projects: StateFlow<List<ProjectInfo>> = _projects.asStateFlow()

    private val _currentBuild = MutableStateFlow<BuildInfo?>(null)
    val currentBuild: StateFlow<BuildInfo?> = _currentBuild.asStateFlow()

    private val _currentBuildId = MutableStateFlow<String?>(null)
    val currentBuildId: StateFlow<String?> = _currentBuildId.asStateFlow()

    private val _buildLogs = MutableStateFlow<List<String>>(emptyList())
    val buildLogs: StateFlow<List<String>> = _buildLogs.asStateFlow()

    private val _isBuilding = MutableStateFlow(false)
    val isBuilding: StateFlow<Boolean> = _isBuilding.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init {
        refreshProjects()
    }

    fun refreshProjects() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _projects.value = api.listProjects().projects
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load projects"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun startBuild(projectPath: String, task: String, extraArgs: List<String>? = null) {
        viewModelScope.launch {
            _isBuilding.value = true
            _buildLogs.value = emptyList()
            _error.value = null
            try {
                val result = api.startBuild(projectPath, task, extraArgs)
                _message.value = result.message
                _currentBuildId.value = result.buildId.ifBlank { null }
                // Build logs will come through WebSocket events
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to start build"
                _isBuilding.value = false
            }
        }
    }

    fun pollBuildStatus() {
        val buildId = _currentBuildId.value ?: return
        viewModelScope.launch {
            try {
                val status = api.getBuildStatus(buildId)
                _currentBuild.value = status
                if (status.phase == "complete" || status.phase == "failed") {
                    _isBuilding.value = false
                }
            } catch (e: Exception) {
                // Silently retry — build may still be running
            }
        }
    }

    fun appendLog(line: String) {
        _buildLogs.value = _buildLogs.value + line
    }

    fun clearLogs() {
        _buildLogs.value = emptyList()
    }

    fun clearMessage() {
        _message.value = null
    }

    fun clearError() {
        _error.value = null
    }
}
