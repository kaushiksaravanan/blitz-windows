package dev.blitz.companion.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dev.blitz.companion.BlitzCompanionApp
import dev.blitz.companion.ui.screens.*

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    data object Connection : Screen("connection", "Connect", Icons.Default.Link)
    data object Dashboard : Screen("dashboard", "Dashboard", Icons.Default.Dashboard)
    data object Devices : Screen("devices", "Devices", Icons.Default.PhoneAndroid)
    data object Emulators : Screen("emulators", "Emulators", Icons.Default.Devices)
    data object Builds : Screen("builds", "Builds", Icons.Default.Build)
    data object Logcat : Screen("logcat", "Logcat", Icons.Default.Terminal)
    data object Settings : Screen("settings", "Settings", Icons.Default.Settings)
}

private val bottomNavItems = listOf(
    Screen.Dashboard,
    Screen.Devices,
    Screen.Emulators,
    Screen.Builds,
    Screen.Logcat,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlitzApp() {
    val navController = rememberNavController()
    val prefs = BlitzCompanionApp.instance.connectionPreferences
    val isConnected by prefs.isConnected.collectAsState()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val startDestination = if (isConnected) Screen.Dashboard.route else Screen.Connection.route
    val showBottomBar = isConnected && currentRoute != Screen.Connection.route

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        when (currentRoute) {
                            Screen.Connection.route -> "Connect to Host"
                            Screen.Dashboard.route -> "Dashboard"
                            Screen.Devices.route -> "Devices"
                            Screen.Emulators.route -> "Emulators"
                            Screen.Builds.route -> "Gradle Builds"
                            Screen.Logcat.route -> "Logcat"
                            Screen.Settings.route -> "Settings"
                            else -> "Blitz Companion"
                        }
                    )
                },
                actions = {
                    if (showBottomBar) {
                        IconButton(onClick = {
                            navController.navigate(Screen.Settings.route) {
                                launchSingleTop = true
                            }
                        }) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }
                    }
                },
                navigationIcon = {
                    if (currentRoute == Screen.Settings.route) {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon, contentDescription = screen.label) },
                            label = { Text(screen.label) },
                            selected = navBackStackEntry?.destination?.hierarchy?.any {
                                it.route == screen.route
                            } == true,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            composable(Screen.Connection.route) {
                ConnectionScreen(onConnected = {
                    navController.navigate(Screen.Dashboard.route) {
                        popUpTo(Screen.Connection.route) { inclusive = true }
                    }
                })
            }
            composable(Screen.Dashboard.route) {
                DashboardScreen()
            }
            composable(Screen.Devices.route) {
                DevicesScreen()
            }
            composable(Screen.Emulators.route) {
                EmulatorScreen()
            }
            composable(Screen.Builds.route) {
                BuildsScreen()
            }
            composable(Screen.Logcat.route) {
                LogcatScreen()
            }
            composable(Screen.Settings.route) {
                SettingsScreen(onDisconnected = {
                    navController.navigate(Screen.Connection.route) {
                        popUpTo(0) { inclusive = true }
                    }
                })
            }
        }
    }
}
