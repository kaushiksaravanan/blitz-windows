package dev.blitz.companion.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.blitz.companion.ui.viewmodel.DashboardViewModel

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = viewModel(),
) {
    val isHostOnline by viewModel.isHostOnline.collectAsState()
    val devices by viewModel.devices.collectAsState()
    val avds by viewModel.avds.collectAsState()
    val projects by viewModel.projects.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Status header
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                AssistChip(
                    onClick = {},
                    label = { Text(if (isHostOnline) "Host Online" else "Host Offline") },
                    leadingIcon = {
                        Icon(
                            if (isHostOnline) Icons.Default.Wifi else Icons.Default.WifiOff,
                            contentDescription = null,
                            tint = if (isHostOnline) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.error,
                        )
                    },
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { viewModel.refreshAll() }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                }
            }
        }

        if (isLoading) {
            item {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }

        error?.let { msg ->
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Text(
                        text = msg,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }

        // Stats cards row
        item {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                StatCard(
                    label = "Devices",
                    count = devices.size,
                    icon = Icons.Default.PhoneAndroid,
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    label = "AVDs",
                    count = avds.size,
                    icon = Icons.Default.Devices,
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    label = "Projects",
                    count = projects.size,
                    icon = Icons.Default.Folder,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // Connected devices
        item {
            Text("Connected Devices", style = MaterialTheme.typography.titleMedium)
        }
        if (devices.isEmpty()) {
            item {
                Text(
                    "No devices connected",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        } else {
            items(devices) { device ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .padding(12.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            if (device.isEmulator) Icons.Default.Devices else Icons.Default.PhoneAndroid,
                            contentDescription = null,
                            modifier = Modifier.size(32.dp),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                device.model.ifBlank { device.serial },
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Text(
                                "Android ${device.androidVersion} (API ${device.apiLevel})",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        AssistChip(
                            onClick = {},
                            label = {
                                Text(
                                    device.deviceType,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                        )
                    }
                }
            }
        }

        // Emulators
        item {
            Spacer(Modifier.height(8.dp))
            Text("Emulators (AVDs)", style = MaterialTheme.typography.titleMedium)
        }
        if (avds.isEmpty()) {
            item {
                Text(
                    "No emulators configured",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        } else {
            items(avds) { avd ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .padding(12.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(avd.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                if (avd.isRunning) "Running" else "Stopped",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (avd.isRunning) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        // Projects
        item {
            Spacer(Modifier.height(8.dp))
            Text("Projects", style = MaterialTheme.typography.titleMedium)
        }
        if (projects.isEmpty()) {
            item {
                Text(
                    "No projects added",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        } else {
            items(projects) { project ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .padding(12.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Folder, contentDescription = null)
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(project.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                project.projectType,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(
    label: String,
    count: Int,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(4.dp))
            Text(count.toString(), style = MaterialTheme.typography.titleLarge)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
