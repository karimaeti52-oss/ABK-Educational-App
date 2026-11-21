package com.example.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.example.BuildConfig
import com.example.util.UrlUtils
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

class AppUpdateManager(
    private val context: Context,
    private val db: FirebaseFirestore?,
    private val scope: CoroutineScope,
    private val currentVersionCode: Int = BuildConfig.VERSION_CODE,
    private val currentVersionName: String = BuildConfig.VERSION_NAME
) {
    private val appContext = context.applicationContext ?: context
    private val _state = MutableStateFlow<AppUpdateState>(AppUpdateState.Idle)
    val state: StateFlow<AppUpdateState> = _state.asStateFlow()

    private val httpClient by lazy {
        OkHttpClient.Builder()
            .followRedirects(true)
            .followSslRedirects(true)
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .build()
    }

    private var activeReceiver: BroadcastReceiver? = null

    fun checkForUpdates(manual: Boolean = false) {
        val firestore = db
        if (firestore == null) {
            if (manual) {
                _state.value = AppUpdateState.Error("خدمة التحديث غير متاحة حالياً. حاول لاحقاً.")
            }
            return
        }
        val current = _state.value
        if (current is AppUpdateState.Downloading || current is AppUpdateState.Verifying) {
            return
        }
        scope.launch {
            if (manual) {
                _state.value = AppUpdateState.Checking
            }
            try {
                val snap = firestore.collection("appConfig")
                    .document("android_release")
                    .get()
                    .await()
                if (!snap.exists()) {
                    _state.value = if (manual) {
                        AppUpdateState.UpToDate(currentVersionName, currentVersionCode)
                    } else {
                        AppUpdateState.Idle
                    }
                    return@launch
                }
                val manifest = snap.toObject(AppReleaseManifest::class.java)
                if (manifest != null && isUpdateAvailable(manifest, currentVersionCode)) {
                    _state.value = AppUpdateState.Available(
                        manifest = manifest,
                        isMandatory = isMandatoryUpdate(manifest, currentVersionCode)
                    )
                } else {
                    _state.value = if (manual) {
                        AppUpdateState.UpToDate(currentVersionName, currentVersionCode)
                    } else {
                        AppUpdateState.Idle
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (manual) {
                    _state.value = AppUpdateState.Error(
                        e.localizedMessage ?: "تعذر التحقق من التحديثات. تأكد من اتصال الإنترنت."
                    )
                } else {
                    _state.value = AppUpdateState.Idle
                }
            }
        }
    }

    fun startUpdateDownload(manifest: AppReleaseManifest) {
        if (!UrlUtils.isSafeHttpsUrl(manifest.apkUrl)) {
            _state.value = AppUpdateState.Error(
                "رابط ملف التحديث غير آمن أو لا يستخدم بروتوكول HTTPS.",
                manifest
            )
            return
        }
        if (!isValidSha256Hex(manifest.sha256)) {
            _state.value = AppUpdateState.Error(
                "توقيع التحقق الرقمي (SHA-256) الخاص بالتحديث غير صالح.",
                manifest
            )
            return
        }

        scope.launch {
            val updatesDir = File(appContext.cacheDir, "updates").apply { if (!exists()) mkdirs() }
            val finalApk = File(updatesDir, "midad-update-${manifest.versionCode}.apk")
            val tempApk = File(updatesDir, "midad-update-${manifest.versionCode}.apk.tmp")

            try {
                if (finalApk.exists() && verifyFileSha256(finalApk, manifest.sha256)) {
                    proceedToInstall(manifest, finalApk)
                    return@launch
                }

                _state.value = AppUpdateState.Downloading(
                    manifest = manifest,
                    progressPercent = 0,
                    bytesDownloaded = 0L,
                    totalBytes = manifest.fileSizeBytes.coerceAtLeast(0L)
                )

                val resolvedUrl = resolveEffectiveApkUrl(manifest.apkUrl)
                val downloadedFile = withContext(Dispatchers.IO) {
                    val request = Request.Builder()
                        .url(resolvedUrl)
                        .header("User-Agent", "Midad-Android/$currentVersionName")
                        .build()

                    httpClient.newCall(request).execute().use { response ->
                        if (!response.isSuccessful) {
                            throw IllegalStateException("فشل تنزيل التحديث (رمز الاستجابة ${response.code})")
                        }
                        val body = response.body ?: throw IllegalStateException("ملف التحديث فارغ.")
                        val totalBytes = body.contentLength().takeIf { it > 0L }
                            ?: manifest.fileSizeBytes.takeIf { it > 0L }
                            ?: -1L

                        var bytesReadTotal = 0L
                        var lastReportedPercent = -1
                        val buffer = ByteArray(8192)
                        body.byteStream().use { input ->
                            tempApk.outputStream().use { output ->
                                while (true) {
                                    val count = input.read(buffer)
                                    if (count == -1) break
                                    output.write(buffer, 0, count)
                                    bytesReadTotal += count
                                    val pct = if (totalBytes > 0L) {
                                        ((bytesReadTotal * 100L) / totalBytes).toInt().coerceIn(0, 100)
                                    } else {
                                        0
                                    }
                                    if (pct != lastReportedPercent) {
                                        lastReportedPercent = pct
                                        _state.value = AppUpdateState.Downloading(
                                            manifest = manifest,
                                            progressPercent = pct,
                                            bytesDownloaded = bytesReadTotal,
                                            totalBytes = totalBytes.coerceAtLeast(0L)
                                        )
                                    }
                                }
                            }
                        }

                        _state.value = AppUpdateState.Verifying(manifest)

                        if (manifest.fileSizeBytes > 0L && tempApk.length() != manifest.fileSizeBytes) {
                            tempApk.delete()
                            throw IllegalStateException("حجم حزمة التحديث لا يطابق الحجم المعلن.")
                        }
                        if (!verifyFileSha256(tempApk, manifest.sha256)) {
                            tempApk.delete()
                            throw SecurityException("فشل التحقق من سلامة حزمة التحديث (SHA-256). تم حذف الملف حفاظاً على أمان جهازك.")
                        }
                        if (finalApk.exists()) finalApk.delete()
                        if (!tempApk.renameTo(finalApk)) {
                            tempApk.copyTo(finalApk, overwrite = true)
                            tempApk.delete()
                        }
                        finalApk
                    }
                }

                proceedToInstall(manifest, downloadedFile)
            } catch (e: CancellationException) {
                tempApk.delete()
                throw e
            } catch (e: Exception) {
                tempApk.delete()
                _state.value = AppUpdateState.Error(
                    e.localizedMessage ?: "تعذر إتمام تنزيل التحديث.",
                    manifest
                )
            }
        }
    }

    fun proceedToInstall(manifest: AppReleaseManifest, apkFile: File) {
        if (!apkFile.exists()) {
            startUpdateDownload(manifest)
            return
        }
        if (!canRequestPackageInstalls(appContext)) {
            _state.value = AppUpdateState.PermissionRequired(manifest, apkFile)
            return
        }
        installApk(manifest, apkFile)
    }

    fun openInstallPermissionSettings() {
        val intent = buildUnknownSourcesSettingsIntent(appContext)
        runCatching { appContext.startActivity(intent) }
    }

    fun dismissOptionalUpdate() {
        val current = _state.value
        val mandatory = (current as? AppUpdateState.Available)?.isMandatory == true
        if (!mandatory) {
            _state.value = AppUpdateState.Idle
        }
    }

    fun clearStatus() {
        _state.value = AppUpdateState.Idle
    }

    fun dispose() {
        activeReceiver?.let { receiver ->
            runCatching { appContext.unregisterReceiver(receiver) }
        }
        activeReceiver = null
    }

    private fun installApk(manifest: AppReleaseManifest, apkFile: File) {
        scope.launch {
            _state.value = AppUpdateState.Installing(manifest)
            val installerResult = runCatching {
                commitPackageInstallerSession(apkFile)
            }
            if (installerResult.isFailure) {
                // Reliable fallback via scoped FileProvider URI for OEM package installers
                val fallbackLaunched = openApkWithFileProvider(appContext, apkFile)
                if (!fallbackLaunched) {
                    _state.value = AppUpdateState.Error(
                        "تعذر فتح مثبّت الحزم على الجهاز.",
                        manifest
                    )
                } else {
                    _state.value = AppUpdateState.ReadyToInstall(manifest, apkFile)
                }
            }
        }
    }

    private suspend fun commitPackageInstallerSession(apkFile: File) = withContext(Dispatchers.IO) {
        val packageInstaller = appContext.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        val sessionId = packageInstaller.createSession(params)

        registerInstallReceiverIfNeeded()

        packageInstaller.openSession(sessionId).use { session ->
            session.openWrite("midad_update_apk", 0, apkFile.length()).use { out ->
                apkFile.inputStream().use { input ->
                    input.copyTo(out)
                }
                session.fsync(out)
            }
            val callbackAction = "${appContext.packageName}.MIDAD_APP_UPDATE_STATUS"
            val callbackIntent = Intent(callbackAction).setPackage(appContext.packageName)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = PendingIntent.getBroadcast(
                appContext,
                sessionId,
                callbackIntent,
                flags
            )
            session.commit(pendingIntent.intentSender)
        }
    }

    private fun registerInstallReceiverIfNeeded() {
        if (activeReceiver != null) return
        val action = "${appContext.packageName}.MIDAD_APP_UPDATE_STATUS"
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent == null) return
                val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)
                when (status) {
                    PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                        val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(Intent.EXTRA_INTENT)
                        }
                        if (confirmIntent != null) {
                            confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            runCatching { appContext.startActivity(confirmIntent) }
                        }
                    }
                    PackageInstaller.STATUS_SUCCESS -> {
                        _state.value = AppUpdateState.Idle
                    }
                    PackageInstaller.STATUS_FAILURE,
                    PackageInstaller.STATUS_FAILURE_ABORTED,
                    PackageInstaller.STATUS_FAILURE_BLOCKED,
                    PackageInstaller.STATUS_FAILURE_CONFLICT,
                    PackageInstaller.STATUS_FAILURE_INCOMPATIBLE,
                    PackageInstaller.STATUS_FAILURE_INVALID,
                    PackageInstaller.STATUS_FAILURE_STORAGE -> {
                        val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                        _state.value = AppUpdateState.Error(
                            if (!msg.isNullOrBlank()) "تعذر إكمال تثبيت التحديث: $msg"
                            else "تم إلغاء التحديث أو تعذر تثبيته على الجهاز."
                        )
                    }
                }
            }
        }
        ContextCompat.registerReceiver(
            appContext,
            receiver,
            IntentFilter(action),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        activeReceiver = receiver
    }

    companion object {
        const val DEFAULT_PERMANENT_APK_URL =
            "https://github.com/karimaeti52-oss/ABK-Educational-App/releases/latest/download/Midad.apk"

        private val sha256HexRegex = Regex("^[a-fA-F0-9]{64}$")

        fun resolveEffectiveApkUrl(rawUrl: String?): String =
            rawUrl?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULT_PERMANENT_APK_URL

        fun isValidSha256Hex(raw: String?): Boolean =
            !raw.isNullOrBlank() && sha256HexRegex.matches(raw.trim())

        fun isUpdateAvailable(manifest: AppReleaseManifest, currentVersionCode: Int): Boolean {
            val effectiveUrl = resolveEffectiveApkUrl(manifest.apkUrl)
            return manifest.versionCode > currentVersionCode.toLong() &&
                UrlUtils.isSafeHttpsUrl(effectiveUrl) &&
                isValidSha256Hex(manifest.sha256)
        }

        fun isMandatoryUpdate(manifest: AppReleaseManifest, currentVersionCode: Int): Boolean {
            return manifest.mandatory ||
                (manifest.minSupportedVersionCode > 0L &&
                    currentVersionCode.toLong() < manifest.minSupportedVersionCode)
        }

        fun computeSha256(input: InputStream): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(8192)
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                digest.update(buffer, 0, read)
            }
            return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
        }

        fun verifyFileSha256(file: File, expectedHex: String): Boolean {
            if (!file.exists() || !file.isFile || !isValidSha256Hex(expectedHex)) return false
            val actualHex = runCatching {
                file.inputStream().use { computeSha256(it) }
            }.getOrNull() ?: return false
            return actualHex.equals(expectedHex.trim(), ignoreCase = true)
        }

        fun canRequestPackageInstalls(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                runCatching { context.packageManager.canRequestPackageInstalls() }.getOrDefault(false)
            } else {
                true
            }
        }

        fun buildUnknownSourcesSettingsIntent(context: Context): Intent {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            } else {
                Intent(Settings.ACTION_SECURITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }

        fun openApkWithFileProvider(context: Context, apkFile: File): Boolean {
            return runCatching {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    apkFile
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(installIntent)
                true
            }.getOrDefault(false)
        }
    }
}
