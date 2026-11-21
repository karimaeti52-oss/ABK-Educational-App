package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.firebase.ensureFirebaseInitialized
import com.example.ui.AbkAppNavigation
import com.example.ui.components.MidadSplashIntro
import com.example.ui.theme.MidadTheme
import com.example.ui.theme.ThemePreferenceMode
import com.example.ui.theme.ThemePreferences
import com.example.util.NotificationHelper
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ensureFirebaseInitialized(applicationContext)
        NotificationHelper.ensureChannel(this)
        setContent {
            val scope = rememberCoroutineScope()
            val themeMode by ThemePreferences
                .observeThemeMode(applicationContext)
                .collectAsStateWithLifecycle(initialValue = ThemePreferenceMode.SYSTEM)
            val isDark = when (themeMode) {
                ThemePreferenceMode.SYSTEM -> isSystemInDarkTheme()
                ThemePreferenceMode.LIGHT -> false
                ThemePreferenceMode.DARK -> true
            }
            var showSplashIntro by rememberSaveable { mutableStateOf(true) }

            MidadTheme(darkTheme = isDark) {
                Box(modifier = Modifier.fillMaxSize()) {
                    AbkAppNavigation(
                        darkTheme = isDark,
                        themeMode = themeMode,
                        onThemeModeChange = { nextMode ->
                            scope.launch {
                                ThemePreferences.setThemeMode(applicationContext, nextMode)
                            }
                        }
                    )
                    AnimatedVisibility(
                        visible = showSplashIntro,
                        exit = fadeOut()
                    ) {
                        MidadSplashIntro(
                            onFinished = { showSplashIntro = false }
                        )
                    }
                }
            }
        }
    }
}
