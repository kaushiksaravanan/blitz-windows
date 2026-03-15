package dev.blitz.companion.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
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
fun ConnectionScreen(onConnected: () -> Unit) {
    val prefs = BlitzCompanionApp.instance.connectionPreferences
    val api = BlitzCompanionApp.instance.apiClient
    val scope = rememberCoroutineScope()

    var host by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("9400") }
    var apiKey by remember { mutableStateOf("") }
    var isConnecting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

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
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Connect to Windows Host",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        Text(
            text = "Enter the IP address and port of your Windows Blitz controller",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 32.dp),
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

        if (isConnecting) {
            CircularProgressIndicator(modifier = Modifier.padding(16.dp))
        } else {
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

                    isConnecting = true
                    errorMessage = null

                    scope.launch {
                        try {
                            val conn = HostConnection(host, portNum, apiKey)
                            api.connect(conn)
                            // Verify connection with health check
                            val health = api.health()
                            if (health.status == "ok") {
                                prefs.saveConnection(host, portNum, apiKey)
                                onConnected()
                            } else {
                                errorMessage = "Host responded but status is: ${health.status}"
                                api.disconnect()
                            }
                        } catch (e: Exception) {
                            errorMessage = e.message ?: "Connection failed"
                            api.disconnect()
                        } finally {
                            isConnecting = false
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                Text("Connect")
            }
        }

        errorMessage?.let { msg ->
            Text(
                text = msg,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 16.dp),
            )
        }
    }
}
