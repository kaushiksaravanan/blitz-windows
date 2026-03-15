package dev.blitz.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import dev.blitz.companion.ui.BlitzApp
import dev.blitz.companion.ui.theme.BlitzCompanionTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BlitzCompanionTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    BlitzApp()
                }
            }
        }
    }
}
