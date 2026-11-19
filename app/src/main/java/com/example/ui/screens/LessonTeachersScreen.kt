package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.data.model.ContentBlock
import com.example.data.model.ContentBlockType
import com.example.data.model.Lesson
import com.example.data.model.LessonExplanation
import com.example.data.model.LessonProgress
import com.example.data.model.StudyMaterial
import com.example.data.model.Teacher
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.InfoPill
import com.example.ui.components.MaterialCard
import com.example.ui.components.SectionHeader
import com.example.ui.theme.AbkSuccess
import com.example.util.PdfCacheManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonTeachersScreen(
    lesson: Lesson?,
    explanations: List<LessonExplanation>,
    contentBlocks: List<ContentBlock>,
    teachers: List<Teacher>,
    relatedMaterials: List<StudyMaterial>,
    isFavorite: Boolean,
    progress: LessonProgress?,
    onBack: () -> Unit,
    onToggleFavorite: () -> Unit,
    onOpenExplanation: (String) -> Unit,
    onWatchDirectLesson: () -> Unit,
    onOpenMaterial: (StudyMaterial) -> Unit,
    onDownloadMaterial: (StudyMaterial) -> Unit,
    onShareMaterial: (StudyMaterial) -> Unit
) {
    val context = LocalContext.current
    val teachersById = remember(teachers) { teachers.associateBy { it.id } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = lesson?.subjectName?.ifBlank { "تفاصيل الدرس" } ?: "تفاصيل الدرس",
                        style = MaterialTheme.typography.titleLarge
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("lesson_teachers_back_btn")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                actions = {
                    if (lesson != null) {
                        IconButton(onClick = onToggleFavorite) {
                            Icon(
                                imageVector = if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = "المفضلة",
                                tint = if (isFavorite) Color(0xFFE11D48) else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { innerPadding ->
        if (lesson == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                AbkEmptyState(
                    title = "الدرس غير متوفر",
                    subtitle = "تعذر العثور على هذا الدرس أو تم أرشفته."
                )
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .testTag("lesson_teachers_screen"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Lesson summary card
            item {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            InfoPill(text = lesson.subjectName)
                            if (lesson.unitTitle.isNotBlank()) {
                                InfoPill(text = lesson.unitTitle)
                            }
                            if (progress?.completed == true) {
                                InfoPill(
                                    text = "تمت المشاهدة",
                                    containerColor = Color(0xFFD1FAE5),
                                    contentColor = AbkSuccess
                                )
                            }
                        }
                        Text(
                            text = lesson.title,
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.primary
                        )
                        if (lesson.description.isNotBlank()) {
                            Text(
                                text = lesson.description,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (lesson.videoUrl.isNotBlank()) {
                            Button(
                                onClick = onWatchDirectLesson,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("watch_direct_lesson_btn"),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                            ) {
                                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = if (!lesson.teacherName.isNullOrBlank())
                                        "مشاهدة الدرس الأساسي (${lesson.teacherName})"
                                    else "مشاهدة الفيديو الرئيسي للدرس"
                                )
                            }
                        }
                    }
                }
            }

            // Multi-teacher independent explanations section
            item {
                SectionHeader(
                    title = if (explanations.isNotEmpty())
                        "شروحات الأساتذة لهذا الدرس (${explanations.size})"
                    else "شروحات الأساتذة"
                )
            }

            if (explanations.isEmpty()) {
                item {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Filled.School,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.size(28.dp)
                            )
                            Text(
                                text = if (lesson.videoUrl.isNotBlank())
                                    "يتوفر حالياً الفيديو الرئيسي لهذا الدرس في الأعلى، وسيظهر هنا أي أساتذة إضافيين فور نشر شروحاتهم."
                                else "لم تتم إضافة شروحات أساتذة لهذا الدرس بعد.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            } else {
                items(explanations, key = { it.id }) { exp ->
                    val teacher = teachersById[exp.teacherId]
                    val expBlocks = contentBlocks.filter { it.explanationId == exp.id }
                    val videoCount = expBlocks.count {
                        it.parsedBlockType() == ContentBlockType.YOUTUBE_VIDEO ||
                            it.parsedBlockType() == ContentBlockType.EXTERNAL_VIDEO
                    }
                    val pdfCount = expBlocks.count {
                        it.parsedBlockType() == ContentBlockType.PDF_FILE ||
                            it.parsedBlockType() == ContentBlockType.DOWNLOAD_FILE
                    }
                    val quizCount = expBlocks.count {
                        it.parsedBlockType() == ContentBlockType.QUIZ_MCQ ||
                            it.parsedBlockType() == ContentBlockType.QUIZ_TRUE_FALSE ||
                            it.parsedBlockType() == ContentBlockType.INTERACTIVE_EXAM ||
                            it.parsedBlockType() == ContentBlockType.QA
                    }

                    val photo = exp.teacherPhotoUrl ?: teacher?.photoUrl
                    val displayName = exp.teacherName.ifBlank { teacher?.name ?: "أستاذ في المنصة" }

                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenExplanation(exp.id) }
                            .testTag("explanation_teacher_card_${exp.id}"),
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (!photo.isNullOrBlank()) {
                                AsyncImage(
                                    model = photo,
                                    contentDescription = displayName,
                                    modifier = Modifier
                                        .size(56.dp)
                                        .clip(CircleShape)
                                        .border(1.5.dp, MaterialTheme.colorScheme.secondary, CircleShape),
                                    contentScale = ContentScale.Crop
                                )
                            } else {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(56.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = displayName.take(2),
                                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                            color = Color.White
                                        )
                                    }
                                }
                            }

                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = displayName,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    text = exp.title,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (!exp.summary.isNullOrBlank()) {
                                    Text(
                                        text = exp.summary,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    if (videoCount > 0) InfoPill(text = "$videoCount فيديو")
                                    if (pdfCount > 0) InfoPill(text = "$pdfCount ملف")
                                    if (quizCount > 0) InfoPill(text = "$quizCount تفاعلي")
                                    if (expBlocks.isEmpty()) InfoPill(text = "فتح الشرح")
                                }
                            }

                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                                contentDescription = "فتح شرح الأستاذ",
                                tint = MaterialTheme.colorScheme.secondary
                            )
                        }
                    }
                }
            }

            if (relatedMaterials.isNotEmpty()) {
                item {
                    SectionHeader(title = "ملفات ونوطات مرتبطة (${relatedMaterials.size})")
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
