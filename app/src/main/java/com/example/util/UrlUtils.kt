package com.example.util

import com.example.data.model.VideoSourceType
import java.util.Locale

object UrlUtils {

    private val youtubeRegex = Regex(
        "(?:youtube\\.com/(?:watch\\?v=|embed/|shorts/|live/)|youtu\\.be/)([a-zA-Z0-9_-]{11})"
    )

    private val driveFileRegex = Regex(
        "drive\\.google\\.com/file/d/([a-zA-Z0-9_-]+)"
    )

    private val driveOpenRegex = Regex(
        "drive\\.google\\.com/open\\?id=([a-zA-Z0-9_-]+)"
    )

    fun extractYouTubeVideoId(url: String): String? {
        val trimmed = url.trim()
        if (trimmed.length == 11 && trimmed.matches(Regex("^[a-zA-Z0-9_-]{11}$"))) {
            return trimmed
        }
        return youtubeRegex.find(trimmed)?.groupValues?.getOrNull(1)
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
