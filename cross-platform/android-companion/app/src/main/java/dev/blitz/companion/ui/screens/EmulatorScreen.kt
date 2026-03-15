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
import dev.blitz.companion.data.AvdInfo
import dev.blitz.companion.ui.viewmodel.EmulatorViewModel

@Composable
fun EmulatorScreen(
    viewModel: EmulatorViewModel = viewModel(),
) {
    val avds by viewModel.avds.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val message by viewModel.message.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Android Virtual Devices", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { viewModel.refreshAvds() }) {
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
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(msg, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        TextButton(onClick = { viewModel.clearError() }) { Text("Dismiss") }
                    }
                }
            }
        }

        message?.let { msg ->
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(msg, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer)
                        TextButton(onClick = { viewModel.clearMessage() }) { Text("OK") }
                    }
                }
            }
        }

        if (avds.isEmpty() && !isLoading) {
            item {
                Text(
                    "No AVDs found. Create one using Android Studio AVD Manager on your Windows host.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        items(avds) { avd ->
            AvdCard(
                avd = avd,
                onStart = { coldBoot -> viewModel.startAvd(avd.name, coldBoot) },
                onStop = { viewModel.stopAvd(avd.name) },
            )
        }
    }
}

@Composable
private fun AvdCard(
    avd: AvdInfo,
    onStart: (coldBoot: Boolean) -> Unit,
    onStop: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Devices, contentDescription = null, modifier = Modifier.size(28.dp))
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(avd.name, style = MaterialTheme.typography.titleSmall)
                    Row {
                        Text(
                            if (avd.isRunning) "Running" else "Stopped",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (avd.isRunning) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        avd.runningSerial?.let { serial ->
                            Text(
                                " ($serial)",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (avd.apiLevel > 0) {
                        Text(
                            "API ${avd.apiLevel}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (avd.isRunning) {
                    OutlinedButton(onClick = onStop) {
                        Icon(Icons.Default.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Stop")
                    }
                } else {
                    Button(onClick = { onStart(false) }) {
                        Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Start")
                    }
                    OutlinedButton(onClick = { onStart(true) }) {
                        Icon(Icons.Default.RestartAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Cold Boot")
                    }
                }
            }
        }
    }
}
