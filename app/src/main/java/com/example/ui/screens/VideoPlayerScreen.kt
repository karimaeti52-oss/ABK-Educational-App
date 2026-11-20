package com.example.ui.screens

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
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

    var latestPositionMs by remember(lesson?.id) {
        mutableLongStateOf(initialProgress?.lastPositionMs ?: 0L)
    }
    var latestDurationMs by remember(lesson?.id) {
        mutableLongStateOf(initialProgress?.durationMs ?: 0L)
    }
    var markedCompleted by remember(lesson?.id) {
        mutableStateOf(initialProgress?.completed == true)
    }

    // Manage screen orientation & system bars for fullscreen mode
    DisposableEffect(isFullscreen) {
        val window = activity?.window
        if (activity != null && window != null) {
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            if (isFullscreen) {
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
        if (isFullscreen) {
            isFullscreen = false
        } else {
            if (lesson != null) {
                onSaveProgress(latestPositionMs, latestDurationMs, markedCompleted)
            }
            onBack()
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
        val ytId = UrlUtils.extractYouTubeVideoId(lesson.videoUrl)
        when {
            ytId != null -> VideoSourceType.YOUTUBE
            lesson.parsedVideoType() == VideoSourceType.MP4 -> VideoSourceType.MP4
            else -> UrlUtils.detectVideoSourceType(lesson.videoUrl)
        }
    }

    if (isFullscreen) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .testTag("video_fullscreen_container")
        ) {
            InAppPlayerContent(
                lesson = lesson,
                sourceType = effectiveType,
                startPositionMs = latestPositionMs,
                onPositionUpdate = { pos, dur, done ->
                    latestPositionMs = pos
                    latestDurationMs = dur
                    if (done) markedCompleted = true
                },
                onPersistProgress = { pos, dur, done ->
                    onSaveProgress(pos, dur, done || markedCompleted)
                }
            )
            IconButton(
                onClick = { isFullscreen = false },
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
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
                    InAppPlayerContent(
                        lesson = lesson,
                        sourceType = effectiveType,
                        startPositionMs = latestPositionMs,
                        onPositionUpdate = { pos, dur, done ->
                            latestPositionMs = pos
                            latestDurationMs = dur
                            if (done) markedCompleted = true
                        },
                        onPersistProgress = { pos, dur, done ->
                            onSaveProgress(pos, dur, done || markedCompleted)
                        }
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
                        InfoPill(text = lesson.unitTitle)
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

                    if (effectiveType == VideoSourceType.YOUTUBE) {
                        OutlinedButton(
                            onClick = {
                                val watchUri = Uri.parse(UrlUtils.toYouTubeWatchUrl(lesson.videoUrl))
                                runCatching {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, watchUri))
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("open_on_youtube_btn"),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("فتح الفيديو على YouTube")
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

@Composable
private fun InAppPlayerContent(
    lesson: Lesson,
    sourceType: VideoSourceType,
    startPositionMs: Long,
    onPositionUpdate: (posMs: Long, durMs: Long, completed: Boolean) -> Unit,
    onPersistProgress: (posMs: Long, durMs: Long, completed: Boolean) -> Unit
) {
    when (sourceType) {
        VideoSourceType.MP4 -> ExoVideoPlayerView(
            videoUrl = lesson.videoUrl,
            startPositionMs = startPositionMs,
            onPositionUpdate = onPositionUpdate,
            onPersistProgress = onPersistProgress
        )
        VideoSourceType.YOUTUBE -> YouTubeInAppPlayerView(
            videoUrl = lesson.videoUrl,
            startPositionMs = startPositionMs,
            onPositionUpdate = onPositionUpdate,
            onPersistProgress = onPersistProgress
        )
        VideoSourceType.EXTERNAL -> ExternalVideoWebView(
            videoUrl = lesson.videoUrl,
            onMarkStarted = {
                onPositionUpdate(1000L, 1000L, false)
                onPersistProgress(1000L, 1000L, false)
            }
        )
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun ExoVideoPlayerView(
    videoUrl: String,
    startPositionMs: Long,
    onPositionUpdate: (Long, Long, Boolean) -> Unit,
    onPersistProgress: (Long, Long, Boolean) -> Unit
) {
    val context = LocalContext.current
    val player = remember(videoUrl) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(videoUrl))
            if (startPositionMs > 2000L) {
                seekTo(startPositionMs)
            }
            prepare()
            playWhenReady = true
        }
    }

    LaunchedEffect(player) {
        while (true) {
            delay(3500L)
            val pos = player.currentPosition.coerceAtLeast(0L)
            val dur = player.duration.coerceAtLeast(0L)
            val isCompleted = dur > 0L && pos >= (dur * 0.9f).toLong()
            onPositionUpdate(pos, dur, isCompleted)
            if (player.isPlaying) {
                onPersistProgress(pos, dur, isCompleted)
            }
        }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    val dur = player.duration.coerceAtLeast(0L)
                    onPositionUpdate(dur, dur, true)
                    onPersistProgress(dur, dur, true)
                }
            }
        }
        player.addListener(listener)
        onDispose {
            val pos = player.currentPosition.coerceAtLeast(0L)
            val dur = player.duration.coerceAtLeast(0L)
            val isCompleted = dur > 0L && pos >= (dur * 0.9f).toLong()
            onPersistProgress(pos, dur, isCompleted)
            player.removeListener(listener)
            player.release()
        }
    }

    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                useController = true
                keepScreenOn = true
            }
        },
        update = { view ->
            if (view.player !== player) {
                view.player = player
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun YouTubeInAppPlayerView(
    videoUrl: String,
    startPositionMs: Long,
    onPositionUpdate: (Long, Long, Boolean) -> Unit,
    onPersistProgress: (Long, Long, Boolean) -> Unit
) {
    val context = LocalContext.current
    val videoId = remember(videoUrl) { UrlUtils.extractYouTubeVideoId(videoUrl) }
    if (videoId == null) {
        ExternalVideoWebView(videoUrl = videoUrl, onMarkStarted = {})
        return
    }

    val startSeconds = (startPositionMs / 1000L).coerceAtLeast(0L)
    var latestPos by remember { mutableLongStateOf(startPositionMs) }
    var latestDur by remember { mutableLongStateOf(0L) }
    var latestDone by remember { mutableStateOf(false) }
    var playerErrorCode by remember(videoId) { mutableStateOf<Int?>(null) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    if (playerErrorCode != null) {
        val errorMessage = when (playerErrorCode) {
            100 -> "هذا الفيديو غير موجود أو خاص على YouTube."
            101, 150 -> "مالك الفيديو منع تشغيله عبر التضمين خارج تطبيق YouTube."
            153 -> "رفض YouTube تشغيل التضمين داخل هذا الجهاز (رمز 153)."
            else -> "تعذر تشغيل الفيديو داخل المشغل المضمّن حالياً."
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A))
                .padding(16.dp),
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
                text = errorMessage,
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = {
                    val watchUri = Uri.parse(UrlUtils.toYouTubeWatchUrl(videoUrl))
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, watchUri)) }
                },
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("فتح الفيديو على YouTube")
            }
        }
        return
    }

    val html = remember(videoId, startSeconds) {
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
          <script src="https://www.youtube.com/iframe_api"></script>
          <script>
            var player;
            var ready = false;
            setTimeout(function() {
              if (!ready && window.AbkBridge && window.AbkBridge.onPlayerError) {
                window.AbkBridge.onPlayerError(-2);
              }
            }, 12000);
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
                    ready = true;
                  },
                  'onError': function(event) {
                    ready = true;
                    if (window.AbkBridge && window.AbkBridge.onPlayerError) {
                      window.AbkBridge.onPlayerError(event && typeof event.data === 'number' ? event.data : -1);
                    }
                  },
                  'onStateChange': function(event) {
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
        </body>
        </html>
        """.trimIndent()
    }

    DisposableEffect(videoId) {
        onDispose {
            onPersistProgress(latestPos, latestDur, latestDone)
        }
    }

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = true
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val host = request?.url?.host ?: return false
                        return !host.contains("youtube.com") && !host.contains("youtube-nocookie.com")
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
                            if (posMs > 0L) {
                                onPersistProgress(posMs, durMs, completed)
                            }
                        }
                    }

                    @JavascriptInterface
                    fun onPlayerError(code: Int) {
                        mainHandler.post {
                            playerErrorCode = code
                        }
                    }
                }, "AbkBridge")
                loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "utf-8", null)
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun ExternalVideoWebView(
    videoUrl: String,
    onMarkStarted: () -> Unit
) {
    LaunchedEffect(videoUrl) {
        onMarkStarted()
    }
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                webChromeClient = WebChromeClient()
                webViewClient = WebViewClient()
                loadUrl(videoUrl)
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}
