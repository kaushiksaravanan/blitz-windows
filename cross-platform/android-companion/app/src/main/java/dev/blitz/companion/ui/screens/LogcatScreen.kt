package dev.blitz.companion.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.blitz.companion.ui.viewmodel.LogcatViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogcatScreen(
    viewModel: LogcatViewModel = viewModel(),
) {
    val devices by viewModel.devices.collectAsState()
    val selectedSerial by viewModel.selectedSerial.collectAsState()
    val logLines by viewModel.logLines.collectAsState()
    val filterText by viewModel.filterText.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()

    var deviceMenuExpanded by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()
    val filteredLines by viewModel.filteredLines.collectAsState()

    // Auto-scroll to bottom
    LaunchedEffect(filteredLines.size) {
        if (filteredLines.isNotEmpty()) {
            listState.animateScrollToItem(filteredLines.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
    ) {
        // Controls row
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            // Device selector
            ExposedDropdownMenuBox(
                expanded = deviceMenuExpanded,
                onExpandedChange = { deviceMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = selectedSerial ?: "Select device...",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Device") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = deviceMenuExpanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    singleLine = true,
                )
                ExposedDropdownMenu(
                    expanded = deviceMenuExpanded,
                    onDismissRequest = { deviceMenuExpanded = false },
                ) {
                    devices.forEach { device ->
                        DropdownMenuItem(
                            text = {
                                Text(device.model.ifBlank { device.serial })
                            },
                            onClick = {
                                viewModel.selectDevice(device.serial)
                                deviceMenuExpanded = false
                            },
                        )
                    }
                }
            }

            Spacer(Modifier.width(8.dp))

            IconButton(onClick = { viewModel.refreshLogcat() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
            }
            IconButton(onClick = { viewModel.clearLogcat() }) {
                Icon(Icons.Default.DeleteSweep, contentDescription = "Clear logcat")
            }
        }

        Spacer(Modifier.height(8.dp))

        // Filter
        OutlinedTextField(
            value = filterText,
            onValueChange = { viewModel.setFilter(it) },
            label = { Text("Filter") },
            placeholder = { Text("Search logcat...") },
            singleLine = true,
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (filterText.isNotBlank()) {
                    IconButton(onClick = { viewModel.setFilter("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear filter")
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(4.dp))

        // Line count
        Text(
            "${filteredLines.size} / ${logLines.size} lines",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(8.dp))

        error?.let { msg ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(msg, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                    TextButton(onClick = { viewModel.clearError() }) { Text("Dismiss") }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        if (isLoading) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
        }

        // Log output
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        ) {
            if (filteredLines.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (selectedSerial == null) "Select a device to view logcat"
                        else "No log lines",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .padding(8.dp)
                        .fillMaxSize(),
                ) {
                    items(filteredLines) { line ->
                        val textColor = when {
                            line.contains(" E ") || line.contains(" E/") -> MaterialTheme.colorScheme.error
                            line.contains(" W ") || line.contains(" W/") -> Color(0xFFF59E0B)
                            line.contains(" I ") || line.contains(" I/") -> MaterialTheme.colorScheme.primary
                            line.contains(" D ") || line.contains(" D/") -> MaterialTheme.colorScheme.onSurfaceVariant
                            line.contains(" V ") || line.contains(" V/") -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                            else -> MaterialTheme.colorScheme.onSurface
                        }
                        Text(
                            text = line,
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                            color = textColor,
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                        )
                    }
                }
            }
        }
    }
}
