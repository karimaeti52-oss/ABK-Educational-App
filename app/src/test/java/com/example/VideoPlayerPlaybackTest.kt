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
import com.example.ui.theme.MidadTheme
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
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

        val ytScript = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(-3, "script_onerror")
        assertEquals(VideoErrorCause.YOUTUBE_SCRIPT_BLOCKED, ytScript.cause)
        assertTrue(ytScript.technicalCode.startsWith("YT_SCRIPT"))
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
}
