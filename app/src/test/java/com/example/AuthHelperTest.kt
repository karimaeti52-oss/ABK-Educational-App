package com.example

import android.content.Context
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.test.core.app.ApplicationProvider
import com.example.data.firebase.classifyCancellationOrConfigError
import com.example.data.firebase.formatFirebaseAuthError
import com.example.data.firebase.resolveWebClientId
import com.google.firebase.auth.FirebaseAuthException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AuthHelperTest {

    @Test
    fun `resolveWebClientId returns web client id generated from google-services json`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val clientId = resolveWebClientId(context)
        assertNotNull("default_web_client_id should resolve from google-services.json", clientId)
        assertTrue(
            "Expected Google OAuth Web Client ID ending with .apps.googleusercontent.com, got $clientId",
            clientId!!.endsWith(".apps.googleusercontent.com")
        )
        assertEquals(
            "438492626356-il754g2m0oq9j9kg9j9t81mt19efpoja.apps.googleusercontent.com",
            clientId
        )
    }

    @Test
    fun `classifyCancellationOrConfigError flags Play Services reauth or SHA-1 errors instead of hiding them`() {
        val devConsoleError = GetCredentialCancellationException(
            "[28444] Developer console is not set up correctly."
        )
        val diag1 = classifyCancellationOrConfigError(devConsoleError, "com.aistudio.abkedu.kpmzqx")
        assertNotNull(diag1)
        assertTrue(diag1!!.contains("com.aistudio.abkedu.kpmzqx"))
        assertTrue(diag1.contains("SHA-1"))

        val reauthError = GetCredentialCancellationException(
            "[16] Account reauth failed."
        )
        val diag2 = classifyCancellationOrConfigError(reauthError, "com.aistudio.abkedu.kpmzqx")
        assertNotNull(diag2)
        assertTrue(diag2!!.contains("[16]"))

        val plainUserCancel = GetCredentialCancellationException("User cancelled the selector")
        assertNull(classifyCancellationOrConfigError(plainUserCancel, "com.aistudio.abkedu.kpmzqx"))
    }

    @Test
    fun `formatFirebaseAuthError includes errorCode and actionable cause`() {
        val opNotAllowed = FirebaseAuthException(
            "ERROR_OPERATION_NOT_ALLOWED",
            "This operation is not allowed."
        )
        val msg1 = formatFirebaseAuthError(opNotAllowed)
        assertTrue(msg1.contains("ERROR_OPERATION_NOT_ALLOWED"))
        assertTrue(msg1.contains("Google Sign-In"))

        val invalidCred = FirebaseAuthException(
            "ERROR_INVALID_CREDENTIAL",
            "Invalid OAuth credential."
        )
        val msg2 = formatFirebaseAuthError(invalidCred)
        assertTrue(msg2.contains("ERROR_INVALID_CREDENTIAL"))
        assertTrue(msg2.contains("Web Client ID"))
    }
}
