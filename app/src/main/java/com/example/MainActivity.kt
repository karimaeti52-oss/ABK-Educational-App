package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.data.firebase.ensureFirebaseInitialized
import com.example.ui.AbkAppNavigation
import com.example.ui.theme.ABKTheme
import com.example.util.NotificationHelper

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ensureFirebaseInitialized(applicationContext)
        NotificationHelper.ensureChannel(this)
        setContent {
            ABKTheme {
                AbkAppNavigation()
            }
        }
    }
}
