package com.example

import androidx.annotation.OptIn
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import com.example.data.model.Lesson
import com.example.data.model.VideoSourceType
import com.example.ui.screens.VideoErrorCause
import com.example.ui.screens.VideoPlaybackSupport
import com.example.ui.screens.VideoPlayerScreen
import com.example.ui.screens.YouTubeEmbedHost
import com.example.ui.screens.YouTubeLifecycleSnapshot
import com.example.ui.theme.MidadTheme
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException
import java.net.SocketTimeoutException

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VideoPlayerPlaybackTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @OptIn(UnstableApi::class)
    @Test
    fun `OkHttpDataSource reads R2 MP4 HTTP 206 Partial Content Range slices and scopes auth headers`() {
        val sampleMp4Header = ByteArray(128) { idx -> (idx and 0x7F).toByte() }
        val server = MockWebServer()
        server.start()
        try {
            val workerBase = server.url("").toString().removeSuffix("/")
            server.enqueue(
                MockResponse()
                    .setResponseCode(206)
                    .addHeader("Content-Type", "video/mp4")
                    .addHeader("Accept-Ranges", "bytes")
                    .addHeader("Content-Range", "bytes 16-47/${sampleMp4Header.size}")
                    .setBody(Buffer().write(sampleMp4Header, 16, 32))
            )

            val client = VideoPlaybackSupport.createVideoOkHttpClient(
                r2WorkerBaseUrl = workerBase,
                authTokenProvider = { "firebase-student-token-123" }
            )
            val factory = OkHttpDataSource.Factory(client)
            val dataSource = factory.createDataSource()
            val spec = DataSpec.Builder()
                .setUri(server.url("/files/lessons/physics_01.mp4").toString())
                .setPosition(16L)
                .setLength(32L)
                .build()

            dataSource.open(spec)
            val readBuf = ByteArray(32)
            var totalRead = 0
            while (totalRead < readBuf.size) {
                val n = dataSource.read(readBuf, totalRead, readBuf.size - totalRead)
                if (n <= 0) break
                totalRead += n
            }
            dataSource.close()

            assertEquals(32, totalRead)
            assertArrayEquals(sampleMp4Header.copyOfRange(16, 48), readBuf)

            val recorded = server.takeRequest()
            assertEquals("bytes=16-47", recorded.getHeader("Range"))
            assertEquals("Bearer firebase-student-token-123", recorded.getHeader("Authorization"))

            // Verify token is NOT leaked to an unrelated host
            val thirdPartyServer = MockWebServer()
            thirdPartyServer.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "video/mp4")
                    .setBody("ok")
            )
            thirdPartyServer.start()
            try {
                val thirdPartyDs = factory.createDataSource()
                thirdPartyDs.open(
                    DataSpec.Builder()
                        .setUri(thirdPartyServer.url("/public.mp4").toString())
                        .build()
                )
                thirdPartyDs.close()
                val thirdPartyReq = thirdPartyServer.takeRequest()
                assertNull(thirdPartyReq.getHeader("Authorization"))
            } finally {
                thirdPartyServer.shutdown()
            }
        } finally {
            server.shutdown()
        }
    }

    @OptIn(UnstableApi::class)
    @Test
    fun `OkHttpDataSource failure with HTTP 404 or 403 maps to accurate Arabic cause`() {
        val dataSpec = DataSpec.Builder().setUri("https://cdn.midad.edu/files/missing.mp4").build()

        val http404 = HttpDataSource.InvalidResponseCodeException(
            404,
            "Not Found",
            IOException("404"),
            mapOf("Content-Type" to listOf("application/json")),
            dataSpec,
            ByteArray(0)
        )
        val diag404 = VideoPlaybackSupport.mapPlaybackExceptionToArabic(
            PlaybackException("Not found", http404, PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS),
            "https://cdn.midad.edu/files/missing.mp4"
        )
        assertEquals(VideoErrorCause.NOT_FOUND, diag404.cause)
        assertEquals("HTTP_404", diag404.technicalCode)
        assertTrue(diag404.userMessageAr.contains("غير موجود"))

        val http403 = HttpDataSource.InvalidResponseCodeException(
            403,
            "Forbidden",
            IOException("403"),
            emptyMap(),
            dataSpec,
            ByteArray(0)
        )
        val diag403 = VideoPlaybackSupport.mapPlaybackExceptionToArabic(
            PlaybackException("Forbidden", http403, PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS),
            "https://cdn.midad.edu/files/protected.mp4"
        )
        assertEquals(VideoErrorCause.UNAUTHORIZED, diag403.cause)
        assertEquals("HTTP_403", diag403.technicalCode)

        val timeoutDiag = VideoPlaybackSupport.mapPlaybackExceptionToArabic(
            PlaybackException("Timeout", SocketTimeoutException("read timed out"), PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT),
            "https://cdn.midad.edu/files/slow.mp4"
        )
        assertEquals(VideoErrorCause.NETWORK_TIMEOUT, timeoutDiag.cause)

        val codecDiag = VideoPlaybackSupport.mapPlaybackExceptionToArabic(
            PlaybackException("Bad codec", null, PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED),
            "https://cdn.midad.edu/files/video.avi"
        )
        assertEquals(VideoErrorCause.UNSUPPORTED_FORMAT, codecDiag.cause)
        assertTrue(codecDiag.userMessageAr.contains("H.264"))
    }

    @Test
    fun `validateStreamUrl and mapYouTubeErrorToDiagnosis return cause-specific Arabic errors`() {
        val insecure = VideoPlaybackSupport.validateStreamUrl("http://cdn.example.com/lesson.mp4")
        assertNotNull(insecure)
        assertEquals(VideoErrorCause.INSECURE_HTTP, insecure!!.cause)

        assertNull(VideoPlaybackSupport.validateStreamUrl("https://midad-worker.workers.dev/files/video.mp4"))

        val ytPrivate = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(100)
        assertEquals(VideoErrorCause.YOUTUBE_PRIVATE, ytPrivate.cause)
        assertEquals("YT_100", ytPrivate.technicalCode)
        assertFalse(ytPrivate.canRetry)

        val yt150 = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(150, "yt_player")
        assertEquals(VideoErrorCause.YOUTUBE_OWNER_DISABLED_EMBED, yt150.cause)
        assertEquals("YT_150", yt150.technicalCode)
        assertFalse(yt150.canRetry)
        assertTrue(yt150.userMessageAr.contains("صاحب الفيديو منع تشغيله بالتضمين"))

        val yt101 = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(101, "yt_player")
        assertEquals(VideoErrorCause.YOUTUBE_OWNER_DISABLED_EMBED, yt101.cause)
        assertEquals("YT_101", yt101.technicalCode)
        assertFalse(yt101.canRetry)

        assertTrue(VideoPlaybackSupport.isPermanentYouTubeError(150))
        assertTrue(VideoPlaybackSupport.isPermanentYouTubeError(101))
        assertTrue(VideoPlaybackSupport.isPermanentYouTubeError(100))
        assertTrue(VideoPlaybackSupport.isPermanentYouTubeError(2))
        assertFalse(VideoPlaybackSupport.isPermanentYouTubeError(152))
        assertFalse(VideoPlaybackSupport.isPermanentYouTubeError(-5))

        val yt152 = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(152, "yt_player")
        assertEquals(VideoErrorCause.YOUTUBE_EMBED_RESTRICTED, yt152.cause)
        assertEquals("YT_152", yt152.technicalCode)
        assertTrue(yt152.canRetry)
        assertTrue(yt152.userMessageAr.contains("التضمين"))

        val yt2 = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(2, "yt_player")
        assertEquals(VideoErrorCause.INVALID_URL, yt2.cause)
        assertEquals("YT_2", yt2.technicalCode)
        assertFalse(yt2.canRetry)

        val yt5 = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(5, "yt_player")
        assertEquals(VideoErrorCause.DECODER_ERROR, yt5.cause)
        assertEquals("YT_5", yt5.technicalCode)

        val ytScript = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(-3, "script_onerror")
        assertEquals(VideoErrorCause.YOUTUBE_SCRIPT_BLOCKED, ytScript.cause)
        assertTrue(ytScript.technicalCode.startsWith("YT_SCRIPT"))

        val ytInit = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(-4, "yt_init_exception")
        assertEquals(VideoErrorCause.YOUTUBE_SCRIPT_BLOCKED, ytInit.cause)
        assertTrue(ytInit.technicalCode.startsWith("YT_INIT_"))

        val ytNotReady = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(-5, "player_not_ready")
        assertEquals(VideoErrorCause.YOUTUBE_EMBED_RESTRICTED, ytNotReady.cause)
        assertEquals("YT_PLAYER_NOT_READY", ytNotReady.technicalCode)
    }

    @Test
    fun `checkYouTubeEmbeddability distinguishes embeddable video from YT_150 owner-blocked video`() {
        val server = MockWebServer()
        server.start()
        try {
            val endpoint = server.url("/oembed").toString()
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .setBody("""{"title":"درس فيزياء قابل للتضمين"}""")
            )
            server.enqueue(MockResponse().setResponseCode(401))
            server.enqueue(MockResponse().setResponseCode(403))
            server.enqueue(MockResponse().setResponseCode(404))

            val embeddable = kotlinx.coroutines.runBlocking {
                VideoPlaybackSupport.checkYouTubeEmbeddability(
                    rawUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    oEmbedEndpoint = endpoint
                )
            }
            assertEquals(com.example.ui.screens.YouTubeEmbedCheckStatus.EMBEDDABLE, embeddable.status)
            assertFalse(embeddable.blockSave)
            assertEquals("درس فيزياء قابل للتضمين", embeddable.title)

            val blocked401 = kotlinx.coroutines.runBlocking {
                VideoPlaybackSupport.checkYouTubeEmbeddability(
                    rawUrl = "https://youtu.be/M7lc1UVf-VE",
                    oEmbedEndpoint = endpoint
                )
            }
            assertEquals(com.example.ui.screens.YouTubeEmbedCheckStatus.EMBED_DISABLED, blocked401.status)
            assertTrue(blocked401.blockSave)
            assertTrue(blocked401.messageAr.contains("YT_150"))

            val blocked403 = kotlinx.coroutines.runBlocking {
                VideoPlaybackSupport.checkYouTubeEmbeddability(
                    rawUrl = "https://youtu.be/M7lc1UVf-VE",
                    oEmbedEndpoint = endpoint
                )
            }
            assertEquals(com.example.ui.screens.YouTubeEmbedCheckStatus.EMBED_DISABLED, blocked403.status)
            assertTrue(blocked403.blockSave)

            val unavailable = kotlinx.coroutines.runBlocking {
                VideoPlaybackSupport.checkYouTubeEmbeddability(
                    rawUrl = "https://youtu.be/M7lc1UVf-VE",
                    oEmbedEndpoint = endpoint
                )
            }
            assertEquals(com.example.ui.screens.YouTubeEmbedCheckStatus.UNAVAILABLE, unavailable.status)
            assertTrue(unavailable.blockSave)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `VideoPlaybackErrorBox for YT_150 shows clear owner restriction message and hides retry button`() {
        val yt150 = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(150, "yt_player")
        composeTestRule.setContent {
            MidadTheme {
                com.example.ui.screens.VideoPlaybackErrorBox(
                    diagnosis = yt150,
                    boxTag = "youtube_embed_error_box",
                    retryTag = "youtube_retry_btn",
                    onRetry = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("youtube_embed_error_box").assertIsDisplayed()
        composeTestRule.onNodeWithText("مالك الفيديو منع تشغيله بالتضمين").assertIsDisplayed()
        composeTestRule.onNodeWithText("رمز التشخيص: YT_150").assertIsDisplayed()
        composeTestRule.onNodeWithTag("youtube_retry_btn").assertDoesNotExist()
    }

    @Test
    fun `diagnoseStalledYouTubePlayer identifies exact failure stage instead of silent black box`() {
        assertEquals(
            "YT_PAGE_TIMEOUT",
            VideoPlaybackSupport.diagnoseStalledYouTubePlayer(YouTubeLifecycleSnapshot(pageStarted = true)).technicalCode
        )
        assertEquals(
            "YT_JS_NOT_BOOTED",
            VideoPlaybackSupport.diagnoseStalledYouTubePlayer(YouTubeLifecycleSnapshot(pageStarted = true, pageFinished = true)).technicalCode
        )
        assertEquals(
            "YT_API_SCRIPT_TIMEOUT",
            VideoPlaybackSupport.diagnoseStalledYouTubePlayer(
                YouTubeLifecycleSnapshot(pageStarted = true, pageFinished = true, jsBooted = true)
            ).technicalCode
        )
        assertEquals(
            "YT_IFRAME_LOAD_TIMEOUT",
            VideoPlaybackSupport.diagnoseStalledYouTubePlayer(
                YouTubeLifecycleSnapshot(pageStarted = true, pageFinished = true, jsBooted = true, apiReady = true)
            ).technicalCode
        )
        assertEquals(
            "YT_PLAYER_NOT_READY",
            VideoPlaybackSupport.diagnoseStalledYouTubePlayer(
                YouTubeLifecycleSnapshot(pageStarted = true, pageFinished = true, jsBooted = true, apiReady = true, iframeLoaded = true)
            ).technicalCode
        )
    }

    @Test
    fun `buildYouTubeEmbedConfig sets app package HTTPS origin, Referer policy, and nocookie fallback`() {
        val standardConfig = VideoPlaybackSupport.buildYouTubeEmbedConfig(
            videoId = "dQw4w9WgXcQ",
            packageName = "com.aistudio.abkedu.kpmzqx",
            startSeconds = 45L,
            embedHost = YouTubeEmbedHost.STANDARD
        )
        assertEquals("https://com.aistudio.abkedu.kpmzqx", standardConfig.appOrigin)
        assertEquals("https://com.aistudio.abkedu.kpmzqx/", standardConfig.baseUrl)
        assertTrue(standardConfig.iframeSrc.startsWith("https://www.youtube.com/embed/dQw4w9WgXcQ?"))
        assertTrue(standardConfig.iframeSrc.contains("enablejsapi=1"))
        assertTrue(standardConfig.iframeSrc.contains("origin=https%3A%2F%2Fcom.aistudio.abkedu.kpmzqx"))
        assertTrue(standardConfig.iframeSrc.contains("widget_referrer=https%3A%2F%2Fcom.aistudio.abkedu.kpmzqx"))
        assertTrue(standardConfig.iframeSrc.contains("start=45"))
        assertTrue(standardConfig.html.contains("""<meta name="referrer" content="strict-origin-when-cross-origin">"""))
        assertTrue(standardConfig.html.contains("""'referrerpolicy', 'strict-origin-when-cross-origin'"""))
        assertTrue(standardConfig.html.contains("""<div id="player-container"></div>"""))
        assertTrue(standardConfig.html.contains("""host: 'https://www.youtube.com'"""))
        assertTrue(standardConfig.html.contains("22000"))
        assertTrue(standardConfig.html.contains("!playerReady"))

        val nocookieConfig = VideoPlaybackSupport.buildYouTubeEmbedConfig(
            videoId = "dQw4w9WgXcQ",
            packageName = "com.aistudio.abkedu.kpmzqx",
            startSeconds = 0L,
            embedHost = YouTubeEmbedHost.NOCOOKIE
        )
        assertTrue(nocookieConfig.iframeSrc.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?"))
        assertTrue(nocookieConfig.html.contains("""host: 'https://www.youtube-nocookie.com'"""))

        assertTrue(VideoPlaybackSupport.isAllowedYouTubeEmbedHost("www.youtube.com"))
        assertTrue(VideoPlaybackSupport.isAllowedYouTubeEmbedHost("www.youtube-nocookie.com"))
        assertFalse(VideoPlaybackSupport.isAllowedYouTubeEmbedHost("evil-youtube.com"))
        assertTrue(VideoPlaybackSupport.isCriticalYouTubeRequest("https://www.youtube.com/embed/dQw4w9WgXcQ", false))
        assertTrue(VideoPlaybackSupport.isCriticalYouTubeRequest("https://www.youtube.com/iframe_api", false))
        assertFalse(VideoPlaybackSupport.isCriticalYouTubeRequest("https://googleads.g.doubleclick.net/pagead/id", false))
    }

    @Test
    fun `VideoPlayerScreen renders YouTube playback strictly in-app with loading overlay until ready`() {
        val watchLesson = Lesson(
            id = "les_yt_watch",
            subjectId = "math",
            subjectName = "الرياضيات",
            title = "النهايات والاتصال",
            videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            videoSourceType = VideoSourceType.YOUTUBE.name
        )

        composeTestRule.setContent {
            MidadTheme {
                VideoPlayerScreen(
                    lesson = watchLesson,
                    relatedMaterials = emptyList(),
                    initialProgress = null,
                    isFavorite = false,
                    onBack = {},
                    onSaveProgress = { _, _, _ -> },
                    onToggleFavorite = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("youtube_inapp_webview").assertIsDisplayed()
        composeTestRule.onNodeWithTag("youtube_loading_overlay").assertIsDisplayed()
    }

    @Test
    fun `VideoPlayerScreen renders ExoPlayer controls for R2 MP4 stream and toggles fullscreen`() {
        val r2Mp4Lesson = Lesson(
            id = "les_r2_1",
            subjectId = "physics",
            subjectName = "الفيزياء",
            unitTitle = "الميكانيك",
            title = "قوانين نيوتن للحركة",
            teacherName = "أ. كريم عيتي",
            videoUrl = "https://midad-media.example.workers.dev/files/lessons/newton.mp4",
            videoSourceType = VideoSourceType.MP4.name
        )

        composeTestRule.setContent {
            MidadTheme {
                VideoPlayerScreen(
                    lesson = r2Mp4Lesson,
                    relatedMaterials = emptyList(),
                    initialProgress = null,
                    isFavorite = false,
                    onBack = {},
                    onSaveProgress = { _, _, _ -> },
                    onToggleFavorite = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {}
                )
            }
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("video_player_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("exo_player_view").assertIsDisplayed()
        composeTestRule.onNodeWithTag("exo_quick_controls").assertIsDisplayed()
        composeTestRule.onNodeWithTag("video_rewind_10s_btn").assertIsDisplayed()
        composeTestRule.onNodeWithTag("video_play_pause_btn").assertIsDisplayed()
        composeTestRule.onNodeWithTag("video_forward_10s_btn").assertIsDisplayed()

        composeTestRule.onNodeWithTag("enter_fullscreen_button").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("video_fullscreen_container").assertIsDisplayed()
        composeTestRule.onNodeWithTag("exit_fullscreen_button").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("video_player_screen").assertIsDisplayed()
    }

    @Test
    fun `VideoPlayerScreen surfaces clear HTTP cleartext error card for insecure http stream URL`() {
        val insecureLesson = Lesson(
            id = "les_http_bad",
            subjectId = "math",
            subjectName = "الرياضيات",
            title = "درس تجريبي",
            videoUrl = "http://insecure.example.com/lesson.mp4",
            videoSourceType = VideoSourceType.MP4.name
        )

        composeTestRule.setContent {
            MidadTheme {
                VideoPlayerScreen(
                    lesson = insecureLesson,
                    relatedMaterials = emptyList(),
                    initialProgress = null,
                    isFavorite = false,
                    onBack = {},
                    onSaveProgress = { _, _, _ -> },
                    onToggleFavorite = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {}
                )
            }
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("exo_player_error_box").assertIsDisplayed()
        composeTestRule.onNodeWithText("رمز التشخيص: CLEARTEXT_HTTP_BLOCKED").assertIsDisplayed()
    }

    @OptIn(UnstableApi::class)
    @Test
    fun `B2 worker file routes detect MP4, attach Bearer token with Range, and map HTTP 401`() {
        assertEquals(
            VideoSourceType.MP4,
            com.example.util.UrlUtils.detectVideoSourceType(
                "https://midad-worker.example.workers.dev/b2/files/videos/lesson.mp4"
            )
        )

        val payload = ByteArray(64) { idx -> (idx + 1).toByte() }
        val server = MockWebServer()
        server.start()
        try {
            val workerBase = server.url("").toString().removeSuffix("/")
            server.enqueue(
                MockResponse()
                    .setResponseCode(206)
                    .addHeader("Content-Type", "video/mp4")
                    .addHeader("Accept-Ranges", "bytes")
                    .addHeader("Content-Range", "bytes 0-15/${payload.size}")
                    .setBody(Buffer().write(payload, 0, 16))
            )

            val client = VideoPlaybackSupport.createVideoOkHttpClient(
                r2WorkerBaseUrl = workerBase,
                authTokenProvider = { "firebase-b2-token-456" }
            )
            val dataSource = OkHttpDataSource.Factory(client).createDataSource()
            dataSource.open(
                DataSpec.Builder()
                    .setUri(server.url("/b2/files/videos/lesson.mp4").toString())
                    .setPosition(0L)
                    .setLength(16L)
                    .build()
            )
            val buf = ByteArray(16)
            var total = 0
            while (total < buf.size) {
                val read = dataSource.read(buf, total, buf.size - total)
                if (read <= 0) break
                total += read
            }
            dataSource.close()

            assertEquals(16, total)
            assertArrayEquals(payload.copyOfRange(0, 16), buf)
            val req = server.takeRequest()
            assertEquals("bytes=0-15", req.getHeader("Range"))
            assertEquals("Bearer firebase-b2-token-456", req.getHeader("Authorization"))
        } finally {
            server.shutdown()
        }

        val dataSpec = DataSpec.Builder().setUri("https://cdn.midad.edu/b2/files/lesson.mp4").build()
        val http401 = HttpDataSource.InvalidResponseCodeException(
            401,
            "Unauthorized",
            IOException("401"),
            emptyMap(),
            dataSpec,
            ByteArray(0)
        )
        val diag401 = VideoPlaybackSupport.mapPlaybackExceptionToArabic(
            PlaybackException("Unauthorized", http401, PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS),
            "https://cdn.midad.edu/b2/files/lesson.mp4"
        )
        assertEquals(VideoErrorCause.UNAUTHORIZED, diag401.cause)
        assertEquals("HTTP_401", diag401.technicalCode)
    }

    @Test
    fun `PdfCacheManager resolveSignedUrlForWorkerFile requests b2 signed-url with Bearer header and rejects 403 without leaking token`() {
        val server = MockWebServer()
        server.start()
        try {
            val workerBase = server.url("").toString().removeSuffix("/")
            val targetB2Url = "$workerBase/b2/files/materials/notes_01.pdf"
            val expectedPresignedUrl =
                "https://s3.us-east-005.backblazeb2.com/midad-edu-media-2026/materials/notes_01.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef"

            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .addHeader("Content-Type", "application/json")
                    .setBody("""{"ok":true,"signedUrl":"$expectedPresignedUrl"}""")
            )
            server.enqueue(
                MockResponse()
                    .setResponseCode(403)
                    .addHeader("Content-Type", "application/json")
                    .setBody("""{"error":"الحساب محظور من تنزيل الملفات"}""")
            )

            val okResult = kotlinx.coroutines.runBlocking {
                com.example.util.PdfCacheManager.resolveSignedUrlForWorkerFile(
                    rawUrl = targetB2Url,
                    r2WorkerBaseUrl = workerBase,
                    authTokenProvider = { "student-jwt-token" },
                    download = true,
                    expiresInSec = 300
                )
            }
            assertTrue(okResult.isSuccess)
            assertEquals(expectedPresignedUrl, okResult.getOrNull())

            val firstReq = server.takeRequest()
            assertEquals("GET", firstReq.method)
            assertTrue(firstReq.path.orEmpty().startsWith("/b2/signed-url?"))
            assertTrue(firstReq.path.orEmpty().contains("download=1"))
            assertEquals("Bearer student-jwt-token", firstReq.getHeader("Authorization"))

            val deniedResult = kotlinx.coroutines.runBlocking {
                com.example.util.PdfCacheManager.resolveSignedUrlForWorkerFile(
                    rawUrl = targetB2Url,
                    r2WorkerBaseUrl = workerBase,
                    authTokenProvider = { "banned-jwt-token" }
                )
            }
            assertTrue(deniedResult.isFailure)
            assertTrue(deniedResult.exceptionOrNull()?.message.orEmpty().contains("محظور"))
        } finally {
            server.shutdown()
        }
    }
}
