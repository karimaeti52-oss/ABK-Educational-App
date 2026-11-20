package com.example

import com.example.data.model.VideoSourceType
import com.example.util.UrlUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"))
        assertEquals("dQw4w9WgXcQ", UrlUtils.extractYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"))
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
}
