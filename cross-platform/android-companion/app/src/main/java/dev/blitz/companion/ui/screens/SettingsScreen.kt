package dev.blitz.companion.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import dev.blitz.companion.BlitzCompanionApp
import dev.blitz.companion.data.HostConnection
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    onDisconnected: () -> Unit,
) {
    val prefs = BlitzCompanionApp.instance.connectionPreferences
    val api = BlitzCompanionApp.instance.apiClient
    val scope = rememberCoroutineScope()

    var host by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }

    // Load saved values
    LaunchedEffect(Unit) {
        prefs.host.collect { value -> if (value != null) host = value }
    }
    LaunchedEffect(Unit) {
        prefs.port.collect { value -> if (value != null) port = value.toString() }
    }
    LaunchedEffect(Unit) {
        prefs.apiKey.collect { value -> if (value != null) apiKey = value }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        Text(
            text = "Connection Settings",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 16.dp),
        )

        OutlinedTextField(
            value = host,
            onValueChange = { host = it },
            label = { Text("Host IP Address") },
            placeholder = { Text("e.g., 192.168.1.100") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
        )

        OutlinedTextField(
            value = port,
            onValueChange = { port = it },
            label = { Text("Port") },
            placeholder = { Text("9400") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
        )

        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it },
            label = { Text("API Key") },
            placeholder = { Text("Enter your API key") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp),
        )

        if (isSaving) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            api.disconnect()
                            prefs.clearConnection()
                            host = ""
                            port = ""
                            apiKey = ""
                            successMessage = null
                            errorMessage = null
                            onDisconnected()
                        }
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Icon(Icons.Default.LinkOff, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Disconnect")
                }

                Button(
                    onClick = {
                        if (host.isBlank() || port.isBlank() || apiKey.isBlank()) {
                            errorMessage = "Please fill in all fields"
                            return@Button
                        }
                        val portNum = port.toIntOrNull()
                        if (portNum == null || portNum !in 1..65535) {
                            errorMessage = "Invalid port number"
                            return@Button
                        }

                        isSaving = true
                        errorMessage = null
                        successMessage = null

                        scope.launch {
                            try {
                                val conn = HostConnection(host, portNum, apiKey)
                                api.connect(conn)
                                val health = api.health()
                                if (health.status == "ok") {
                                    prefs.saveConnection(host, portNum, apiKey)
                                    successMessage = "Reconnected successfully"
                                } else {
                                    errorMessage = "Host status: ${health.status}"
                                }
                            } catch (e: Exception) {
                                errorMessage = e.message ?: "Connection failed"
                            } finally {
                                isSaving = false
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Save & Reconnect")
                }
            }
        }

        successMessage?.let { msg ->
            Spacer(Modifier.height(16.dp))
            Text(msg, color = MaterialTheme.colorScheme.primary)
        }
        errorMessage?.let { msg ->
            Spacer(Modifier.height(16.dp))
            Text(msg, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(32.dp))
        HorizontalDivider()
        Spacer(Modifier.height(16.dp))

        Text("About", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            "Blitz Companion v1.0.0\n\n" +
                    "A companion app for the Blitz Windows Android development platform. " +
                    "Connects to the Windows Blitz controller over your local network " +
                    "to monitor devices, manage emulators, trigger builds, and view logcat remotely.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
