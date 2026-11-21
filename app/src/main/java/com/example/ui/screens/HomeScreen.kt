package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.R
import com.example.data.model.Announcement
import com.example.data.model.CatalogNode
import com.example.data.model.FavoriteItem
import com.example.data.model.FavoriteType
import com.example.data.model.Lesson
import com.example.data.model.LessonProgress
import com.example.data.model.PlatformConfig
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.UiState
import com.example.data.model.UserProfile
import com.example.data.model.resolvedForMidad
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.AbkLogoMark
import com.example.ui.components.AbkSearchBar
import com.example.ui.components.AnnouncementBannerCard
import com.example.ui.components.CatalogNodeCard
import com.example.ui.components.LessonCard
import com.example.ui.components.MaterialCard
import com.example.ui.components.SectionHeader
import com.example.ui.components.SubjectCard
import com.example.ui.components.TeacherShowcaseCard
import com.example.ui.theme.MidadGoldLight
import com.example.ui.theme.MidadNavyDeep
import com.example.ui.theme.MidadTurquoise
import com.example.ui.theme.MidadWarning
import com.example.util.PdfCacheManager
import com.example.util.UrlUtils
import com.example.viewmodel.SearchResults

@Composable
fun HomeScreen(
    userProfile: UserProfile?,
    isAdmin: Boolean,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    searchResults: SearchResults,
    subjectsState: UiState<List<Subject>>,
    lessonsState: UiState<List<Lesson>>,
    materialsState: UiState<List<StudyMaterial>>,
    announcementsState: UiState<List<Announcement>>,
    favoritesState: UiState<List<FavoriteItem>>,
    progressState: UiState<List<LessonProgress>>,
    readAnnouncementIds: Set<String>,
    onOpenSubject: (String) -> Unit,
    onViewAllSubjects: () -> Unit,
    onWatchLesson: (Lesson) -> Unit,
    onOpenMaterial: (StudyMaterial) -> Unit,
    onDownloadMaterial: (StudyMaterial) -> Unit,
    onShareMaterial: (StudyMaterial) -> Unit,
    onToggleFavoriteLesson: (Lesson) -> Unit,
    onToggleFavoriteMaterial: (StudyMaterial) -> Unit,
    onOpenAnnouncement: (Announcement) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenLibrary: () -> Unit,
    onOpenAdminPanel: () -> Unit,
    platformConfig: PlatformConfig = PlatformConfig(),
    catalogNodesState: UiState<List<CatalogNode>> = UiState.Success(emptyList()),
    onOpenCatalogNode: (String) -> Unit = {}
) {
    val context = LocalContext.current
    val catalogNodes = (catalogNodesState as? UiState.Success)?.data.orEmpty()
    val subjects = (subjectsState as? UiState.Success)?.data.orEmpty()
    val lessons = (lessonsState as? UiState.Success)?.data.orEmpty()
    val materials = (materialsState as? UiState.Success)?.data.orEmpty()
    val announcements = (announcementsState as? UiState.Success)?.data.orEmpty()
    val favorites = (favoritesState as? UiState.Success)?.data.orEmpty()
    val progressList = (progressState as? UiState.Success)?.data.orEmpty()

    val rootNodes = remember(catalogNodes) {
        catalogNodes.filter { it.parentId.isNullOrBlank() }
    }

    val favoriteLessonIds = favorites.filter { it.parsedType() == FavoriteType.LESSON }.map { it.itemId }.toSet()
    val favoriteMaterialIds = favorites.filter { it.parsedType() == FavoriteType.MATERIAL }.map { it.itemId }.toSet()
    val progressByLesson = progressList.associateBy { it.lessonId }

    val lastWatchedProgress = progressList.firstOrNull { !it.completed && it.lastPositionMs > 0L }
        ?: progressList.firstOrNull()
    val lastWatchedLesson = lastWatchedProgress?.let { prog -> lessons.firstOrNull { it.id == prog.lessonId } }

    val resolvedConfig = remember(platformConfig) { platformConfig.resolvedForMidad() }
    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.secondary

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("home_screen"),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        // Header with dynamic logo & platform name + optional Admin entry
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                AbkLogoMark(platformConfig = platformConfig)
                if (isAdmin) {
                    Surface(
                        onClick = onOpenAdminPanel,
                        shape = RoundedCornerShape(12.dp),
                        color = primaryColor,
                        modifier = Modifier.testTag("home_admin_button")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.AdminPanelSettings,
                                contentDescription = "لوحة التحكم",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = "لوحة المدير",
                                style = MaterialTheme.typography.labelMedium,
                                color = Color.White
                            )
                        }
                    }
                }
            }
        }

        // Optional Maintenance Notice Banner controlled from Admin Portal
        if (resolvedConfig.maintenanceMode) {
            item {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MidadWarning.copy(alpha = 0.14f),
                    border = BorderStroke(1.dp, MidadWarning.copy(alpha = 0.45f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.Info, contentDescription = null, tint = MidadWarning)
                        Text(
                            text = "تنبيه: تجري حالياً أعمال صيانة وتحديث لمحتوى المنصة.",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }

        // Dynamic Hero Welcome Card
        item {
            val studentName = userProfile?.displayName?.takeIf { it.isNotBlank() } ?: "طالبنا العزيز"
            Card(
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = MidadNavyDeep),
                border = BorderStroke(1.dp, MidadGoldLight.copy(alpha = 0.25f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(modifier = Modifier.fillMaxWidth()) {
                    if (!resolvedConfig.heroBannerUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = resolvedConfig.heroBannerUrl,
                            contentDescription = null,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(160.dp),
                            contentScale = ContentScale.Crop,
                            alpha = 0.28f,
                            error = painterResource(id = R.drawable.img_midad_hero)
                        )
                    } else {
                        Image(
                            painter = painterResource(id = R.drawable.img_midad_hero),
                            contentDescription = null,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(160.dp),
                            contentScale = ContentScale.Crop,
                            alpha = 0.24f
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(160.dp)
                            .background(
                                Brush.horizontalGradient(
                                    listOf(MidadNavyDeep.copy(alpha = 0.94f), MidadTurquoise.copy(alpha = 0.78f))
                                )
                            )
                    )
                    Column(
                        modifier = Modifier
                            .padding(18.dp)
                            .align(Alignment.CenterStart),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "مرحباً بك يا $studentName",
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                        Text(
                            text = resolvedConfig.welcomeTitle.ifBlank { resolvedConfig.welcomeSubtitle },
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.92f),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StatChip("${subjects.size} مادة")
                            StatChip("${lessons.size} درس")
                            StatChip("${materials.size} ملف PDF")
                        }
                    }
                }
            }
        }

        // Search Bar
        item {
            AbkSearchBar(
                query = searchQuery,
                onQueryChange = onSearchQueryChange
            )
        }

        // Live Search Results Mode
        if (searchQuery.trim().isNotEmpty()) {
            if (searchResults.isEmpty) {
                item {
                    AbkEmptyState(
                        title = "لا توجد نتائج مطابقة",
                        subtitle = "جرب البحث باسم المرحلة أو المادة أو عنوان الدرس أو اسم الأستاذ."
                    )
                }
            } else {
                if (searchResults.catalogNodes.isNotEmpty()) {
                    item { SectionHeader(title = "المراحل والفروع المطابقة (${searchResults.catalogNodes.size})") }
                    items(searchResults.catalogNodes.chunked(2)) { pair ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            pair.forEach { node ->
                                val desc = collectNodeAndDescendants(node.id, catalogNodes)
                                CatalogNodeCard(
                                    node = node,
                                    childCount = catalogNodes.count { it.parentId == node.id },
                                    subjectCount = subjects.count { s -> s.nodeIds.any { it in desc } },
                                    onClick = { onOpenCatalogNode(node.id) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
                if (searchResults.teachers.isNotEmpty()) {
                    item { SectionHeader(title = "الأساتذة المطابقون (${searchResults.teachers.size})") }
                    items(searchResults.teachers, key = { it.id }) { teacher ->
                        TeacherShowcaseCard(teacher = teacher)
                    }
                }
                if (searchResults.subjects.isNotEmpty()) {
                    item { SectionHeader(title = "المواد المطابقة (${searchResults.subjects.size})") }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(searchResults.subjects, key = { it.id }) { subject ->
                                SubjectCard(
                                    subject = subject,
                                    lessonCount = lessons.count { it.subjectId == subject.id },
                                    materialCount = materials.count { it.subjectId == subject.id },
                                    onClick = { onOpenSubject(subject.id) },
                                    modifier = Modifier.width(190.dp)
                                )
                            }
                        }
                    }
                }
                if (searchResults.lessons.isNotEmpty()) {
                    item { SectionHeader(title = "الدروس والفيديوهات (${searchResults.lessons.size})") }
                    items(searchResults.lessons, key = { it.id }) { lesson ->
                        LessonCard(
                            lesson = lesson,
                            progress = progressByLesson[lesson.id],
                            isFavorite = lesson.id in favoriteLessonIds,
                            onWatchClick = { onWatchLesson(lesson) },
                            onToggleFavorite = { onToggleFavoriteLesson(lesson) }
                        )
                    }
                }
                if (searchResults.materials.isNotEmpty()) {
                    item { SectionHeader(title = "الملفات والكتب والنوطات (${searchResults.materials.size})") }
                    items(searchResults.materials, key = { it.id }) { mat ->
                        MaterialCard(
                            material = mat,
                            isFavorite = mat.id in favoriteMaterialIds,
                            isCachedOffline = PdfCacheManager.isPdfCachedOffline(context, mat.id),
                            onOpenPdf = { onOpenMaterial(mat) },
                            onDownloadClick = { onDownloadMaterial(mat) },
                            onShareClick = { onShareMaterial(mat) },
                            onToggleFavorite = { onToggleFavoriteMaterial(mat) }
                        )
                    }
                }
            }
        } else {
            // Dynamic "ماذا تدرس؟" Hierarchy Entry Grid (Stages / Grades / Branches / Courses)
            if (rootNodes.isNotEmpty()) {
                item {
                    SectionHeader(
                        title = platformConfig.homeHeadline.ifBlank { "ماذا تدرس؟" },
                        actionLabel = "كل المواد",
                        onActionClick = onViewAllSubjects
                    )
                }
                items(rootNodes.chunked(2)) { pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        pair.forEach { node ->
                            val descIds = collectNodeAndDescendants(node.id, catalogNodes)
                            CatalogNodeCard(
                                node = node,
                                childCount = catalogNodes.count { it.parentId == node.id },
                                subjectCount = subjects.count { s -> s.nodeIds.any { it in descIds } },
                                onClick = { onOpenCatalogNode(node.id) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (pair.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }

            // Continue Watching Card
            if (platformConfig.showContinueWatching && lastWatchedLesson != null && lastWatchedProgress != null) {
                item {
                    SectionHeader(title = stringResource(R.string.continue_watching))
                }
                item {
                    Card(
                        onClick = { onWatchLesson(lastWatchedLesson) },
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                        border = BorderStroke(1.dp, secondaryColor.copy(alpha = 0.4f)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("continue_watching_card")
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = lastWatchedLesson.subjectName,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = secondaryColor
                                    )
                                    Text(
                                        text = lastWatchedLesson.title,
                                        style = MaterialTheme.typography.titleMedium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "وصلت إلى ${UrlUtils.formatDurationMs(lastWatchedProgress.lastPositionMs)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Button(
                                    onClick = { onWatchLesson(lastWatchedLesson) },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = secondaryColor)
                                ) {
                                    Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("متابعة")
                                }
                            }
                            if (lastWatchedProgress.durationMs > 0L) {
                                LinearProgressIndicator(
                                    progress = { lastWatchedProgress.progressFraction },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(6.dp)
                                        .clip(RoundedCornerShape(3.dp)),
                                    color = secondaryColor,
                                    trackColor = MaterialTheme.colorScheme.surface
                                )
                            }
                        }
                    }
                }
            }

            // Announcements & Alerts
            if (platformConfig.showAnnouncements && announcements.isNotEmpty()) {
                item {
                    SectionHeader(
                        title = stringResource(R.string.announcements_section),
                        actionLabel = "عرض الكل",
                        onActionClick = onOpenNotifications
                    )
                }
                items(announcements.take(2), key = { it.id }) { ann ->
                    AnnouncementBannerCard(
                        announcement = ann,
                        isUnread = ann.id !in readAnnouncementIds,
                        onClick = { onOpenAnnouncement(ann) }
                    )
                }
            }

            // Subjects Horizontal Section
            item {
                SectionHeader(
                    title = if (rootNodes.isEmpty())
                        platformConfig.homeHeadline.ifBlank { stringResource(R.string.subjects_section) }
                    else stringResource(R.string.subjects_section),
                    actionLabel = "كل المواد",
                    onActionClick = onViewAllSubjects
                )
            }
            when (subjectsState) {
                UiState.Loading -> item {
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is UiState.Error -> item {
                    Text(subjectsState.message, color = MaterialTheme.colorScheme.error)
                }
                is UiState.Success -> {
                    if (subjects.isEmpty()) {
                        item {
                            AbkEmptyState(
                                title = "لم تتم إضافة مواد دراسية بعد",
                                subtitle = if (isAdmin) "يمكنك إضافة المراحل والمواد والشروحات من لوحة الإدارة."
                                else "سيقوم فريق ${resolvedConfig.platformName} بنشر المواد الدراسية قريباً."
                            )
                        }
                    } else {
                        item {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                contentPadding = PaddingValues(vertical = 2.dp)
                            ) {
                                items(subjects, key = { it.id }) { subject ->
                                    SubjectCard(
                                        subject = subject,
                                        lessonCount = lessons.count { it.subjectId == subject.id },
                                        materialCount = materials.count { it.subjectId == subject.id },
                                        onClick = { onOpenSubject(subject.id) },
                                        modifier = Modifier.width(196.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Latest Lessons
            if (lessons.isNotEmpty()) {
                item { SectionHeader(title = stringResource(R.string.latest_lessons)) }
                items(lessons.sortedByDescending { it.createdAt?.seconds ?: 0L }.take(4), key = { it.id }) { lesson ->
                    LessonCard(
                        lesson = lesson,
                        progress = progressByLesson[lesson.id],
                        isFavorite = lesson.id in favoriteLessonIds,
                        onWatchClick = { onWatchLesson(lesson) },
                        onToggleFavorite = { onToggleFavoriteLesson(lesson) }
                    )
                }
            }

            // Latest Materials
            if (materials.isNotEmpty()) {
                item { SectionHeader(title = stringResource(R.string.latest_materials)) }
                items(materials.take(4), key = { it.id }) { mat ->
                    MaterialCard(
                        material = mat,
                        isFavorite = mat.id in favoriteMaterialIds,
                        isCachedOffline = PdfCacheManager.isPdfCachedOffline(context, mat.id),
                        onOpenPdf = { onOpenMaterial(mat) },
                        onDownloadClick = { onDownloadMaterial(mat) },
                        onShareClick = { onShareMaterial(mat) },
                        onToggleFavorite = { onToggleFavoriteMaterial(mat) }
                    )
                }
            }

            // Quick Favorites Section
            if (favorites.isNotEmpty()) {
                item {
                    SectionHeader(
                        title = stringResource(R.string.favorites_section),
                        actionLabel = "مكتبتي",
                        onActionClick = onOpenLibrary
                    )
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(favorites.take(6), key = { it.id }) { fav ->
                            Card(
                                modifier = Modifier
                                    .width(180.dp)
                                    .clickable {
                                        if (fav.parsedType() == FavoriteType.LESSON) {
                                            lessons.firstOrNull { it.id == fav.itemId }?.let(onWatchLesson)
                                        } else {
                                            materials.firstOrNull { it.id == fav.itemId }?.let(onOpenMaterial)
                                        }
                                    },
                                shape = RoundedCornerShape(14.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = fav.subjectName,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = secondaryColor
                                    )
                                    Text(
                                        text = fav.title,
                                        style = MaterialTheme.typography.titleSmall,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun StatChip(text: String) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = Color.White.copy(alpha = 0.16f)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}
