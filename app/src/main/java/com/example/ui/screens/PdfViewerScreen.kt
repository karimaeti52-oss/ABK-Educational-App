package com.example.ui.screens

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ZoomIn
import androidx.compose.material.icons.filled.ZoomOut
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.data.model.StudyMaterial
import com.example.ui.components.AbkEmptyState
import com.example.util.PdfCacheManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfViewerScreen(
    material: StudyMaterial?,
    isFavorite: Boolean,
    onBack: () -> Unit,
    onDownloadClick: () -> Unit,
    onShareClick: () -> Unit,
    onToggleFavorite: () -> Unit
) {
    val context = LocalContext.current
    var reloadKey by remember { mutableIntStateOf(0) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var pdfFile by remember { mutableStateOf<File?>(null) }
    var zoomScale by remember { mutableFloatStateOf(1f) }
    val listState = rememberLazyListState()

    if (material == null) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("قارئ ملفات PDF") },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                        }
                    }
                )
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                AbkEmptyState(title = "الملف غير متوفر", subtitle = "تعذر العثور على الملف المطلوب.")
            }
        }
        return
    }

    LaunchedEffect(material.id, material.fileUrl, reloadKey) {
        isLoading = true
        errorMessage = null
        val result = PdfCacheManager.getOrDownloadPdf(
            context = context,
            materialId = material.id,
            rawUrl = material.fileUrl,
            forceRefresh = reloadKey > 0
        )
        result.onSuccess { file ->
            pdfFile = file
            isLoading = false
        }.onFailure { err ->
            errorMessage = err.localizedMessage ?: "تعذر تحميل ملف PDF"
            isLoading = false
        }
    }

    val pdfRendererState = remember(pdfFile) {
        pdfFile?.let { file ->
            runCatching {
                val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                Pair(fd, PdfRenderer(fd))
            }.getOrNull()
        }
    }

    DisposableEffect(pdfRendererState) {
        onDispose {
            runCatching { pdfRendererState?.second?.close() }
            runCatching { pdfRendererState?.first?.close() }
        }
    }

    val pageCount = pdfRendererState?.second?.pageCount ?: 0
    val currentPage by remember(pageCount) {
        derivedStateOf {
            if (pageCount == 0) 0 else (listState.firstVisibleItemIndex + 1).coerceIn(1, pageCount)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = material.title,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1
                        )
                        if (pageCount > 0) {
                            Text(
                                text = "صفحة $currentPage من $pageCount",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.secondary
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("pdf_back_btn")) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                actions = {
                    IconButton(onClick = { zoomScale = (zoomScale + 0.25f).coerceAtMost(2.5f) }) {
                        Icon(Icons.Filled.ZoomIn, contentDescription = "تكبير")
                    }
                    IconButton(onClick = { zoomScale = (zoomScale - 0.25f).coerceAtLeast(1f) }) {
                        Icon(Icons.Filled.ZoomOut, contentDescription = "تصغير")
                    }
                    IconButton(onClick = onToggleFavorite, modifier = Modifier.testTag("pdf_fav_btn")) {
                        Icon(
                            imageVector = if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = "المفضلة",
                            tint = if (isFavorite) Color(0xFFE11D48) else MaterialTheme.colorScheme.onSurface
                        )
                    }
                    IconButton(onClick = onDownloadClick, modifier = Modifier.testTag("pdf_download_btn")) {
                        Icon(Icons.Filled.Download, contentDescription = "تنزيل الملف")
                    }
                    IconButton(onClick = onShareClick, modifier = Modifier.testTag("pdf_share_btn")) {
                        Icon(Icons.Filled.Share, contentDescription = "مشاركة الرابط")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFFE2E8F0))
                .padding(innerPadding)
                .testTag("pdf_viewer_screen")
        ) {
            when {
                isLoading -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator()
                        Text(
                            text = "جاري تجهيز ملف PDF بدقة عالية…",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                errorMessage != null -> {
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = errorMessage!!,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Button(onClick = { reloadKey++ }) {
                            Icon(Icons.Filled.Refresh, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("إعادة المحاولة")
                        }
                    }
                }
                pdfRendererState != null && pageCount > 0 -> {
                    val renderer = pdfRendererState.second
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(Unit) {
                                detectTransformGestures { _, _, zoom, _ ->
                                    if (zoom != 1f) {
                                        zoomScale = (zoomScale * zoom).coerceIn(1f, 2.75f)
                                    }
                                }
                            }
                            .graphicsLayer(
                                scaleX = zoomScale,
                                scaleY = zoomScale
                            ),
                        contentPadding = PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(pageCount) { pageIndex ->
                            PdfPageItem(
                                renderer = renderer,
                                pageIndex = pageIndex,
                                totalPages = pageCount
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PdfPageItem(
    renderer: PdfRenderer,
    pageIndex: Int,
    totalPages: Int
) {
    val bitmap by produceState<Bitmap?>(initialValue = null, renderer, pageIndex) {
        value = withContext(Dispatchers.IO) {
            synchronized(renderer) {
                runCatching {
                    renderer.openPage(pageIndex).use { page ->
                        // Render at crisp high DPI so Arabic fonts and diacritics are razor sharp
                        val scale = 2.2f
                        val width = (page.width * scale).toInt().coerceIn(600, 2200)
                        val height = (page.height * scale).toInt().coerceIn(800, 3200)
                        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        Canvas(bmp).drawColor(AndroidColor.WHITE)
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bmp
                    }
                }.getOrNull()
            }
        }
    }

    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        if (bitmap != null) {
            Column {
                Image(
                    bitmap = bitmap!!.asImageBitmap(),
                    contentDescription = "صفحة ${pageIndex + 1} من $totalPages",
                    modifier = Modifier.fillMaxWidth(),
                    contentScale = ContentScale.FillWidth
                )
                Surface(color = Color(0xFFF8FAFC), modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        Text(
                            text = "${pageIndex + 1} / $totalPages",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(420.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
    }
}
