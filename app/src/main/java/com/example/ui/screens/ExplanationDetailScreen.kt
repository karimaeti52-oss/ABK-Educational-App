package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.QuestionAnswer
import androidx.compose.material.icons.filled.Quiz
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
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.R
import com.example.data.model.ContentBlock
import com.example.data.model.ContentBlockType
import com.example.data.model.CustomSectionType
import com.example.data.model.Lesson
import com.example.data.model.LessonExplanation
import com.example.data.model.StudyMaterial
import com.example.data.model.Teacher
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.InfoPill
import com.example.ui.components.MaterialCard
import com.example.ui.components.SectionHeader
import com.example.ui.theme.AbkNavyDeep
import com.example.ui.theme.AbkSuccess
import com.example.util.PdfCacheManager
import com.example.util.UrlUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExplanationDetailScreen(
    explanation: LessonExplanation?,
    teacher: Teacher?,
    lesson: Lesson?,
    blocks: List<ContentBlock>,
    customSectionTypes: List<CustomSectionType>,
    relatedMaterials: List<StudyMaterial>,
    onBack: () -> Unit,
    onPlayBlockVideo: (ContentBlock) -> Unit,
    onOpenBlockPdf: (ContentBlock) -> Unit,
    onOpenMaterial: (StudyMaterial) -> Unit,
    onDownloadMaterial: (StudyMaterial) -> Unit,
    onShareMaterial: (StudyMaterial) -> Unit,
    onOpenAttachmentUrl: ((String) -> Unit)? = null
) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val sortedBlocks = remember(blocks) { blocks.sortedBy { it.sortOrder } }
    val customTypesByKey = remember(customSectionTypes) { customSectionTypes.associateBy { it.key } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = explanation?.teacherName ?: teacher?.name ?: "شرح الأستاذ",
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (lesson != null) {
                            Text(
                                text = lesson.title,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.secondary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("explanation_detail_back_btn")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { innerPadding ->
        if (explanation == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                AbkEmptyState(
                    title = "الشرح غير متوفر",
                    subtitle = "ربما تم إخفاء شرح هذا الأستاذ أو نقله."
                )
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .testTag("explanation_detail_screen"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Teacher & Explanation Header Card
            item {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            val photo = explanation.teacherPhotoUrl ?: teacher?.photoUrl
                            val tName = explanation.teacherName.ifBlank { teacher?.name ?: "الأستاذ" }
                            if (!photo.isNullOrBlank()) {
                                AsyncImage(
                                    model = photo,
                                    contentDescription = tName,
                                    modifier = Modifier
                                        .size(52.dp)
                                        .clip(CircleShape),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(52.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = tName.take(2),
                                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                            color = Color.White
                                        )
                                    }
                                }
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = tName,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.primary
                                )
                                if (!teacher?.headline.isNullOrBlank()) {
                                    Text(
                                        text = teacher!!.headline!!,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        Text(
                            text = explanation.title,
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.primary
                        )

                        if (!explanation.summary.isNullOrBlank()) {
                            Text(
                                text = explanation.summary,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            if (sortedBlocks.isEmpty()) {
                item {
                    AbkEmptyState(
                        title = "لا توجد أقسام محتوى بعد",
                        subtitle = "لم يضف الأستاذ فيديوهات أو ملفات أو اختبارات داخل هذا الشرح حتى الآن."
                    )
                }
            } else {
                items(sortedBlocks, key = { it.id }) { block ->
                    val blockType = block.parsedBlockType()
                    when (blockType) {
                        ContentBlockType.YOUTUBE_VIDEO,
                        ContentBlockType.EXTERNAL_VIDEO -> {
                            BlockVideoCard(block = block, onPlay = { onPlayBlockVideo(block) })
                        }
                        ContentBlockType.PDF_FILE -> {
                            BlockPdfCard(block = block, onOpenPdf = { onOpenBlockPdf(block) })
                        }
                        ContentBlockType.DOWNLOAD_FILE,
                        ContentBlockType.EXTERNAL_LINK -> {
                            BlockLinkOrDownloadCard(
                                block = block,
                                isDownload = blockType == ContentBlockType.DOWNLOAD_FILE,
                                onOpenUrl = { url ->
                                    if (onOpenAttachmentUrl != null) {
                                        onOpenAttachmentUrl(url)
                                    } else if (UrlUtils.isSafeHttpsUrl(url)) {
                                        runCatching { uriHandler.openUri(url.trim()) }
                                    }
                                }
                            )
                        }
                        ContentBlockType.IMAGE -> {
                            BlockImageCard(block = block)
                        }
                        ContentBlockType.QA -> {
                            BlockQaCard(block = block)
                        }
                        ContentBlockType.QUIZ_MCQ,
                        ContentBlockType.QUIZ_TRUE_FALSE,
                        ContentBlockType.INTERACTIVE_EXAM -> {
                            BlockQuizRunnerCard(block = block)
                        }
                        ContentBlockType.ASSIGNMENT -> {
                            BlockAssignmentCard(
                                block = block,
                                onOpenPdf = { onOpenBlockPdf(block) },
                                onOpenUrl = { url ->
                                    if (onOpenAttachmentUrl != null) {
                                        onOpenAttachmentUrl(url)
                                    } else if (UrlUtils.isSafeHttpsUrl(url)) {
                                        runCatching { uriHandler.openUri(url.trim()) }
                                    }
                                }
                            )
                        }
                        ContentBlockType.NOTE_SUMMARY,
                        ContentBlockType.RICH_TEXT,
                        ContentBlockType.CUSTOM -> {
                            val customBadge = block.customTypeKey?.let { customTypesByKey[it]?.labelAr }
                            BlockTextCard(block = block, customBadge = customBadge)
                        }
                    }
                }
            }

            if (relatedMaterials.isNotEmpty()) {
                item {
                    SectionHeader(title = "مرفقات الأستاذ أو الدرس (${relatedMaterials.size})")
                }
                items(relatedMaterials, key = { it.id }) { mat ->
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

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun BlockVideoCard(block: ContentBlock, onPlay: () -> Unit) {
    val thumb = block.thumbnailUrl?.takeIf { it.isNotBlank() }
        ?: block.mediaUrl?.let { UrlUtils.getYouTubeThumbnailUrl(it) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay)
            .testTag("block_video_card_${block.id}"),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(164.dp)
                    .background(AbkNavyDeep)
            ) {
                if (thumb != null) {
                    AsyncImage(
                        model = thumb,
                        contentDescription = block.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                        error = painterResource(id = R.drawable.img_midad_hero)
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.28f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.PlayCircleFilled,
                        contentDescription = "تشغيل الفيديو",
                        tint = Color.White,
                        modifier = Modifier.size(48.dp)
                    )
                }
                if (!block.durationLabel.isNullOrBlank()) {
                    Surface(
                        color = Color.Black.copy(alpha = 0.72f),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(10.dp)
                    ) {
                        Text(
                            text = block.durationLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }
            }
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                InfoPill(text = block.parsedBlockType().labelAr)
                Text(text = block.title, style = MaterialTheme.typography.titleMedium)
                if (!block.subtitle.isNullOrBlank()) {
                    Text(
                        text = block.subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Button(
                    onClick = onPlay,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("مشاهدة الفيديو داخل التطبيق")
                }
            }
        }
    }
}

@Composable
private fun BlockPdfCard(block: ContentBlock, onOpenPdf: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenPdf)
            .testTag("block_pdf_card_${block.id}"),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(52.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Filled.PictureAsPdf,
                        contentDescription = "ملف PDF",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = block.title, style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    InfoPill(text = "ملف PDF")
                    if (!block.fileSizeLabel.isNullOrBlank()) {
                        InfoPill(text = block.fileSizeLabel)
                    }
                }
            }
            Button(onClick = onOpenPdf, shape = RoundedCornerShape(10.dp)) {
                Icon(Icons.Filled.MenuBook, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("عرض")
            }
        }
    }
}

@Composable
private fun BlockLinkOrDownloadCard(
    block: ContentBlock,
    isDownload: Boolean,
    onOpenUrl: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (isDownload) Icons.Filled.Download else Icons.Filled.Link,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.secondary
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(text = block.title, style = MaterialTheme.typography.titleMedium)
                if (!block.bodyText.isNullOrBlank()) {
                    Text(
                        text = block.bodyText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            OutlinedButton(
                onClick = { block.mediaUrl?.let(onOpenUrl) },
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(if (isDownload) "تنزيل" else "فتح")
            }
        }
    }
}

@Composable
private fun BlockImageCard(block: ContentBlock) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!block.mediaUrl.isNullOrBlank()) {
                AsyncImage(
                    model = block.mediaUrl,
                    contentDescription = block.title,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp),
                    contentScale = ContentScale.Crop
                )
            }
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = block.title, style = MaterialTheme.typography.titleMedium)
                if (!block.bodyText.isNullOrBlank()) {
                    Text(
                        text = block.bodyText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun BlockTextCard(block: ContentBlock, customBadge: String?) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("block_text_card_${block.id}"),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            InfoPill(text = customBadge ?: block.parsedBlockType().labelAr)
            Text(
                text = block.title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary
            )
            if (!block.subtitle.isNullOrBlank()) {
                Text(
                    text = block.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary
                )
            }
            if (!block.bodyText.isNullOrBlank()) {
                Text(
                    text = block.bodyText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun BlockAssignmentCard(
    block: ContentBlock,
    onOpenPdf: () -> Unit,
    onOpenUrl: (String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("block_assignment_card_${block.id}"),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.Assignment,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary
                )
                InfoPill(text = block.parsedBlockType().labelAr)
            }
            Text(
                text = block.title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary
            )
            if (!block.subtitle.isNullOrBlank()) {
                Text(
                    text = block.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary
                )
            }
            if (!block.bodyText.isNullOrBlank()) {
                Text(
                    text = block.bodyText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            val url = block.mediaUrl
            if (!url.isNullOrBlank()) {
                val isPdf = url.contains(".pdf", ignoreCase = true)
                OutlinedButton(
                    onClick = { if (isPdf) onOpenPdf() else onOpenUrl(url) },
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = if (isPdf) Icons.Filled.PictureAsPdf else Icons.Filled.Link,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(if (isPdf) "فتح ملف الواجب (PDF)" else "فتح مرفق الواجب")
                }
            }
        }
    }
}

@Composable
private fun BlockQaCard(block: ContentBlock) {
    val expandedState = remember(block.id) { mutableStateMapOf<Int, Boolean>() }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("block_qa_card_${block.id}"),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Filled.QuestionAnswer, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                Text(
                    text = block.title,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.primary
                )
            }

            block.qaItems.forEachIndexed { idx, qa ->
                val isOpen = expandedState[idx] == true
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { expandedState[idx] = !isOpen }
                        .testTag("qa_item_${block.id}_$idx")
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "س${idx + 1}: ${qa.question}",
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                modifier = Modifier.weight(1f)
                            )
                            Icon(
                                imageVector = if (isOpen) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                                contentDescription = if (isOpen) "إخفاء الإجابة" else "عرض الإجابة"
                            )
                        }
                        AnimatedVisibility(visible = isOpen) {
                            Text(
                                text = qa.answer,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BlockQuizRunnerCard(block: ContentBlock) {
    val selectedAnswers = remember(block.id) { mutableStateMapOf<Int, Int>() }
    var submitted by remember(block.id) { mutableStateOf(false) }
    var score by remember(block.id) { mutableIntStateOf(0) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("block_quiz_card_${block.id}"),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.45f))
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Filled.Quiz, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                    Text(
                        text = block.title,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                InfoPill(text = "${block.quizQuestions.size} أسئلة")
            }

            if (submitted) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (score == block.quizQuestions.size) Color(0xFFD1FAE5)
                    else MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("quiz_result_banner_${block.id}")
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "نتيجتك: $score / ${block.quizQuestions.size}",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            color = if (score == block.quizQuestions.size) AbkSuccess else MaterialTheme.colorScheme.primary
                        )
                        Icon(
                            Icons.Filled.CheckCircle,
                            contentDescription = null,
                            tint = if (score == block.quizQuestions.size) AbkSuccess else MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            block.quizQuestions.forEachIndexed { qIdx, q ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "${qIdx + 1}. ${q.prompt}",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                    )
                    val chosen = selectedAnswers[qIdx]
                    val correctIdx = q.correctIndex.toInt()
                    q.options.forEachIndexed { optIdx, optionText ->
                        val isChosen = chosen == optIdx
                        val isCorrect = optIdx == correctIdx
                        val bg = when {
                            submitted && isCorrect -> Color(0xFFD1FAE5)
                            submitted && isChosen && !isCorrect -> MaterialTheme.colorScheme.errorContainer
                            isChosen -> MaterialTheme.colorScheme.primaryContainer
                            else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                        }
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = bg,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !submitted) { selectedAnswers[qIdx] = optIdx }
                                .testTag("quiz_opt_${block.id}_${qIdx}_$optIdx")
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = isChosen,
                                    onClick = if (!submitted) ({ selectedAnswers[qIdx] = optIdx }) else null
                                )
                                Text(
                                    text = optionText,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                    }

                    if (submitted && !q.explanation.isNullOrBlank()) {
                        Text(
                            text = "التوضيح: ${q.explanation}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.padding(horizontal = 6.dp)
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (!submitted) {
                    Button(
                        onClick = {
                            score = block.quizQuestions.mapIndexed { idx, q ->
                                if (selectedAnswers[idx] == q.correctIndex.toInt()) 1 else 0
                            }.sum()
                            submitted = true
                        },
                        enabled = block.quizQuestions.isNotEmpty(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("submit_quiz_btn_${block.id}"),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text("تصحيح الاختبار وعرض النتيجة")
                    }
                } else {
                    OutlinedButton(
                        onClick = {
                            selectedAnswers.clear()
                            score = 0
                            submitted = false
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("retry_quiz_btn_${block.id}"),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("إعادة المحاولة")
                    }
                }
            }
        }
    }
}
