package com.example.ui.screens

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ActivityInfo
import android.net.http.SslError
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.movableContentOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import com.example.data.model.Lesson
import com.example.data.model.LessonProgress
import com.example.data.model.StudyMaterial
import com.example.data.model.VideoSourceType
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.InfoPill
import com.example.ui.components.MaterialCard
import com.example.ui.theme.AbkSuccess
import com.example.util.PdfCacheManager
import com.example.util.UrlUtils
import kotlinx.coroutines.delay

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoPlayerScreen(
    lesson: Lesson?,
    relatedMaterials: List<StudyMaterial>,
    initialProgress: LessonProgress?,
    isFavorite: Boolean,
    r2WorkerBaseUrl: String = "",
    authTokenProvider: (suspend () -> String?)? = null,
    onBack: () -> Unit,
    onSaveProgress: (positionMs: Long, durationMs: Long, completed: Boolean) -> Unit,
    onToggleFavorite: () -> Unit,
    onOpenMaterial: (StudyMaterial) -> Unit,
    onDownloadMaterial: (StudyMaterial) -> Unit,
    onShareMaterial: (StudyMaterial) -> Unit
) {
    val context = LocalContext.current
    val activity = context as? Activity
    var isFullscreen by remember { mutableStateOf(false) }
    var webCustomView by remember { mutableStateOf<View?>(null) }
    var webCustomCallback by remember { mutableStateOf<WebChromeClient.CustomViewCallback?>(null) }

    var latestPositionMs by remember(lesson?.id) {
        mutableLongStateOf(initialProgress?.lastPositionMs ?: 0L)
    }
    var latestDurationMs by remember(lesson?.id) {
        mutableLongStateOf(initialProgress?.durationMs ?: 0L)
    }
    var markedCompleted by remember(lesson?.id) {
        mutableStateOf(initialProgress?.completed == true)
    }
    var exoControllerActions by remember(lesson?.id) {
        mutableStateOf<ExoQuickControls?>(null)
    }

    val activeFullscreen = isFullscreen || webCustomView != null

    DisposableEffect(activeFullscreen) {
        val window = activity?.window
        if (activity != null && window != null) {
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            if (activeFullscreen) {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
        }
        onDispose {
            if (activity != null && window != null) {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                WindowCompat.getInsetsController(window, window.decorView)
                    .show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    BackHandler {
        when {
            webCustomView != null -> {
                webCustomCallback?.onCustomViewHidden()
                webCustomView = null
                webCustomCallback = null
                isFullscreen = false
            }
            isFullscreen -> {
                isFullscreen = false
            }
            else -> {
                if (lesson != null) {
                    onSaveProgress(latestPositionMs, latestDurationMs, markedCompleted)
                }
                onBack()
            }
        }
    }

    if (lesson == null) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("مشغل الدروس") },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                        }
                    }
                )
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                AbkEmptyState(title = "الدرس غير متوفر", subtitle = "تعذر العثور على بيانات الدرس المطلوب.")
            }
        }
        return
    }

    val effectiveType = remember(lesson.videoUrl, lesson.videoSourceType) {
        UrlUtils.detectVideoSourceType(lesson.videoUrl, lesson.parsedVideoType())
    }

    val sharedPlayerContent = remember(lesson.id, lesson.videoUrl, effectiveType, r2WorkerBaseUrl) {
        movableContentOf {
            InAppPlayerContent(
                lesson = lesson,
                sourceType = effectiveType,
                startPositionMs = latestPositionMs,
                r2WorkerBaseUrl = r2WorkerBaseUrl,
                authTokenProvider = authTokenProvider,
                onBindQuickControls = { controls -> exoControllerActions = controls },
                onPositionUpdate = { pos, dur, done ->
                    latestPositionMs = pos
                    latestDurationMs = dur
                    if (done) markedCompleted = true
                },
                onPersistProgress = { pos, dur, done ->
                    onSaveProgress(pos, dur, done || markedCompleted)
                },
                onShowCustomFullscreen = { view, callback ->
                    webCustomView = view
                    webCustomCallback = callback
                },
                onHideCustomFullscreen = {
                    webCustomView = null
                    webCustomCallback = null
                }
            )
        }
    }

    if (webCustomView != null) {
        val currentCustomView = webCustomView!!
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .testTag("video_fullscreen_container")
        ) {
            AndroidView(
                factory = { ctx ->
                    FrameLayout(ctx).apply {
                        (currentCustomView.parent as? ViewGroup)?.removeView(currentCustomView)
                        addView(
                            currentCustomView,
                            FrameLayout.LayoutParams(
                                FrameLayout.LayoutParams.MATCH_PARENT,
                                FrameLayout.LayoutParams.MATCH_PARENT
                            )
                        )
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
            IconButton(
                onClick = {
                    webCustomCallback?.onCustomViewHidden()
                    webCustomView = null
                    webCustomCallback = null
                },
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .size(48.dp)
                    .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(10.dp))
                    .testTag("exit_fullscreen_button")
            ) {
                Icon(Icons.Filled.FullscreenExit, contentDescription = "العودة إلى مداد التعليمية", tint = Color.White)
            }
        }
        return
    }

    if (isFullscreen) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .testTag("video_fullscreen_container")
        ) {
            sharedPlayerContent()
            IconButton(
                onClick = { isFullscreen = false },
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .size(48.dp)
                    .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(10.dp))
                    .testTag("exit_fullscreen_button")
            ) {
                Icon(Icons.Filled.FullscreenExit, contentDescription = "إنهاء ملء الشاشة", tint = Color.White)
            }
        }
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(lesson.subjectName, style = MaterialTheme.typography.titleLarge) },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            onSaveProgress(latestPositionMs, latestDurationMs, markedCompleted)
                            onBack()
                        },
                        modifier = Modifier.testTag("player_back_btn")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                actions = {
                    IconButton(onClick = onToggleFavorite, modifier = Modifier.testTag("player_fav_btn")) {
                        Icon(
                            imageVector = if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = "المفضلة",
                            tint = if (isFavorite) Color(0xFFE11D48) else MaterialTheme.colorScheme.onSurface
                        )
                    }
                    IconButton(
                        onClick = { isFullscreen = true },
                        modifier = Modifier.testTag("enter_fullscreen_button")
                    ) {
                        Icon(Icons.Filled.Fullscreen, contentDescription = "ملء الشاشة")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .testTag("video_player_screen"),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .background(Color.Black)
                ) {
                    sharedPlayerContent()
                }
            }

            if (effectiveType == VideoSourceType.MP4 && exoControllerActions != null) {
                val controls = exoControllerActions!!
                item {
                    ExoQuickControlBar(
                        controls = controls,
                        positionMs = latestPositionMs,
                        durationMs = latestDurationMs,
                        onFullscreen = { isFullscreen = true }
                    )
                }
            }

            item {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InfoPill(text = lesson.subjectName)
                        if (lesson.unitTitle.isNotBlank()) {
                            InfoPill(text = lesson.unitTitle)
                        }
                        if (markedCompleted) {
                            InfoPill(
                                text = "تمت المشاهدة",
                                containerColor = Color(0xFFD1FAE5),
                                contentColor = AbkSuccess
                            )
                        }
                    }
                    Text(
                        text = lesson.title,
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                    if (!lesson.teacherName.isNullOrBlank()) {
                        Text(
                            text = "الأستاذ: ${lesson.teacherName}",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                    if (lesson.description.isNotBlank()) {
                        Text(
                            text = lesson.description,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = {
                                markedCompleted = true
                                onSaveProgress(latestPositionMs, latestDurationMs, true)
                            },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("mark_lesson_completed_btn"),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (markedCompleted) AbkSuccess else MaterialTheme.colorScheme.primary
                            )
                        ) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(if (markedCompleted) "مكتمل" else "تمت مشاهدة الدرس")
                        }

                        OutlinedButton(
                            onClick = { isFullscreen = true },
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Filled.Fullscreen, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("ملء الشاشة")
                        }
                    }
                }
            }

            if (relatedMaterials.isNotEmpty()) {
                item {
                    Text(
                        text = "ملفات ونوطات مرتبطة بالمادة",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    )
                }
                items(relatedMaterials, key = { it.id }) { mat ->
                    Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                        MaterialCard(
                            material = mat,
                            isFavorite = false,
                            isCachedOffline = PdfCacheManager.isPdfCachedOffline(context, mat.id),
                            onOpenPdf = { onOpenMaterial(mat) },
                            onDownloadClick = { onDownloadMaterial(mat) },
                            onShareClick = { onShareMaterial(mat) },
                            onToggleFavorite = {}
                        )
                    }
                }
            }
        }
    }
}

private data class ExoQuickControls(
    val isPlaying: Boolean,
    val onTogglePlayPause: () -> Unit,
    val onRewind10s: () -> Unit,
    val onForward10s: () -> Unit
)

@Composable
private fun ExoQuickControlBar(
    controls: ExoQuickControls,
    positionMs: Long,
    durationMs: Long,
    onFullscreen: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .testTag("exo_quick_controls"),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = controls.onRewind10s,
                    modifier = Modifier.size(48.dp).testTag("video_rewind_10s_btn")
                ) {
                    Icon(Icons.Filled.FastRewind, contentDescription = "تأخير 10 ثوانٍ")
                }
                IconButton(
                    onClick = controls.onTogglePlayPause,
                    modifier = Modifier.size(48.dp).testTag("video_play_pause_btn")
                ) {
                    Icon(
                        imageVector = if (controls.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (controls.isPlaying) "إيقاف مؤقت" else "تشغيل"
                    )
                }
                IconButton(
                    onClick = controls.onForward10s,
                    modifier = Modifier.size(48.dp).testTag("video_forward_10s_btn")
                ) {
                    Icon(Icons.Filled.FastForward, contentDescription = "تقديم 10 ثوانٍ")
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (durationMs > 0L) {
                        "${UrlUtils.formatDurationMs(positionMs)} / ${UrlUtils.formatDurationMs(durationMs)}"
                    } else {
                        UrlUtils.formatDurationMs(positionMs)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                IconButton(
                    onClick = onFullscreen,
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(Icons.Filled.Fullscreen, contentDescription = "ملء الشاشة")
                }
            }
        }
    }
}

@Composable
private fun InAppPlayerContent(
    lesson: Lesson,
    sourceType: VideoSourceType,
    startPositionMs: Long,
    r2WorkerBaseUrl: String,
    authTokenProvider: (suspend () -> String?)?,
    onBindQuickControls: (ExoQuickControls?) -> Unit,
    onPositionUpdate: (posMs: Long, durMs: Long, completed: Boolean) -> Unit,
    onPersistProgress: (posMs: Long, durMs: Long, completed: Boolean) -> Unit,
    onShowCustomFullscreen: (View, WebChromeClient.CustomViewCallback) -> Unit,
    onHideCustomFullscreen: () -> Unit
) {
    when (sourceType) {
        VideoSourceType.MP4 -> ExoVideoPlayerView(
            videoUrl = lesson.videoUrl,
            startPositionMs = startPositionMs,
            r2WorkerBaseUrl = r2WorkerBaseUrl,
            authTokenProvider = authTokenProvider,
            onBindQuickControls = onBindQuickControls,
            onPositionUpdate = onPositionUpdate,
            onPersistProgress = onPersistProgress
        )
        VideoSourceType.YOUTUBE -> {
            DisposableEffect(Unit) {
                onBindQuickControls(null)
                onDispose {}
            }
            YouTubeInAppPlayerView(
                videoUrl = lesson.videoUrl,
                startPositionMs = startPositionMs,
                onPositionUpdate = onPositionUpdate,
                onPersistProgress = onPersistProgress,
                onShowCustomFullscreen = onShowCustomFullscreen,
                onHideCustomFullscreen = onHideCustomFullscreen
            )
        }
        VideoSourceType.EXTERNAL -> {
            DisposableEffect(Unit) {
                onBindQuickControls(null)
                onDispose {}
            }
            ExternalVideoWebView(
                videoUrl = lesson.videoUrl,
                onMarkStarted = {
                    onPositionUpdate(1000L, 1000L, false)
                    onPersistProgress(1000L, 1000L, false)
                }
            )
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun ExoVideoPlayerView(
    videoUrl: String,
    startPositionMs: Long,
    r2WorkerBaseUrl: String,
    authTokenProvider: (suspend () -> String?)?,
    onBindQuickControls: (ExoQuickControls?) -> Unit,
    onPositionUpdate: (Long, Long, Boolean) -> Unit,
    onPersistProgress: (Long, Long, Boolean) -> Unit
) {
    val context = LocalContext.current
    val initialValidationError = remember(videoUrl) {
        VideoPlaybackSupport.validateStreamUrl(videoUrl)
    }

    if (initialValidationError != null) {
        VideoPlaybackErrorBox(
            diagnosis = initialValidationError,
            boxTag = "exo_player_error_box",
            retryTag = "exo_retry_btn",
            onRetry = {}
        )
        return
    }

    var retryNonce by remember(videoUrl) { mutableIntStateOf(0) }
    var resumeOnRetryMs by remember(videoUrl) { mutableLongStateOf(startPositionMs) }
    var playbackError by remember(videoUrl, retryNonce) { mutableStateOf<VideoErrorDiagnosis?>(null) }
    var isBuffering by remember(videoUrl, retryNonce) { mutableStateOf(true) }
    var isPlayingState by remember(videoUrl, retryNonce) { mutableStateOf(false) }

    val player = remember(videoUrl, retryNonce, r2WorkerBaseUrl) {
        VideoPlaybackSupport.buildExoPlayer(
            context = context,
            r2WorkerBaseUrl = r2WorkerBaseUrl,
            authTokenProvider = authTokenProvider
        ).apply {
            setMediaItem(MediaItem.fromUri(videoUrl.trim()))
            if (resumeOnRetryMs > 2000L) {
                seekTo(resumeOnRetryMs)
            }
            prepare()
            playWhenReady = true
        }
    }

    LaunchedEffect(player, isPlayingState) {
        onBindQuickControls(
            ExoQuickControls(
                isPlaying = isPlayingState,
                onTogglePlayPause = {
                    if (player.isPlaying) player.pause() else player.play()
                },
                onRewind10s = {
                    player.seekTo((player.currentPosition - 10_000L).coerceAtLeast(0L))
                },
                onForward10s = {
                    val dur = player.duration.takeIf { it > 0L } ?: Long.MAX_VALUE
                    player.seekTo((player.currentPosition + 10_000L).coerceAtMost(dur))
                }
            )
        )
    }

    var lastPersistedPosMs by remember(videoUrl) { mutableLongStateOf(startPositionMs) }
    var lastPersistTimeMs by remember(videoUrl) { mutableLongStateOf(0L) }
    var lastPersistedDone by remember(videoUrl) { mutableStateOf(false) }

    LaunchedEffect(player) {
        while (true) {
            delay(1500L)
            val pos = player.currentPosition.coerceAtLeast(0L)
            val dur = player.duration.coerceAtLeast(0L)
            if (pos > 0L) resumeOnRetryMs = pos
            val isCompleted = dur > 0L && pos >= (dur * 0.9f).toLong()
            onPositionUpdate(pos, dur, isCompleted)
            if (player.isPlaying) {
                val now = android.os.SystemClock.elapsedRealtime()
                val elapsed = now - lastPersistTimeMs
                val seekJumped = kotlin.math.abs(pos - lastPersistedPosMs) >= 15_000L
                val newlyCompleted = isCompleted && !lastPersistedDone
                if (elapsed >= 20_000L || seekJumped || newlyCompleted) {
                    lastPersistedPosMs = pos
                    lastPersistTimeMs = now
                    if (isCompleted) lastPersistedDone = true
                    onPersistProgress(pos, dur, isCompleted)
                }
            }
        }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                isBuffering = playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_IDLE
                if (playbackState == Player.STATE_READY) {
                    playbackError = null
                    isBuffering = false
                } else if (playbackState == Player.STATE_ENDED) {
                    isBuffering = false
                    val dur = player.duration.coerceAtLeast(0L)
                    lastPersistedPosMs = dur
                    lastPersistTimeMs = android.os.SystemClock.elapsedRealtime()
                    lastPersistedDone = true
                    onPositionUpdate(dur, dur, true)
                    onPersistProgress(dur, dur, true)
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                isPlayingState = isPlaying
            }

            override fun onPlayerError(error: PlaybackException) {
                isBuffering = false
                isPlayingState = false
                playbackError = VideoPlaybackSupport.mapPlaybackExceptionToArabic(error, videoUrl)
            }
        }
        player.addListener(listener)
        onDispose {
            val pos = player.currentPosition.coerceAtLeast(0L)
            val dur = player.duration.coerceAtLeast(0L)
            if (pos > 0L) resumeOnRetryMs = pos
            val isCompleted = dur > 0L && pos >= (dur * 0.9f).toLong()
            if (pos > 0L || isCompleted) {
                onPersistProgress(pos, dur, isCompleted)
            }
            onBindQuickControls(null)
            player.removeListener(listener)
            player.release()
        }
    }

    val currentError = playbackError
    if (currentError != null) {
        VideoPlaybackErrorBox(
            diagnosis = currentError,
            boxTag = "exo_player_error_box",
            retryTag = "exo_retry_btn",
            onRetry = {
                playbackError = null
                isBuffering = true
                retryNonce++
            }
        )
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = true
                    keepScreenOn = true
                    setShowRewindButton(true)
                    setShowFastForwardButton(true)
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                }
            },
            update = { view ->
                if (view.player !== player) {
                    view.player = player
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .testTag("exo_player_view")
        )
        if (isBuffering) {
            CircularProgressIndicator(
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(36.dp)
                    .testTag("video_loading_indicator")
            )
        }
    }
}

@Composable
internal fun VideoPlaybackErrorBox(
    diagnosis: VideoErrorDiagnosis,
    boxTag: String,
    retryTag: String,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
            .padding(16.dp)
            .testTag(boxTag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Filled.ErrorOutline,
            contentDescription = null,
            tint = Color(0xFFFBBF24),
            modifier = Modifier.size(36.dp)
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = diagnosis.userMessageAr,
            color = Color.White,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "رمز التشخيص: ${diagnosis.technicalCode}",
            color = Color(0xFF94A3B8),
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
            textAlign = TextAlign.Center
        )
        if (diagnosis.canRetry) {
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = onRetry,
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.testTag(retryTag)
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("إعادة المحاولة")
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun YouTubeInAppPlayerView(
    videoUrl: String,
    startPositionMs: Long,
    onPositionUpdate: (Long, Long, Boolean) -> Unit,
    onPersistProgress: (Long, Long, Boolean) -> Unit,
    onShowCustomFullscreen: (View, WebChromeClient.CustomViewCallback) -> Unit,
    onHideCustomFullscreen: () -> Unit
) {
    val videoId = remember(videoUrl) { UrlUtils.extractYouTubeVideoId(videoUrl) }
    if (videoId == null) {
        ExternalVideoWebView(videoUrl = videoUrl, onMarkStarted = {})
        return
    }

    val startSeconds = (startPositionMs / 1000L).coerceAtLeast(0L)
    var latestPos by remember { mutableLongStateOf(startPositionMs) }
    var latestDur by remember { mutableLongStateOf(0L) }
    var latestDone by remember { mutableStateOf(false) }
    var lastSavedPos by remember(videoId) { mutableLongStateOf(startPositionMs) }
    var lastSaveElapsedMs by remember(videoId) { mutableLongStateOf(0L) }
    var lastSavedDone by remember(videoId) { mutableStateOf(false) }
    var playerDiagnosis by remember(videoId) { mutableStateOf<VideoErrorDiagnosis?>(null) }
    var reloadNonce by remember(videoId) { mutableIntStateOf(0) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    val activeDiagnosis = playerDiagnosis
    if (activeDiagnosis != null) {
        VideoPlaybackErrorBox(
            diagnosis = activeDiagnosis,
            boxTag = "youtube_embed_error_box",
            retryTag = "youtube_retry_btn",
            onRetry = {
                playerDiagnosis = null
                reloadNonce++
            }
        )
        return
    }

    val html = remember(videoId, startSeconds, reloadNonce) {
        """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0F172A; overflow: hidden; }
            #player { width: 100%; height: 100%; }
          </style>
        </head>
        <body>
          <div id="player"></div>
          <script>
            var player;
            var settled = false;
            var initTimer = setTimeout(function() {
              if (!settled && window.AbkBridge && window.AbkBridge.onPlayerError) {
                window.AbkBridge.onPlayerError(-2, 'iframe_timeout');
              }
            }, 22000);
            function markSettled() {
              if (!settled) {
                settled = true;
                clearTimeout(initTimer);
              }
            }
            function onYouTubeIframeAPIReady() {
              player = new YT.Player('player', {
                videoId: '$videoId',
                playerVars: {
                  'playsinline': 1,
                  'autoplay': 0,
                  'controls': 1,
                  'fs': 1,
                  'rel': 0,
                  'modestbranding': 1,
                  'origin': 'https://www.youtube.com',
                  'start': $startSeconds
                },
                events: {
                  'onReady': function() {
                    markSettled();
                  },
                  'onError': function(event) {
                    markSettled();
                    if (window.AbkBridge && window.AbkBridge.onPlayerError) {
                      window.AbkBridge.onPlayerError(event && typeof event.data === 'number' ? event.data : -1, 'yt_player');
                    }
                  },
                  'onStateChange': function(event) {
                    markSettled();
                    if (event.data === YT.PlayerState.ENDED && window.AbkBridge) {
                      var dur = Math.floor((player.getDuration() || 0) * 1000);
                      window.AbkBridge.onProgress(dur, dur, true);
                    }
                  }
                }
              });
              setInterval(function() {
                if (player && player.getCurrentTime && player.getDuration && window.AbkBridge) {
                  var pos = Math.floor((player.getCurrentTime() || 0) * 1000);
                  var dur = Math.floor((player.getDuration() || 0) * 1000);
                  var done = dur > 0 && pos >= Math.floor(dur * 0.9);
                  window.AbkBridge.onProgress(pos, dur, done);
                }
              }, 3500);
            }
          </script>
          <script src="https://www.youtube.com/iframe_api"
                  onerror="markSettled(); if(window.AbkBridge && window.AbkBridge.onPlayerError){ window.AbkBridge.onPlayerError(-3, 'script_onerror'); }"></script>
        </body>
        </html>
        """.trimIndent()
    }

    DisposableEffect(videoId) {
        onDispose {
            onHideCustomFullscreen()
            if (latestPos > 0L || latestDone) {
                onPersistProgress(latestPos, latestDur, latestDone)
            }
        }
    }

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                @Suppress("DEPRECATION")
                settings.setGeolocationEnabled(false)
                settings.mediaPlaybackRequiresUserGesture = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                settings.setSupportMultipleWindows(true)
                settings.javaScriptCanOpenWindowsAutomatically = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                webChromeClient = object : WebChromeClient() {
                    override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                        if (view != null && callback != null) {
                            onShowCustomFullscreen(view, callback)
                        }
                    }

                    override fun onHideCustomView() {
                        onHideCustomFullscreen()
                    }

                    override fun onCreateWindow(
                        view: WebView?,
                        isDialog: Boolean,
                        isUserGesture: Boolean,
                        resultMsg: Message?
                    ): Boolean = false
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        if (request?.isForMainFrame != true) {
                            val subScheme = request?.url?.scheme?.lowercase().orEmpty()
                            return subScheme != "https"
                        }
                        val urlStr = request.url?.toString().orEmpty()
                        val host = request.url?.host?.lowercase().orEmpty()
                        val isEmbedFrame = urlStr.startsWith("https://", ignoreCase = true) &&
                            (host.contains("youtube.com") || host.contains("youtube-nocookie.com")) &&
                            (urlStr.contains("/embed/") || urlStr.contains("/iframe_api"))
                        return !isEmbedFrame
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?
                    ) {
                        val reqUrl = request?.url?.toString().orEmpty()
                        val isCritical = request?.isForMainFrame == true || reqUrl.contains("iframe_api")
                        if (isCritical) {
                            val code = error?.errorCode ?: -1
                            Log.w("MidadVideoPlayer", "YouTube WebView error code=$code url=${UrlUtils.sanitizeUrlForLog(reqUrl)}")
                            playerDiagnosis = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(code, "webview")
                        }
                    }

                    override fun onReceivedHttpError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        errorResponse: WebResourceResponse?
                    ) {
                        val reqUrl = request?.url?.toString().orEmpty()
                        val isCritical = request?.isForMainFrame == true || reqUrl.contains("iframe_api")
                        val status = errorResponse?.statusCode ?: 500
                        if (isCritical && status >= 400) {
                            Log.w("MidadVideoPlayer", "YouTube WebView HTTP $status url=${UrlUtils.sanitizeUrlForLog(reqUrl)}")
                            playerDiagnosis = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(status, "http")
                        }
                    }

                    override fun onReceivedSslError(
                        view: WebView?,
                        handler: SslErrorHandler?,
                        error: SslError?
                    ) {
                        handler?.cancel()
                        Log.w("MidadVideoPlayer", "YouTube WebView SSL error primaryError=${error?.primaryError}")
                        playerDiagnosis = VideoErrorDiagnosis(
                            cause = VideoErrorCause.SSL_ERROR,
                            userMessageAr = "تعذر التحقق من شهادة الأمان HTTPS لمشغل YouTube.",
                            technicalCode = "YT_SSL_${error?.primaryError ?: 0}"
                        )
                    }
                }
                addJavascriptInterface(object {
                    @JavascriptInterface
                    fun onProgress(posMs: Long, durMs: Long, completed: Boolean) {
                        mainHandler.post {
                            latestPos = posMs
                            latestDur = durMs
                            if (completed) latestDone = true
                            onPositionUpdate(posMs, durMs, completed)
                            if (posMs > 0L || completed) {
                                val now = android.os.SystemClock.elapsedRealtime()
                                val elapsed = now - lastSaveElapsedMs
                                val seekJumped = kotlin.math.abs(posMs - lastSavedPos) >= 15_000L
                                val newlyCompleted = completed && !lastSavedDone
                                if (elapsed >= 20_000L || seekJumped || newlyCompleted) {
                                    lastSavedPos = posMs
                                    lastSaveElapsedMs = now
                                    if (completed) lastSavedDone = true
                                    onPersistProgress(posMs, durMs, completed)
                                }
                            }
                        }
                    }

                    @JavascriptInterface
                    fun onPlayerError(code: Int, detail: String?) {
                        mainHandler.post {
                            Log.w("MidadVideoPlayer", "YouTube IFrame player error code=$code detail=${detail.orEmpty()}")
                            playerDiagnosis = VideoPlaybackSupport.mapYouTubeErrorToDiagnosis(code, detail.orEmpty())
                        }
                    }
                }, "AbkBridge")
                loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "utf-8", null)
            }
        },
        update = { webView ->
            if (reloadNonce > 0 && webView.tag != reloadNonce) {
                webView.tag = reloadNonce
                webView.loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "utf-8", null)
            }
        },
        modifier = Modifier
            .fillMaxSize()
            .testTag("youtube_inapp_webview")
    )
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun ExternalVideoWebView(
    videoUrl: String,
    onMarkStarted: () -> Unit
) {
    val validation = remember(videoUrl) { VideoPlaybackSupport.validateStreamUrl(videoUrl) }
    var webDiagnosis by remember(videoUrl) { mutableStateOf<VideoErrorDiagnosis?>(validation) }
    var reloadNonce by remember(videoUrl) { mutableIntStateOf(0) }

    val activeDiagnosis = webDiagnosis
    if (activeDiagnosis != null) {
        VideoPlaybackErrorBox(
            diagnosis = activeDiagnosis,
            boxTag = "external_video_error_box",
            retryTag = "external_retry_btn",
            onRetry = {
                webDiagnosis = VideoPlaybackSupport.validateStreamUrl(videoUrl)
                reloadNonce++
            }
        )
        return
    }

    LaunchedEffect(videoUrl) {
        onMarkStarted()
    }
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                @Suppress("DEPRECATION")
                settings.setGeolocationEnabled(false)
                settings.mediaPlaybackRequiresUserGesture = false
                settings.setSupportMultipleWindows(true)
                settings.javaScriptCanOpenWindowsAutomatically = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                webChromeClient = object : WebChromeClient() {
                    override fun onCreateWindow(
                        view: WebView?,
                        isDialog: Boolean,
                        isUserGesture: Boolean,
                        resultMsg: Message?
                    ): Boolean = false
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val scheme = request?.url?.scheme?.lowercase().orEmpty()
                        return scheme != "https"
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?
                    ) {
                        if (request?.isForMainFrame == true) {
                            webDiagnosis = VideoErrorDiagnosis(
                                cause = VideoErrorCause.NETWORK_TIMEOUT,
                                userMessageAr = "تعذر فتح رابط الفيديو الخارجي داخل التطبيق. تحقق من الاتصال ثم أعد المحاولة.",
                                technicalCode = "WEB_ERR_${error?.errorCode ?: -1}"
                            )
                        }
                    }

                    override fun onReceivedHttpError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        errorResponse: WebResourceResponse?
                    ) {
                        val status = errorResponse?.statusCode ?: 500
                        if (request?.isForMainFrame == true && status >= 400) {
                            webDiagnosis = VideoErrorDiagnosis(
                                cause = VideoErrorCause.SERVER_ERROR,
                                userMessageAr = "رفض خادم الاستضافة فتح رابط الفيديو (HTTP $status).",
                                technicalCode = "WEB_HTTP_$status"
                            )
                        }
                    }
                }
                loadUrl(videoUrl.trim())
            }
        },
        update = { webView ->
            if (reloadNonce > 0 && webView.tag != reloadNonce) {
                webView.tag = reloadNonce
                webView.loadUrl(videoUrl.trim())
            }
        },
        modifier = Modifier
            .fillMaxSize()
            .testTag("external_video_webview")
    )
}
