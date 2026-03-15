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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.blitz.companion.ui.viewmodel.BuildsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BuildsScreen(
    viewModel: BuildsViewModel = viewModel(),
) {
    val projects by viewModel.projects.collectAsState()
    val buildLogs by viewModel.buildLogs.collectAsState()
    val isBuilding by viewModel.isBuilding.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val message by viewModel.message.collectAsState()

    var selectedProjectPath by remember { mutableStateOf("") }
    var buildTask by remember { mutableStateOf("assembleDebug") }
    var expanded by remember { mutableStateOf(false) }

    // Determine if selected project is Flutter
    val selectedProject = projects.find { it.path == selectedProjectPath }
    val isFlutterProject = selectedProject?.projectType == "flutter"

    // Update default task when project type changes
    LaunchedEffect(selectedProject?.projectType) {
        buildTask = if (isFlutterProject) "build apk --debug" else "assembleDebug"
    }

    val listState = rememberLazyListState()

    // Auto-scroll build logs
    LaunchedEffect(buildLogs.size) {
        if (buildLogs.isNotEmpty()) {
            listState.animateScrollToItem(buildLogs.size - 1)
        }
    }

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
                Text("Builds", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { viewModel.refreshProjects() }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh projects")
                }
            }
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

        // Build configuration
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Build Configuration", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(12.dp))

                    // Project selector
                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = it },
                    ) {
                        OutlinedTextField(
                            value = selectedProject?.let { p ->
                                val typeLabel = if (p.projectType == "flutter") " [Flutter]" else " [Android]"
                                "${p.name}$typeLabel"
                            } ?: "Select project...",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Project") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(),
                        )
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                        ) {
                            projects.forEach { project ->
                                val typeLabel = if (project.projectType == "flutter") " [Flutter]" else " [Android]"
                                DropdownMenuItem(
                                    text = { Text("${project.name}$typeLabel") },
                                    onClick = {
                                        selectedProjectPath = project.path
                                        expanded = false
                                    },
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(
                        value = buildTask,
                        onValueChange = { buildTask = it },
                        label = { Text(if (isFlutterProject) "Flutter Command" else "Gradle Task") },
                        placeholder = { Text(if (isFlutterProject) "build apk --debug" else "assembleDebug") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(12.dp))

                    Button(
                        onClick = {
                            if (selectedProjectPath.isNotBlank() && buildTask.isNotBlank()) {
                                viewModel.clearLogs()
                                viewModel.startBuild(selectedProjectPath, buildTask)
                            }
                        },
                        enabled = !isBuilding && selectedProjectPath.isNotBlank() && buildTask.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (isBuilding) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Building...")
                        } else {
                            Icon(Icons.Default.Build, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Start Build")
                        }
                    }
                }
            }
        }

        // Build log output
        if (buildLogs.isNotEmpty()) {
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Build Output", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.weight(1f))
                    Text(
                        "${buildLogs.size} lines",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 400.dp),
                ) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .padding(8.dp)
                            .fillMaxWidth(),
                    ) {
                        items(buildLogs) { line ->
                            Text(
                                text = line,
                                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
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
}
