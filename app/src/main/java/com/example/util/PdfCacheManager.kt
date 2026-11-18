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
        val dir = File(context.filesDir, "abk_pdfs")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun getCachedPdfFile(context: Context, materialId: String): File {
        val safeId = materialId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        return File(getOfflineDir(context), "$safeId.pdf")
    }

    fun isPdfCachedOffline(context: Context, materialId: String): Boolean {
        val file = getCachedPdfFile(context, materialId)
        return file.exists() && file.length() > 100L
    }

    fun listCachedMaterialIds(context: Context): Set<String> {
        val dir = getOfflineDir(context)
        return dir.listFiles()
            ?.filter { it.isFile && it.name.endsWith(".pdf") && it.length() > 100L }
            ?.map { it.name.removeSuffix(".pdf") }
            ?.toSet()
            ?: emptySet()
    }

    suspend fun getOrDownloadPdf(
        context: Context,
        materialId: String,
        rawUrl: String,
        forceRefresh: Boolean = false
    ): Result<File> = withContext(Dispatchers.IO) {
        val targetFile = getCachedPdfFile(context, materialId)
        if (!forceRefresh && targetFile.exists() && targetFile.length() > 100L) {
            return@withContext Result.success(targetFile)
        }
        val normalizedUrl = UrlUtils.normalizePdfDownloadUrl(rawUrl)
        try {
            val request = Request.Builder()
                .url(normalizedUrl)
                .header("User-Agent", "ABK-Android/1.0")
                .build()
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
                // Basic PDF magic header verification
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
        rawUrl: String
    ): Result<String> = withContext(Dispatchers.IO) {
        val fileResult = getOrDownloadPdf(context, materialId, rawUrl)
        val sourceFile = fileResult.getOrElse { return@withContext Result.failure(it) }
        val cleanName = title.replace(Regex("[^\\p{L}\\p{N}_\\- ]"), "_")
            .trim()
            .ifBlank { "ABK_Document" } + ".pdf"

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, cleanName)
                    put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/ABK")
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return@withContext Result.failure(IllegalStateException("تعذر إنشاء ملف في التنزيلات"))
                resolver.openOutputStream(uri)?.use { out ->
                    sourceFile.inputStream().use { input -> input.copyTo(out) }
                } ?: return@withContext Result.failure(IllegalStateException("تعذر الكتابة إلى التنزيلات"))
                Result.success("تم حفظ الملف في التنزيلات/ABK")
            } else {
                @Suppress("DEPRECATION")
                val downloadsDir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "ABK"
                )
                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                val dest = File(downloadsDir, cleanName)
                sourceFile.copyTo(dest, overwrite = true)
                Result.success("تم حفظ الملف في التنزيلات/ABK")
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
