package dev.blitz.companion.ui.screens

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.blitz.companion.data.AdbDevice
import dev.blitz.companion.ui.viewmodel.DevicesViewModel

@Composable
fun DevicesScreen(
    viewModel: DevicesViewModel = viewModel(),
) {
    val devices by viewModel.devices.collectAsState()
    val selectedDevice by viewModel.selectedDevice.collectAsState()
    val screenshotBase64 by viewModel.screenshotBase64.collectAsState()
    val packages by viewModel.packages.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val message by viewModel.message.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Header
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("ADB Devices", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { viewModel.refreshDevices() }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                }
            }
        }

        if (isLoading) {
            item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
        }

        error?.let { msg ->
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(msg, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        TextButton(onClick = { viewModel.clearError() }) { Text("Dismiss") }
                    }
                }
            }
        }

        message?.let { msg ->
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(msg, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer)
                        TextButton(onClick = { viewModel.clearMessage() }) { Text("OK") }
                    }
                }
            }
        }

        // Device list
        if (devices.isEmpty() && !isLoading) {
            item {
                Text(
                    "No devices connected. Check ADB on your Windows host.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        items(devices) { device ->
            DeviceCard(
                device = device,
                isSelected = selectedDevice?.serial == device.serial,
                onSelect = { viewModel.selectDevice(device) },
                onScreenshot = { viewModel.takeScreenshot(device.serial) },
                onPackages = { viewModel.loadPackages(device.serial) },
            )
        }

        // Screenshot preview
        selectedDevice?.let { device ->
            screenshotBase64?.let { b64 ->
                item {
                    Text(
                        "Screenshot: ${device.model.ifBlank { device.serial }}",
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                item {
                    val bytes = Base64.decode(b64, Base64.DEFAULT)
                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bitmap != null) {
                        Card {
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = "Device screenshot",
                                contentScale = ContentScale.FillWidth,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 500.dp),
                            )
                        }
                    } else {
                        Text("Failed to decode screenshot", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        // Package list
        if (packages.isNotEmpty()) {
            item {
                Text(
                    "Packages (${packages.size})",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            items(packages) { pkg ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            pkg,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        selectedDevice?.let { device ->
                            IconButton(onClick = {
                                viewModel.uninstallPackage(device.serial, pkg)
                            }) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = "Uninstall",
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceCard(
    device: AdbDevice,
    isSelected: Boolean,
    onSelect: () -> Unit,
    onScreenshot: () -> Unit,
    onPackages: () -> Unit,
) {
    val containerColor = if (isSelected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        onClick = onSelect,
        colors = CardDefaults.cardColors(containerColor = containerColor),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (device.isEmulator) Icons.Default.Devices else Icons.Default.PhoneAndroid,
                    contentDescription = null,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        device.model.ifBlank { device.serial },
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        "Android ${device.androidVersion} (API ${device.apiLevel})",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        device.serial,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (isSelected) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onScreenshot) {
                        Icon(Icons.Default.Screenshot, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Screenshot")
                    }
                    OutlinedButton(onClick = onPackages) {
                        Icon(Icons.Default.Apps, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Packages")
                    }
                }
            }
        }
    }
}
