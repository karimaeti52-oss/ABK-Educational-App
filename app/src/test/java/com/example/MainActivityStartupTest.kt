package com.example

import androidx.test.core.app.ApplicationProvider
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MainActivityStartupTest {

    @Test
    fun `MainActivity launches cleanly even if FirebaseApp was not auto-initialized`() {
        val context = ApplicationProvider.getApplicationContext<android.app.Application>()
        FirebaseApp.getApps(context).forEach { it.delete() }

        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        assertNotNull(controller.get())
    }

    @Test
    fun `MainActivity launches cleanly when FirebaseApp is initialized`() {
        val context = ApplicationProvider.getApplicationContext<android.app.Application>()
        if (FirebaseApp.getApps(context).isEmpty()) {
            FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setApplicationId("1:438492626356:android:da204cb15944d484a706e1")
                    .setApiKey("AIzaSyCAGjQq8WWJrJTSQAWBJvw6LJurEmQ5ssU")
                    .setProjectId("gen-lang-client-0343268738")
                    .build()
            )
        }

        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        assertNotNull(controller.get())
    }
}
