package com.example.ui.screens

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ActivityInfo
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
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
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.ui.text.style.TextAlign
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

    val activeFullscreen = isFullscreen || webCustomView != null

    // Manage screen orientation & system bars for in-app fullscreen mode
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
        val ytId = UrlUtils.extractYouTubeVideoId(lesson.videoUrl)
        when {
            ytId != null -> VideoSourceType.YOUTUBE
            lesson.parsedVideoType() == VideoSourceType.MP4 -> VideoSourceType.MP4
            else -> UrlUtils.detectVideoSourceType(lesson.videoUrl)
        }
    }

    // Preserve the exact same WebView / ExoPlayer instance across normal <-> fullscreen transitions
    val sharedPlayerContent = remember(lesson.id, lesson.videoUrl, effectiveType) {
        movableContentOf {
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
    onPersistProgress: (posMs: Long, durMs: Long, completed: Boolean) -> Unit,
    onShowCustomFullscreen: (View, WebChromeClient.CustomViewCallback) -> Unit,
    onHideCustomFullscreen: () -> Unit
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
            onPersistProgress = onPersistProgress,
            onShowCustomFullscreen = onShowCustomFullscreen,
            onHideCustomFullscreen = onHideCustomFullscreen
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

    var lastPersistedPosMs by remember(videoUrl) { mutableLongStateOf(startPositionMs) }
    var lastPersistTimeMs by remember(videoUrl) { mutableLongStateOf(0L) }
    var lastPersistedDone by remember(videoUrl) { mutableStateOf(false) }

    LaunchedEffect(player) {
        while (true) {
            delay(3500L)
            val pos = player.currentPosition.coerceAtLeast(0L)
            val dur = player.duration.coerceAtLeast(0L)
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
                if (playbackState == Player.STATE_ENDED) {
                    val dur = player.duration.coerceAtLeast(0L)
                    lastPersistedPosMs = dur
                    lastPersistTimeMs = android.os.SystemClock.elapsedRealtime()
                    lastPersistedDone = true
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
            if (pos > 0L || isCompleted) {
                onPersistProgress(pos, dur, isCompleted)
            }
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
    var playerErrorCode by remember(videoId) { mutableStateOf<Int?>(null) }
    var reloadNonce by remember(videoId) { mutableIntStateOf(0) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    if (playerErrorCode != null) {
        val errorMessage = when (playerErrorCode) {
            100 -> "هذا الفيديو غير متاح أو تم ضبطه كفيديو خاص من قِبل صاحبه."
            101, 150 -> "صاحب هذا الفيديو منع تشغيله عبر التضمين خارج منصة YouTube، لذلك لا يمكن تشغيله داخل التطبيق."
            153 -> "رفض خادم التضمين تشغيل الفيديو داخل هذا المشغل حالياً."
            else -> "تعذر تحميل مشغل الفيديو المضمّن داخل التطبيق. تحقق من الاتصال ثم أعد المحاولة."
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A))
                .padding(16.dp)
                .testTag("youtube_embed_error_box"),
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
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = {
                    playerErrorCode = null
                    reloadNonce++
                },
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.testTag("youtube_retry_btn")
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("إعادة المحاولة")
            }
        }
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
                settings.mediaPlaybackRequiresUserGesture = true
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                settings.setSupportMultipleWindows(true)
                settings.javaScriptCanOpenWindowsAutomatically = false
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
                    ): Boolean {
                        return false
                    }
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val urlStr = request?.url?.toString().orEmpty()
                        val host = request?.url?.host?.lowercase().orEmpty()
                        val isEmbedFrame = urlStr.startsWith("https://", ignoreCase = true) &&
                            (host.contains("youtube.com") || host.contains("youtube-nocookie.com")) &&
                            (urlStr.contains("/embed/") || urlStr.contains("/iframe_api"))
                        return !isEmbedFrame
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
                    fun onPlayerError(code: Int) {
                        mainHandler.post {
                            playerErrorCode = code
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
    if (!UrlUtils.isSafeHttpsUrl(videoUrl)) {
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
                text = "رابط الفيديو غير صالح أو لا يستخدم بروتوكول HTTPS الآمن.",
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
        }
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
                settings.mediaPlaybackRequiresUserGesture = true
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
                }
                loadUrl(videoUrl.trim())
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}
