package com.example.util

import com.example.data.model.VideoSourceType
import java.util.Locale

object UrlUtils {

    private val videoIdRegex = Regex("^[a-zA-Z0-9_-]{11}$")
    private val invisibleCharsRegex = Regex("[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]")
    private val youtubeFallbackRegex = Regex(
        "(?:youtu\\.be/|(?:m\\.|www\\.|music\\.)?youtube(?:-nocookie)?\\.com/(?:embed/|shorts/|live/|v/|e/|watch\\?(?:[^#]*&)?v=))([a-zA-Z0-9_-]{11})",
        RegexOption.IGNORE_CASE
    )

    private val driveFileRegex = Regex(
        "drive\\.google\\.com/file/d/([a-zA-Z0-9_-]+)"
    )

    private val driveOpenRegex = Regex(
        "drive\\.google\\.com/open\\?id=([a-zA-Z0-9_-]+)"
    )

    fun isSafeHttpsUrl(rawUrl: String?): Boolean {
        val candidate = rawUrl?.trim().orEmpty()
        if (candidate.isEmpty()) return false
        return runCatching {
            val uri = java.net.URI(candidate)
            uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()
        }.getOrDefault(false)
    }

    fun extractYouTubeVideoId(url: String): String? {
        val trimmed = invisibleCharsRegex.replace(url, "").trim()
        if (trimmed.isEmpty()) return null
        if (videoIdRegex.matches(trimmed)) {
            return trimmed
        }

        val candidate = if (!trimmed.startsWith("http://", ignoreCase = true) &&
            !trimmed.startsWith("https://", ignoreCase = true) &&
            (trimmed.contains("youtube", ignoreCase = true) || trimmed.contains("youtu.be", ignoreCase = true))
        ) {
            "https://$trimmed"
        } else {
            trimmed
        }

        runCatching {
            val uri = java.net.URI(candidate)
            val host = (uri.host ?: "").lowercase(Locale.ROOT).removePrefix("www.")
            if (host == "youtu.be") {
                val seg = uri.path?.trim('/')?.split('/')?.firstOrNull().orEmpty()
                if (videoIdRegex.matches(seg)) return seg
            }
            if (host == "youtube.com" || host == "m.youtube.com" || host == "music.youtube.com" || host == "youtube-nocookie.com") {
                val query = uri.rawQuery.orEmpty()
                for (pair in query.split('&')) {
                    val idx = pair.indexOf('=')
                    if (idx > 0 && pair.substring(0, idx).equals("v", ignoreCase = true)) {
                        val value = pair.substring(idx + 1)
                        if (videoIdRegex.matches(value)) return value
                    }
                }
                val segments = uri.path.orEmpty().split('/').filter { it.isNotBlank() }
                if (segments.size >= 2 && segments[0].lowercase(Locale.ROOT) in setOf("embed", "shorts", "live", "v", "e")) {
                    val id = segments[1]
                    if (videoIdRegex.matches(id)) return id
                }
            }
        }

        return youtubeFallbackRegex.find(trimmed)?.groupValues?.getOrNull(1)
    }

    fun toYouTubeEmbedUrl(url: String): String? {
        val id = extractYouTubeVideoId(url) ?: return null
        return "https://www.youtube.com/embed/$id?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&autoplay=0&enablejsapi=1"
    }

    fun toYouTubeWatchUrl(url: String): String {
        val id = extractYouTubeVideoId(url)
        return if (id != null) "https://www.youtube.com/watch?v=$id" else url.trim()
    }

    fun getYouTubeThumbnailUrl(url: String): String? {
        val id = extractYouTubeVideoId(url) ?: return null
        return "https://img.youtube.com/vi/$id/hqdefault.jpg"
    }

    fun detectVideoSourceType(
        url: String,
        declaredType: VideoSourceType? = null
    ): VideoSourceType {
        val trimmed = url.trim()
        val lower = trimmed.lowercase(Locale.ROOT)
        if (extractYouTubeVideoId(trimmed) != null) {
            return VideoSourceType.YOUTUBE
        }
        val pathOnly = runCatching {
            java.net.URI(trimmed).path?.lowercase(Locale.ROOT).orEmpty()
        }.getOrDefault(lower.substringBefore('?').substringBefore('#'))

        val hasDirectStreamExtension = listOf(
            ".mp4", ".m4v", ".webm", ".m3u8", ".mov", ".mkv", ".mpd"
        ).any { ext -> pathOnly.endsWith(ext) }

        val isKnownMediaCdn = (pathOnly.contains("/files/") || pathOnly.contains("/b2/files/")) &&
            (lower.contains("workers.dev") || lower.contains("r2.dev") || declaredType == VideoSourceType.MP4)

        val isFirebaseOrR2Direct = (lower.contains(".r2.dev/") ||
            lower.contains(".workers.dev/files/") ||
            lower.contains(".workers.dev/b2/files/") ||
            lower.contains("firebasestorage.googleapis.com/") ||
            lower.contains("storage.googleapis.com/")) &&
            !pathOnly.endsWith(".html") &&
            !pathOnly.endsWith(".htm")

        return when {
            hasDirectStreamExtension || isKnownMediaCdn || isFirebaseOrR2Direct -> VideoSourceType.MP4
            declaredType == VideoSourceType.MP4 && trimmed.startsWith("https://", ignoreCase = true) -> VideoSourceType.MP4
            else -> VideoSourceType.EXTERNAL
        }
    }

    fun isSameOriginAsBaseUrl(targetUrl: String?, baseUrl: String?): Boolean {
        val targetRaw = targetUrl?.trim().orEmpty()
        val baseRaw = baseUrl?.trim().orEmpty()
        if (targetRaw.isEmpty() || baseRaw.isEmpty()) return false
        return runCatching {
            val t = java.net.URI(targetRaw)
            val b = java.net.URI(baseRaw)
            val tScheme = t.scheme?.lowercase(Locale.ROOT) ?: return@runCatching false
            val bScheme = b.scheme?.lowercase(Locale.ROOT) ?: return@runCatching false
            val tHost = t.host?.lowercase(Locale.ROOT) ?: return@runCatching false
            val bHost = b.host?.lowercase(Locale.ROOT) ?: return@runCatching false
            val tPort = if (t.port != -1) t.port else if (tScheme == "https") 443 else 80
            val bPort = if (b.port != -1) b.port else if (bScheme == "https") 443 else 80
            tScheme == bScheme && tHost == bHost && tPort == bPort
        }.getOrDefault(false)
    }

    fun isWorkerB2MediaUrl(url: String?, workerBaseUrl: String?): Boolean {
        if (!isSameOriginAsBaseUrl(url, workerBaseUrl)) return false
        val path = runCatching {
            java.net.URI(url!!.trim()).path?.lowercase(Locale.ROOT).orEmpty()
        }.getOrDefault("")
        return path.startsWith("/b2/files/")
    }

    fun sanitizeUrlForLog(rawUrl: String?): String {
        val trimmed = rawUrl?.trim().orEmpty()
        if (trimmed.isEmpty()) return "<empty>"
        return runCatching {
            val uri = java.net.URI(trimmed)
            val scheme = uri.scheme ?: "unknown"
            val host = uri.host ?: "nohost"
            val path = uri.path?.take(80).orEmpty()
            "$scheme://$host$path"
        }.getOrDefault("<invalid-url>")
    }

    fun normalizePdfDownloadUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim()
        driveFileRegex.find(trimmed)?.groupValues?.getOrNull(1)?.let { fileId ->
            return "https://drive.google.com/uc?export=download&id=$fileId"
        }
        driveOpenRegex.find(trimmed)?.groupValues?.getOrNull(1)?.let { fileId ->
            return "https://drive.google.com/uc?export=download&id=$fileId"
        }
        if (trimmed.contains("dropbox.com") && trimmed.contains("dl=0")) {
            return trimmed.replace("dl=0", "dl=1")
        }
        return trimmed
    }

    fun formatDurationMs(ms: Long): String {
        val totalSeconds = (ms / 1000L).coerceAtLeast(0L)
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        return if (hours > 0) {
            String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.US, "%02d:%02d", minutes, seconds)
        }
    }
}
