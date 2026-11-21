package com.example

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.example.ui.components.UpdateDialog
import com.example.ui.theme.MidadTheme
import com.example.update.AppReleaseManifest
import com.example.update.AppUpdateManager
import com.example.update.AppUpdateState
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AppUpdateTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private fun sha256Of(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }

    @Test
    fun `isUpdateAvailable accepts permanent Midad APK URL, higher versionCode, and valid SHA-256`() {
        val validBytes = "mock-apk-binary".toByteArray()
        val validSha = sha256Of(validBytes)
        val manifest = AppReleaseManifest(
            versionCode = 5L,
            versionName = "1.2.0",
            apkUrl = AppUpdateManager.DEFAULT_PERMANENT_APK_URL,
            sha256 = validSha
        )

        assertEquals(
            "https://github.com/karimaeti52-oss/ABK-Educational-App/releases/latest/download/Midad.apk",
            AppUpdateManager.DEFAULT_PERMANENT_APK_URL
        )
        assertTrue(AppUpdateManager.isUpdateAvailable(manifest, currentVersionCode = 3))
        assertFalse(AppUpdateManager.isUpdateAvailable(manifest, currentVersionCode = 5))
        assertFalse(AppUpdateManager.isUpdateAvailable(manifest.copy(apkUrl = "http://insecure.example.com/app.apk"), 2))
        assertFalse(AppUpdateManager.isUpdateAvailable(manifest.copy(sha256 = "not-a-sha256"), 2))
    }

    @Test
    fun `isMandatoryUpdate triggers on mandatory flag or minSupportedVersionCode`() {
        val optional = AppReleaseManifest(versionCode = 5L, mandatory = false, minSupportedVersionCode = 2L)
        assertFalse(AppUpdateManager.isMandatoryUpdate(optional, currentVersionCode = 2))
        assertTrue(AppUpdateManager.isMandatoryUpdate(optional, currentVersionCode = 1))

        val forced = optional.copy(mandatory = true, minSupportedVersionCode = 0L)
        assertTrue(AppUpdateManager.isMandatoryUpdate(forced, currentVersionCode = 4))
    }

    @Test
    fun `verifyFileSha256 accepts genuine file and rejects tampered APK`() {
        val tempFile = File.createTempFile("midad_update_test_", ".apk")
        try {
            val payload = "genuine-signed-apk-contents-12345".toByteArray()
            tempFile.writeBytes(payload)
            val expectedSha = sha256Of(payload)

            assertTrue(AppUpdateManager.verifyFileSha256(tempFile, expectedSha))
            assertTrue(AppUpdateManager.verifyFileSha256(tempFile, expectedSha.uppercase()))

            tempFile.writeBytes("tampered-signed-apk-contents-12345".toByteArray())
            assertFalse(AppUpdateManager.verifyFileSha256(tempFile, expectedSha))
        } finally {
            tempFile.delete()
        }
    }

    @Test
    fun `multi-hop latest release redirect serves APK binary with matching SHA-256`() {
        val payload = ByteArray(16_384) { idx -> (idx % 251).toByte() }
        val expectedSha = sha256Of(payload)
        val server = MockWebServer()
        server.enqueue(
            MockResponse()
                .setResponseCode(302)
                .addHeader("Location", "/releases/download/v1.1.1/Midad.apk")
        )
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Content-Type", "application/vnd.android.package-archive")
                .setBody(Buffer().write(payload))
        )
        server.start()
        try {
            val client = OkHttpClient.Builder()
                .followRedirects(true)
                .followSslRedirects(true)
                .build()
            val req = Request.Builder()
                .url(server.url("/releases/latest/download/Midad.apk"))
                .header("User-Agent", "Midad-Android/1.1.1")
                .build()
            val downloadedBytes = client.newCall(req).execute().use { resp ->
                assertTrue(resp.isSuccessful)
                resp.body!!.bytes()
            }
            val tmp = File.createTempFile("midad_redirect_", ".apk")
            try {
                tmp.writeBytes(downloadedBytes)
                assertTrue(AppUpdateManager.verifyFileSha256(tmp, expectedSha))
            } finally {
                tmp.delete()
            }
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `UpdateDialog displays Midad title, release notes, and triggers download and dismiss`() {
        val manifest = AppReleaseManifest(
            versionCode = 6L,
            versionName = "1.3.0",
            apkUrl = AppUpdateManager.DEFAULT_PERMANENT_APK_URL,
            sha256 = "a".repeat(64),
            releaseNotes = "تحسينات في مشغل الدروس وإصلاحات أمنية.",
            mandatory = false,
            fileSizeBytes = 12_582_912L
        )
        var downloadedManifest: AppReleaseManifest? = null
        var dismissed = false

        composeTestRule.setContent {
            MidadTheme {
                UpdateDialog(
                    updateState = AppUpdateState.Available(manifest, isMandatory = false),
                    onStartDownload = { downloadedManifest = it },
                    onRetryInstall = { _, _ -> },
                    onOpenPermissionSettings = {},
                    onDismissOptional = { dismissed = true },
                    onClearError = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("app_update_dialog").assertIsDisplayed()
        composeTestRule.onNodeWithText("يتوفر تحديث جديد لمداد التعليمية").assertIsDisplayed()
        composeTestRule.onNodeWithText("تحديث الآن").assertIsDisplayed()
        composeTestRule.onNodeWithText("الإصدار الجديد: 1.3.0").assertIsDisplayed()
        composeTestRule.onNodeWithTag("update_confirm_download_btn").performClick()
        assertEquals(manifest, downloadedManifest)
        composeTestRule.onNodeWithTag("update_dismiss_btn").performClick()
        assertTrue(dismissed)
    }

    @Test
    fun `UpdateDialog hides dismiss button for mandatory updates and renders download progress`() {
        val manifest = AppReleaseManifest(
            versionCode = 7L,
            versionName = "2.0.0",
            apkUrl = AppUpdateManager.DEFAULT_PERMANENT_APK_URL,
            sha256 = "b".repeat(64),
            mandatory = true
        )

        composeTestRule.setContent {
            MidadTheme {
                UpdateDialog(
                    updateState = AppUpdateState.Downloading(
                        manifest = manifest,
                        progressPercent = 64,
                        bytesDownloaded = 6_400_000L,
                        totalBytes = 10_000_000L
                    ),
                    onStartDownload = {},
                    onRetryInstall = { _, _ -> },
                    onOpenPermissionSettings = {},
                    onDismissOptional = {},
                    onClearError = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("update_download_progress").assertIsDisplayed()
        composeTestRule.onNodeWithTag("update_dismiss_btn").assertDoesNotExist()
    }
}
