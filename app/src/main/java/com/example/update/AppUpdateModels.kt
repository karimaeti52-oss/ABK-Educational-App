package com.example.update

import androidx.annotation.Keep
import com.google.firebase.firestore.IgnoreExtraProperties
import java.io.File

@Keep
@IgnoreExtraProperties
data class AppReleaseManifest(
    val versionCode: Long = 0L,
    val versionName: String = "",
    val minSupportedVersionCode: Long = 0L,
    val apkUrl: String = "",
    val sha256: String = "",
    val releaseNotes: String = "",
    val mandatory: Boolean = false,
    val fileSizeBytes: Long = 0L,
    val publishedAtMillis: Long = 0L
)

sealed interface AppUpdateState {
    data object Idle : AppUpdateState
    data object Checking : AppUpdateState
    data class UpToDate(val currentVersionName: String, val currentVersionCode: Int) : AppUpdateState
    data class Available(val manifest: AppReleaseManifest, val isMandatory: Boolean) : AppUpdateState
    data class Downloading(
        val manifest: AppReleaseManifest,
        val progressPercent: Int,
        val bytesDownloaded: Long,
        val totalBytes: Long
    ) : AppUpdateState
    data class Verifying(val manifest: AppReleaseManifest) : AppUpdateState
    data class ReadyToInstall(val manifest: AppReleaseManifest, val apkFile: File) : AppUpdateState
    data class PermissionRequired(val manifest: AppReleaseManifest, val apkFile: File) : AppUpdateState
    data class Installing(val manifest: AppReleaseManifest) : AppUpdateState
    data class Error(val message: String, val manifest: AppReleaseManifest? = null) : AppUpdateState
}

/**
 * Future-ready abstraction to swap direct APK self-update with Google Play In-App Updates
 * (`AppUpdateManagerFactory`) when migrating distribution to Google Play Store.
 */
interface StoreUpdatePort {
    suspend fun isStoreManagedUpdateAvailable(): Boolean
    fun launchStoreUpdateFlow(): Boolean
}

class PlayStoreStubPort : StoreUpdatePort {
    override suspend fun isStoreManagedUpdateAvailable(): Boolean = false
    override fun launchStoreUpdateFlow(): Boolean = false
}
