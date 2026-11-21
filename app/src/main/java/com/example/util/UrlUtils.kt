package com.example.util

import com.example.data.model.VideoSourceType
import java.util.Locale

object UrlUtils {

    private val videoIdRegex = Regex("^[a-zA-Z0-9_-]{11}$")
    private val youtubeFallbackRegex = Regex(
        "(?:youtu\\.be/|(?:m\\.|www\\.|music\\.)?youtube(?:-nocookie)?\\.com/(?:embed/|shorts/|live/|v/|watch\\?(?:[^#]*&)?v=))([a-zA-Z0-9_-]{11})"
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
        val trimmed = url.trim()
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
                    if (idx > 0 && pair.substring(0, idx) == "v") {
                        val value = pair.substring(idx + 1)
                        if (videoIdRegex.matches(value)) return value
                    }
                }
                val segments = uri.path.orEmpty().split('/').filter { it.isNotBlank() }
                if (segments.size >= 2 && segments[0] in setOf("embed", "shorts", "live", "v", "e")) {
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

    fun detectVideoSourceType(url: String): VideoSourceType {
        val lower = url.trim().lowercase(Locale.ROOT)
        return when {
            extractYouTubeVideoId(url) != null -> VideoSourceType.YOUTUBE
            lower.endsWith(".mp4") || lower.endsWith(".m3u8") || lower.endsWith(".webm") ||
                lower.contains(".mp4?") || lower.contains(".m3u8?") -> VideoSourceType.MP4
            else -> VideoSourceType.EXTERNAL
        }
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
