package dev.blitz.companion.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = Color(0xFF6366F1),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE0E0FF),
    onPrimaryContainer = Color(0xFF1A1A5E),
    secondary = Color(0xFF10B981),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFD0F5E8),
    onSecondaryContainer = Color(0xFF0A3D2A),
    tertiary = Color(0xFFF59E0B),
    onTertiary = Color(0xFFFFFFFF),
    background = Color(0xFFFCFCFF),
    onBackground = Color(0xFF1A1A2E),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1A1A2E),
    surfaceVariant = Color(0xFFF0F0F8),
    onSurfaceVariant = Color(0xFF5A5A70),
    error = Color(0xFFEF4444),
    onError = Color(0xFFFFFFFF),
    outline = Color(0xFFD0D0E0),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF818CF8),
    onPrimary = Color(0xFF1A1A2E),
    primaryContainer = Color(0xFF2A2A5E),
    onPrimaryContainer = Color(0xFFE0E0FF),
    secondary = Color(0xFF34D399),
    onSecondary = Color(0xFF0A2A1A),
    secondaryContainer = Color(0xFF0A3D2A),
    onSecondaryContainer = Color(0xFFD0F5E8),
    tertiary = Color(0xFFF59E0B),
    onTertiary = Color(0xFF1A1A2E),
    background = Color(0xFF0A0A0F),
    onBackground = Color(0xFFE8E8F0),
    surface = Color(0xFF12121A),
    onSurface = Color(0xFFE8E8F0),
    surfaceVariant = Color(0xFF1A1A28),
    onSurfaceVariant = Color(0xFF8888A0),
    error = Color(0xFFEF4444),
    onError = Color(0xFFFFFFFF),
    outline = Color(0xFF2A2A3A),
)

@Composable
fun BlitzCompanionTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
