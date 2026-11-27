package com.example

import com.example.data.model.VideoSourceType
import com.example.util.UrlUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlUtilsTest {

    @Test
    fun extractsYouTubeIdsFromAllFormats() {
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube.com/watch?app=desktop&si=abc&v=dQw4w9WgXcQ&t=42s"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://m.youtube.com/watch?si=xyz&v=dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=12"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://m.youtube.com/shorts/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ?feature=share"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("youtu.be/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("\u200F https://www.youtube.com/watch?v=dQw4w9WgXcQ \u200E"))
        assertEquals(
            "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&autoplay=0&enablejsapi=1",
            UrlUtils.toYouTubeEmbedUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")
        )
        assertNull(UrlUtils.extractYouTubeVideoId("https://example.com/lesson.mp4"))
    }

    @Test
    fun detectsVideoSourceTypesAccurately() {
        assertEquals(VideoSourceType.YOUTUBE, UrlUtils.detectVideoSourceType("https://youtu.be/dQw4w9WgXcQ"))
        assertEquals(VideoSourceType.MP4, UrlUtils.detectVideoSourceType("https://cdn.example.com/algebra.mp4"))
        assertEquals(VideoSourceType.MP4, UrlUtils.detectVideoSourceType("https://cdn.example.com/stream.m3u8?token=abc"))
        assertEquals(
            VideoSourceType.MP4,
            UrlUtils.detectVideoSourceType("https://midad-media.example.workers.dev/files/lessons/vid123.mp4")
        )
        assertEquals(
            VideoSourceType.MP4,
            UrlUtils.detectVideoSourceType("https://midad-media.example.workers.dev/files/lessons/stream-no-ext")
        )
        assertEquals(
            VideoSourceType.MP4,
            UrlUtils.detectVideoSourceType("https://pub-abc123.r2.dev/videos/calculus.mp4")
        )
        assertEquals(
            VideoSourceType.MP4,
            UrlUtils.detectVideoSourceType("https://media.midad.edu/stream/42", VideoSourceType.MP4)
        )
        assertEquals(VideoSourceType.EXTERNAL, UrlUtils.detectVideoSourceType("https://vimeo.com/123456"))
    }

    @Test
    fun normalizesGoogleDriveAndDropboxPdfUrls() {
        assertEquals(
            "https://drive.google.com/uc?export=download&id=1AbC2Def3Ghi",
            UrlUtils.normalizePdfDownloadUrl("https://drive.google.com/file/d/1AbC2Def3Ghi/view?usp=sharing")
        )
        assertEquals(
            "https://www.dropbox.com/s/xyz/notes.pdf?dl=1",
            UrlUtils.normalizePdfDownloadUrl("https://www.dropbox.com/s/xyz/notes.pdf?dl=0")
        )
    }

    @Test
    fun formatsDurationsCorrectly() {
        assertEquals("02:05", UrlUtils.formatDurationMs(125_000L))
        assertEquals("1:01:05", UrlUtils.formatDurationMs(3_665_000L))
    }

    @Test
    fun validatesSafeHttpsUrlsOnly() {
        assertTrue(UrlUtils.isSafeHttpsUrl("https://github.com/org/repo/releases/download/v1.1.0/midad.apk"))
        assertTrue(UrlUtils.isSafeHttpsUrl("  HTTPS://cdn.midad.edu/file.pdf "))
        assertFalse(UrlUtils.isSafeHttpsUrl("http://example.com/file.apk"))
        assertFalse(UrlUtils.isSafeHttpsUrl("javascript:alert(1)"))
        assertFalse(UrlUtils.isSafeHttpsUrl("intent://scan/#Intent;end"))
        assertFalse(UrlUtils.isSafeHttpsUrl("file:///data/local/tmp/x.apk"))
        assertFalse(UrlUtils.isSafeHttpsUrl("data:text/html,<script>alert(1)</script>"))
        assertFalse(UrlUtils.isSafeHttpsUrl(""))
        assertFalse(UrlUtils.isSafeHttpsUrl(null))
    }

    @Test
    fun checksSameOriginAndSanitizesUrlsForLogs() {
        assertTrue(
            UrlUtils.isSameOriginAsBaseUrl(
                "https://midad-r2.workers.dev/files/lessons/v1.mp4",
                "https://midad-r2.workers.dev"
            )
        )
        assertFalse(
            UrlUtils.isSameOriginAsBaseUrl(
                "https://evil.example.com/files/lessons/v1.mp4",
                "https://midad-r2.workers.dev"
            )
        )
        assertEquals(
            "https://cdn.midad.edu/files/lesson1.mp4",
            UrlUtils.sanitizeUrlForLog("https://cdn.midad.edu/files/lesson1.mp4?token=secret123#frag")
        )
        assertTrue(
            UrlUtils.isWorkerB2MediaUrl(
                "https://midad-r2.workers.dev/b2/files/materials/worksheet.docx",
                "https://midad-r2.workers.dev/"
            )
        )
        assertFalse(
            UrlUtils.isWorkerB2MediaUrl(
                "https://midad-r2.workers.dev/files/materials/legacy.pdf",
                "https://midad-r2.workers.dev"
            )
        )
        assertFalse(
            UrlUtils.isWorkerB2MediaUrl(
                "https://evil.example.com/b2/files/materials/worksheet.docx",
                "https://midad-r2.workers.dev"
            )
        )
    }
}
