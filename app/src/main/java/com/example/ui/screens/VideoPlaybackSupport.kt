package com.example.ui.screens

import android.content.Context
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.ParserException
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.mediacodec.MediaCodecRenderer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.example.BuildConfig
import com.example.util.UrlUtils
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.Locale
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import javax.net.ssl.SSLHandshakeException

enum class VideoErrorCause {
    EMPTY_URL,
    INSECURE_HTTP,
    INVALID_URL,
    UNAUTHORIZED,
    NOT_FOUND,
    RANGE_NOT_SATISFIABLE,
    SERVER_ERROR,
    NETWORK_TIMEOUT,
    SSL_ERROR,
    UNSUPPORTED_FORMAT,
    DECODER_ERROR,
    YOUTUBE_PRIVATE,
    YOUTUBE_EMBED_RESTRICTED,
    YOUTUBE_SCRIPT_BLOCKED,
    YOUTUBE_INIT_TIMEOUT,
    UNKNOWN
}

data class VideoErrorDiagnosis(
    val cause: VideoErrorCause,
    val userMessageAr: String,
    val technicalCode: String,
    val canRetry: Boolean = true
)

object VideoPlaybackSupport {

    private const val TAG = "MidadVideoPlayer"

    fun createVideoOkHttpClient(
        r2WorkerBaseUrl: String = "",
        authTokenProvider: (suspend () -> String?)? = null
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(35, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val original = chain.request()
                val builder = original.newBuilder()
                if (original.header("User-Agent").isNullOrBlank()) {
                    builder.header("User-Agent", "Midad-Android/${BuildConfig.VERSION_NAME}")
                }
                val targetUrl = original.url.toString()
                if (
                    authTokenProvider != null &&
                    original.header("Authorization").isNullOrBlank() &&
                    UrlUtils.isSameOriginAsBaseUrl(targetUrl, r2WorkerBaseUrl)
                ) {
                    val token = runCatching { runBlocking { authTokenProvider() } }.getOrNull()
                    if (!token.isNullOrBlank()) {
                        builder.header("Authorization", "Bearer $token")
                    }
                }
                chain.proceed(builder.build())
            }
            .build()
    }

    @OptIn(UnstableApi::class)
    fun buildExoPlayer(
        context: Context,
        r2WorkerBaseUrl: String = "",
        authTokenProvider: (suspend () -> String?)? = null
    ): ExoPlayer {
        val okHttpClient = createVideoOkHttpClient(
            r2WorkerBaseUrl = r2WorkerBaseUrl,
            authTokenProvider = authTokenProvider
        )
        val httpDataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
            .setUserAgent("Midad-Android/${BuildConfig.VERSION_NAME}")
        val dataSourceFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)
        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        return ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaSourceFactory)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .build()
    }

    fun validateStreamUrl(rawUrl: String?): VideoErrorDiagnosis? {
        val trimmed = rawUrl?.trim().orEmpty()
        if (trimmed.isEmpty()) {
            return VideoErrorDiagnosis(
                cause = VideoErrorCause.EMPTY_URL,
                userMessageAr = "رابط الفيديو غير متوفر لهذا الدرس حالياً.",
                technicalCode = "URL_EMPTY",
                canRetry = false
            )
        }
        val uri = runCatching { java.net.URI(trimmed) }.getOrNull()
        val scheme = uri?.scheme?.lowercase(Locale.ROOT).orEmpty()
        val host = uri?.host.orEmpty()
        if (uri == null || host.isBlank()) {
            return VideoErrorDiagnosis(
                cause = VideoErrorCause.INVALID_URL,
                userMessageAr = "صيغة رابط الفيديو غير صالحة.",
                technicalCode = "URL_MALFORMED",
                canRetry = false
            )
        }
        if (scheme == "http") {
            return VideoErrorDiagnosis(
                cause = VideoErrorCause.INSECURE_HTTP,
                userMessageAr = "يستخدم رابط الفيديو بروتوكول HTTP غير الآمن، بينما يشترط التطبيق رابط HTTPS مشفر.",
                technicalCode = "CLEARTEXT_HTTP_BLOCKED",
                canRetry = false
            )
        }
        if (scheme != "https" && scheme != "content" && scheme != "file") {
            return VideoErrorDiagnosis(
                cause = VideoErrorCause.INVALID_URL,
                userMessageAr = "بروتوكول رابط الفيديو غير مدعوم.",
                technicalCode = "UNSUPPORTED_SCHEME_${scheme.uppercase(Locale.ROOT)}",
                canRetry = false
            )
        }
        return null
    }

    @OptIn(UnstableApi::class)
    fun mapPlaybackExceptionToArabic(
        error: PlaybackException,
        sourceUrl: String
    ): VideoErrorDiagnosis {
        val causeChain = generateSequence<Throwable>(error) { it.cause }.toList()
        val safeUrl = UrlUtils.sanitizeUrlForLog(sourceUrl)

        val invalidResp = causeChain.filterIsInstance<HttpDataSource.InvalidResponseCodeException>().firstOrNull()
        if (invalidResp != null) {
            val code = invalidResp.responseCode
            val contentType = invalidResp.headerFields["Content-Type"]?.firstOrNull().orEmpty()
            Log.w(TAG, "Video HTTP error code=$code url=$safeUrl contentType=$contentType")
            return when (code) {
                401, 403 -> VideoErrorDiagnosis(
                    cause = VideoErrorCause.UNAUTHORIZED,
                    userMessageAr = "لا تملك صلاحية الوصول إلى هذا الفيديو أو انتهت الجلسة (HTTP $code). حاول تحديث الصفحة أو إعادة تسجيل الدخول.",
                    technicalCode = "HTTP_$code"
                )
                404, 410 -> VideoErrorDiagnosis(
                    cause = VideoErrorCause.NOT_FOUND,
                    userMessageAr = "ملف الفيديو غير موجود على الخادم أو تم نقله (HTTP $code).",
                    technicalCode = "HTTP_$code"
                )
                416 -> VideoErrorDiagnosis(
                    cause = VideoErrorCause.RANGE_NOT_SATISFIABLE,
                    userMessageAr = "تعذر طلب هذا الجزء من الفيديو (HTTP 416 Range). أعد التشغيل من البداية.",
                    technicalCode = "HTTP_416"
                )
                in 500..599 -> VideoErrorDiagnosis(
                    cause = VideoErrorCause.SERVER_ERROR,
                    userMessageAr = "يواجه خادم استضافة الفيديو عطلاً مؤقتاً (HTTP $code). أعد المحاولة بعد قليل.",
                    technicalCode = "HTTP_$code"
                )
                else -> VideoErrorDiagnosis(
                    cause = VideoErrorCause.UNKNOWN,
                    userMessageAr = "استجاب خادم الفيديو برمز خطأ غير متوقع (HTTP $code).",
                    technicalCode = "HTTP_$code"
                )
            }
        }

        if (causeChain.any { it is HttpDataSource.CleartextNotPermittedException } ||
            sourceUrl.trim().startsWith("http://", ignoreCase = true)
        ) {
            Log.w(TAG, "Cleartext HTTP blocked url=$safeUrl")
            return VideoErrorDiagnosis(
                cause = VideoErrorCause.INSECURE_HTTP,
                userMessageAr = "حُظر تشغيل الفيديو لأن الرابط يستخدم HTTP غير الآمن بدلاً من HTTPS.",
                technicalCode = "CLEARTEXT_HTTP_BLOCKED",
                canRetry = false
            )
        }

        if (causeChain.any { it is SSLHandshakeException || it is SSLException } ||
            error.errorCode == PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED
        ) {
            Log.w(TAG, "TLS/SSL error url=$safeUrl errorCode=${error.errorCodeName}")
            return VideoErrorDiagnosis(
                cause = VideoErrorCause.SSL_ERROR,
                userMessageAr = "تعذر التحقق من شهادة الأمان HTTPS لخادم الفيديو.",
                technicalCode = "TLS_${error.errorCodeName}"
            )
        }

        if (causeChain.any { it is UnknownHostException || it is SocketTimeoutException || it is ConnectException } ||
            error.errorCode in setOf(
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                PlaybackException.ERROR_CODE_TIMEOUT
            )
        ) {
            Log.w(TAG, "Network timeout/connection error url=$safeUrl errorCode=${error.errorCodeName}")
            return VideoErrorDiagnosis(
                cause = VideoErrorCause.NETWORK_TIMEOUT,
                userMessageAr = "تعذر الوصول إلى خادم الفيديو أو انتهت مهلة الاتصال. تحقق من الإنترنت ثم أعد المحاولة.",
                technicalCode = "NET_${error.errorCodeName}"
            )
        }

        val parsingCodes = setOf(
            PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
            PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
            PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED,
            PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED
        )
        val decoderCodes = setOf(
            PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
            PlaybackException.ERROR_CODE_DECODING_FAILED,
            PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
        )
        val parserEx = causeChain.filterIsInstance<ParserException>().firstOrNull()
        val codecEx = causeChain.filterIsInstance<MediaCodecRenderer.DecoderInitializationException>().firstOrNull()
        val isParsingError = parserEx != null || error.errorCode in parsingCodes
        val isDecoderError = codecEx != null || error.errorCode in decoderCodes
        if (isParsingError || isDecoderError) {
            Log.w(TAG, "Codec/container error url=$safeUrl errorCode=${error.errorCodeName}")
            return VideoErrorDiagnosis(
                cause = if (isParsingError) VideoErrorCause.UNSUPPORTED_FORMAT else VideoErrorCause.DECODER_ERROR,
                userMessageAr = "تنسيق أو ترميز الفيديو غير مدعوم على هذا الجهاز (يُوصى بملف MP4 بترميز H.264 و AAC).",
                technicalCode = "MEDIA_${error.errorCodeName}"
            )
        }

        Log.w(TAG, "Playback error url=$safeUrl errorCode=${error.errorCodeName}")
        return VideoErrorDiagnosis(
            cause = VideoErrorCause.UNKNOWN,
            userMessageAr = "تعذر تشغيل الفيديو داخل التطبيق. تحقق من صلاحية الرابط ثم أعد المحاولة.",
            technicalCode = "EXO_${error.errorCodeName}"
        )
    }

    fun mapYouTubeErrorToDiagnosis(code: Int, detail: String = ""): VideoErrorDiagnosis {
        val suffix = detail.take(24).replace(Regex("[^a-zA-Z0-9_-]"), "")
        return when (code) {
            100 -> VideoErrorDiagnosis(
                cause = VideoErrorCause.YOUTUBE_PRIVATE,
                userMessageAr = "هذا الفيديو غير متاح أو مضبوط كفيديو خاص من قِبل صاحبه.",
                technicalCode = "YT_100"
            )
            101, 150 -> VideoErrorDiagnosis(
                cause = VideoErrorCause.YOUTUBE_EMBED_RESTRICTED,
                userMessageAr = "مالك الفيديو منع تشغيله بالتضمين خارج تطبيق YouTube.",
                technicalCode = "YT_$code"
            )
            153 -> VideoErrorDiagnosis(
                cause = VideoErrorCause.YOUTUBE_EMBED_RESTRICTED,
                userMessageAr = "رفض خادم التضمين تشغيل الفيديو داخل هذا المشغل حالياً.",
                technicalCode = "YT_153"
            )
            -3 -> VideoErrorDiagnosis(
                cause = VideoErrorCause.YOUTUBE_SCRIPT_BLOCKED,
                userMessageAr = "تعذر تحميل مكتبة مشغل YouTube (تحقق من الاتصال أو مانع الإعلانات/الشبكة).",
                technicalCode = if (suffix.isNotBlank()) "YT_SCRIPT_$suffix" else "YT_SCRIPT_ERR"
            )
            -2 -> VideoErrorDiagnosis(
                cause = VideoErrorCause.YOUTUBE_INIT_TIMEOUT,
                userMessageAr = "انتهت مهلة تحميل مشغل YouTube المضمّن. تحقق من سرعة الاتصال ثم أعد المحاولة.",
                technicalCode = "YT_TIMEOUT"
            )
            in 400..599 -> VideoErrorDiagnosis(
                cause = VideoErrorCause.SERVER_ERROR,
                userMessageAr = "فشل تحميل صفحة التضمين برمز (HTTP $code). أعد المحاولة بعد قليل.",
                technicalCode = "YT_HTTP_$code"
            )
            else -> VideoErrorDiagnosis(
                cause = VideoErrorCause.UNKNOWN,
                userMessageAr = "تعذر تشغيل مشغل YouTube المضمّن داخل التطبيق.",
                technicalCode = if (suffix.isNotBlank()) "YT_${code}_$suffix" else "YT_$code"
            )
        }
    }
}
