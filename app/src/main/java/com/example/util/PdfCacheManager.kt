package com.example.util

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

object PdfCacheManager {

    private val client by lazy {
        OkHttpClient.Builder()
            .followRedirects(true)
            .followSslRedirects(true)
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    private fun getOfflineDir(context: Context): File {
        val dir = File(context.filesDir, "midad_pdfs")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun getLegacyOfflineDir(context: Context): File = File(context.filesDir, "abk_pdfs")

    fun getCachedPdfFile(context: Context, materialId: String): File {
        val safeId = materialId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val primary = File(getOfflineDir(context), "$safeId.pdf")
        if (primary.exists() && primary.length() > 100L) {
            return primary
        }
        val legacy = File(getLegacyOfflineDir(context), "$safeId.pdf")
        return if (legacy.exists() && legacy.length() > 100L) legacy else primary
    }

    fun isPdfCachedOffline(context: Context, materialId: String): Boolean {
        val file = getCachedPdfFile(context, materialId)
        return file.exists() && file.length() > 100L
    }

    fun listCachedMaterialIds(context: Context): Set<String> {
        val primaryIds = getOfflineDir(context).listFiles()
            ?.filter { it.isFile && it.name.endsWith(".pdf") && it.length() > 100L }
            ?.map { it.name.removeSuffix(".pdf") }
            .orEmpty()
        val legacyDir = getLegacyOfflineDir(context)
        val legacyIds = if (legacyDir.exists()) {
            legacyDir.listFiles()
                ?.filter { it.isFile && it.name.endsWith(".pdf") && it.length() > 100L }
                ?.map { it.name.removeSuffix(".pdf") }
                .orEmpty()
        } else {
            emptyList()
        }
        return (primaryIds + legacyIds).toSet()
    }

    suspend fun getOrDownloadPdf(
        context: Context,
        materialId: String,
        rawUrl: String,
        forceRefresh: Boolean = false,
        r2WorkerBaseUrl: String = "",
        authTokenProvider: (suspend () -> String?)? = null
    ): Result<File> = withContext(Dispatchers.IO) {
        val safeId = materialId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val existingFile = getCachedPdfFile(context, materialId)
        if (!forceRefresh && existingFile.exists() && existingFile.length() > 100L) {
            return@withContext Result.success(existingFile)
        }
        val normalizedUrl = UrlUtils.normalizePdfDownloadUrl(rawUrl)
        if (!UrlUtils.isSafeHttpsUrl(normalizedUrl)) {
            return@withContext Result.failure(
                IllegalArgumentException("رابط الملف غير آمن أو لا يستخدم بروتوكول HTTPS الموثوق.")
            )
        }
        val targetFile = File(getOfflineDir(context), "$safeId.pdf")
        try {
            val reqBuilder = Request.Builder()
                .url(normalizedUrl)
                .header("User-Agent", "Midad-Android/1.1.1")
            if (authTokenProvider != null && UrlUtils.isSameOriginAsBaseUrl(normalizedUrl, r2WorkerBaseUrl)) {
                val token = runCatching { authTokenProvider() }.getOrNull()
                if (!token.isNullOrBlank()) {
                    reqBuilder.header("Authorization", "Bearer $token")
                }
            }
            val request = reqBuilder.build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(
                        IllegalStateException("فشل تحميل الملف (${response.code})")
                    )
                }
                val body = response.body ?: return@withContext Result.failure(
                    IllegalStateException("محتوى الملف فارغ")
                )
                val tempFile = File(targetFile.parentFile, "${targetFile.name}.tmp")
                body.byteStream().use { input ->
                    tempFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                val header = ByteArray(5)
                tempFile.inputStream().use { it.read(header) }
                val headerText = String(header, Charsets.US_ASCII)
                if (!headerText.startsWith("%PDF")) {
                    tempFile.delete()
                    return@withContext Result.failure(
                        IllegalStateException("الرابط لا يشير إلى ملف PDF مباشر (قد يتطلب صلاحية وصول أو صفحة ويب)")
                    )
                }
                if (targetFile.exists()) targetFile.delete()
                tempFile.renameTo(targetFile)
                Result.success(targetFile)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun exportPdfToDownloads(
        context: Context,
        materialId: String,
        title: String,
        rawUrl: String,
        r2WorkerBaseUrl: String = "",
        authTokenProvider: (suspend () -> String?)? = null
    ): Result<String> = withContext(Dispatchers.IO) {
        val fileResult = getOrDownloadPdf(
            context = context,
            materialId = materialId,
            rawUrl = rawUrl,
            r2WorkerBaseUrl = r2WorkerBaseUrl,
            authTokenProvider = authTokenProvider
        )
        val sourceFile = fileResult.getOrElse { return@withContext Result.failure(it) }
        val cleanName = title.replace(Regex("[^\\p{L}\\p{N}_\\- ]"), "_")
            .trim()
            .ifBlank { "Midad_Document" } + ".pdf"

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, cleanName)
                    put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Midad")
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return@withContext Result.failure(IllegalStateException("تعذر إنشاء ملف في التنزيلات"))
                resolver.openOutputStream(uri)?.use { out ->
                    sourceFile.inputStream().use { input -> input.copyTo(out) }
                } ?: return@withContext Result.failure(IllegalStateException("تعذر الكتابة إلى التنزيلات"))
                Result.success("تم حفظ الملف في التنزيلات/Midad")
            } else {
                @Suppress("DEPRECATION")
                val downloadsDir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "Midad"
                )
                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                val dest = File(downloadsDir, cleanName)
                sourceFile.copyTo(dest, overwrite = true)
                Result.success("تم حفظ الملف في التنزيلات/Midad")
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun resolveSignedUrlForWorkerFile(
        rawUrl: String,
        r2WorkerBaseUrl: String,
        authTokenProvider: (suspend () -> String?)? = null,
        download: Boolean = true,
        expiresInSec: Int = 300,
        httpClient: OkHttpClient = client
    ): Result<String> = withContext(Dispatchers.IO) {
        val targetUrl = rawUrl.trim()
        val workerRaw = r2WorkerBaseUrl.trim()
        if (targetUrl.isEmpty() || workerRaw.isEmpty()) {
            return@withContext Result.failure(
                IllegalArgumentException("رابط الملف أو عنوان خادم الوسائط غير متوفر.")
            )
        }
        if (!UrlUtils.isSameOriginAsBaseUrl(targetUrl, workerRaw)) {
            return@withContext Result.failure(
                IllegalArgumentException("رابط الملف لا ينتمي إلى خادم الوسائط المعتمد للمنصة.")
            )
        }
        val workerOrigin = runCatching {
            val uri = java.net.URI(workerRaw)
            val scheme = uri.scheme?.lowercase(java.util.Locale.ROOT) ?: return@runCatching ""
            val host = uri.host ?: return@runCatching ""
            val portSuffix = if (uri.port != -1) ":${uri.port}" else ""
            "$scheme://$host$portSuffix"
        }.getOrDefault("")
        if (workerOrigin.isEmpty()) {
            return@withContext Result.failure(IllegalArgumentException("عنوان خادم الوسائط غير صالح."))
        }

        val encodedUrl = java.net.URLEncoder.encode(targetUrl, "UTF-8")
        val clampedExpiry = expiresInSec.coerceIn(60, 3600)
        val endpoint = "$workerOrigin/b2/signed-url?url=$encodedUrl&download=${if (download) "1" else "0"}&expiresIn=$clampedExpiry"

        try {
            val reqBuilder = Request.Builder()
                .url(endpoint)
                .get()
                .header("User-Agent", "Midad-Android/1.1.1")
            if (authTokenProvider != null) {
                val token = runCatching { authTokenProvider() }.getOrNull()
                if (!token.isNullOrBlank()) {
                    reqBuilder.header("Authorization", "Bearer $token")
                }
            }
            httpClient.newCall(reqBuilder.build()).execute().use { response ->
                val rawBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val serverMsg = runCatching {
                        org.json.JSONObject(rawBody).optString("error").trim()
                    }.getOrDefault("")
                    val fallbackMsg = when (response.code) {
                        401, 403 -> "لا تملك صلاحية تحميل هذا الملف (${response.code}). تأكد من تسجيل دخولك."
                        404 -> "الملف غير موجود على Backblaze B2 (${response.code})."
                        503 -> "خدمة Backblaze B2 غير متاحة حالياً (${response.code})."
                        else -> "تعذر الحصول على رابط التحميل المؤقت (${response.code})."
                    }
                    return@withContext Result.failure(
                        IllegalStateException(serverMsg.ifBlank { fallbackMsg })
                    )
                }
                val signedUrl = runCatching {
                    org.json.JSONObject(rawBody).optString("signedUrl").trim()
                }.getOrDefault("")
                if (!UrlUtils.isSafeHttpsUrl(signedUrl)) {
                    return@withContext Result.failure(
                        IllegalStateException("رابط التحميل المؤقت المستلم غير آمن أو غير صالح.")
                    )
                }
                Result.success(signedUrl)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
