package com.example.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.example.data.model.Announcement
import com.example.data.model.FavoriteItem
import com.example.data.model.FavoriteType
import com.example.data.model.Lesson
import com.example.data.model.LessonProgress
import com.example.data.model.StudyMaterial
import com.example.data.model.UiState
import com.example.data.model.UserProfile
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.AbkSearchBar
import com.example.ui.components.AnnouncementBannerCard
import com.example.ui.components.InfoPill
import com.example.ui.components.LessonCard
import com.example.ui.components.MaterialCard
import com.example.ui.theme.AbkNavyDeep
import com.example.ui.theme.AbkSkyPrimary
import com.example.ui.theme.AbkSuccess
import com.example.util.NotificationHelper
import com.example.util.PdfCacheManager
import com.example.util.UrlUtils

@Composable
fun MyLibraryScreen(
    favoritesState: UiState<List<FavoriteItem>>,
    progressState: UiState<List<LessonProgress>>,
    lessons: List<Lesson>,
    materials: List<StudyMaterial>,
    onWatchLesson: (Lesson) -> Unit,
    onOpenMaterial: (StudyMaterial) -> Unit,
    onDownloadMaterial: (StudyMaterial) -> Unit,
    onShareMaterial: (StudyMaterial) -> Unit,
    onToggleFavoriteLesson: (Lesson) -> Unit,
    onToggleFavoriteMaterial: (StudyMaterial) -> Unit
) {
    val context = LocalContext.current
    var selectedTab by remember { mutableIntStateOf(0) }
    var filterQuery by remember { mutableStateOf("") }

    val favorites = (favoritesState as? UiState.Success)?.data.orEmpty()
    val progressList = (progressState as? UiState.Success)?.data.orEmpty()
    val favoriteLessonIds = favorites.filter { it.parsedType() == FavoriteType.LESSON }.map { it.itemId }.toSet()
    val favoriteMaterialIds = favorites.filter { it.parsedType() == FavoriteType.MATERIAL }.map { it.itemId }.toSet()
    val progressMap = progressList.associateBy { it.lessonId }
    val cachedIds = remember(materials, selectedTab) { PdfCacheManager.listCachedMaterialIds(context) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag("library_screen")
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "مكتبتي",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary
            )
            AbkSearchBar(
                query = filterQuery,
                onQueryChange = { filterQuery = it },
                placeholder = "ابحث في مكتبتك والمفضلة…"
            )
        }

        TabRow(selectedTabIndex = selectedTab) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = { Text("المفضلة (${favorites.size})") }
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = { Text("سجل الدروس (${progressList.size})") }
            )
            Tab(
                selected = selectedTab == 2,
                onClick = { selectedTab = 2 },
                text = { Text("المحفوظة أوفلاين") }
            )
        }

        when (selectedTab) {
            0 -> {
                if (favoritesState is UiState.Loading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else {
                    val filteredFavs = favorites.filter {
                        filterQuery.isBlank() ||
                            it.title.contains(filterQuery, ignoreCase = true) ||
                            it.subjectName.contains(filterQuery, ignoreCase = true)
                    }
                    if (filteredFavs.isEmpty()) {
                        AbkEmptyState(
                            title = "لا توجد عناصر في المفضلة",
                            subtitle = "اضغط على أيقونة القلب بجانب أي درس أو كتاب أو نوطة لحفظها هنا."
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(filteredFavs, key = { it.id }) { fav ->
                                if (fav.parsedType() == FavoriteType.LESSON) {
                                    val lesson = lessons.firstOrNull { it.id == fav.itemId }
                                    if (lesson != null) {
                                        LessonCard(
                                            lesson = lesson,
                                            progress = progressMap[lesson.id],
                                            isFavorite = true,
                                            onWatchClick = { onWatchLesson(lesson) },
                                            onToggleFavorite = { onToggleFavoriteLesson(lesson) }
                                        )
                                    }
                                } else {
                                    val mat = materials.firstOrNull { it.id == fav.itemId }
                                    if (mat != null) {
                                        MaterialCard(
                                            material = mat,
                                            isFavorite = true,
                                            isCachedOffline = PdfCacheManager.isPdfCachedOffline(context, mat.id),
                                            onOpenPdf = { onOpenMaterial(mat) },
                                            onDownloadClick = { onDownloadMaterial(mat) },
                                            onShareClick = { onShareMaterial(mat) },
                                            onToggleFavorite = { onToggleFavoriteMaterial(mat) }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            1 -> {
                val filteredProgress = progressList.filter {
                    filterQuery.isBlank() ||
                        it.lessonTitle.contains(filterQuery, ignoreCase = true) ||
                        it.subjectName.contains(filterQuery, ignoreCase = true)
                }
                if (filteredProgress.isEmpty()) {
                    AbkEmptyState(
                        title = "لم تشاهد أي درس بعد",
                        subtitle = "يتم حفظ آخر نقطة توقفت عندها والدروس المكتملة تلقائياً لمزامنتها بين أجهزتك."
                    )
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(filteredProgress, key = { it.id }) { prog ->
                            val lesson = lessons.firstOrNull { it.id == prog.lessonId }
                            if (lesson != null) {
                                LessonCard(
                                    lesson = lesson,
                                    progress = prog,
                                    isFavorite = lesson.id in favoriteLessonIds,
                                    onWatchClick = { onWatchLesson(lesson) },
                                    onToggleFavorite = { onToggleFavoriteLesson(lesson) }
                                )
                            } else {
                                Card(
                                    shape = RoundedCornerShape(16.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(Modifier.padding(14.dp)) {
                                        Text(prog.subjectName, style = MaterialTheme.typography.labelSmall, color = AbkSkyPrimary)
                                        Text(prog.lessonTitle, style = MaterialTheme.typography.titleMedium)
                                        Text(
                                            text = if (prog.completed) "مكتمل" else "توقفت عند ${UrlUtils.formatDurationMs(prog.lastPositionMs)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            2 -> {
                val offlineMaterials = materials.filter { mat ->
                    val safeId = mat.id.replace(Regex("[^a-zA-Z0-9_-]"), "_")
                    (safeId in cachedIds) && (
                        filterQuery.isBlank() ||
                            mat.title.contains(filterQuery, ignoreCase = true) ||
                            mat.subjectName.contains(filterQuery, ignoreCase = true)
                        )
                }
                if (offlineMaterials.isEmpty()) {
                    AbkEmptyState(
                        title = "لا توجد ملفات محفوظة محلياً",
                        subtitle = "عند فتح أو تنزيل أي ملف PDF سيتم حفظه هنا لتصفحه حتى عند انقطاع الإنترنت."
                    )
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(offlineMaterials, key = { it.id }) { mat ->
                            MaterialCard(
                                material = mat,
                                isFavorite = mat.id in favoriteMaterialIds,
                                isCachedOffline = true,
                                onOpenPdf = { onOpenMaterial(mat) },
                                onDownloadClick = { onDownloadMaterial(mat) },
                                onShareClick = { onShareMaterial(mat) },
                                onToggleFavorite = { onToggleFavoriteMaterial(mat) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun NotificationsScreen(
    announcementsState: UiState<List<Announcement>>,
    readIds: Set<String>,
    onAnnouncementClick: (Announcement) -> Unit,
    onMarkAllRead: () -> Unit
) {
    val context = LocalContext.current
    var hasNotifPermission by remember {
        mutableStateOf(NotificationHelper.hasNotificationPermission(context))
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasNotifPermission = granted
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("notifications_screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "الإشعارات والتنبيهات",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary
            )
            TextButton(
                onClick = onMarkAllRead,
                modifier = Modifier.testTag("mark_all_read_btn")
            ) {
                Icon(Icons.Filled.DoneAll, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("قراءة الكل")
            }
        }

        if (!hasNotifPermission && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.NotificationsActive,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text("تفعيل تنبيهات الجهاز", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "اسمح بالإشعارات لتصلك تنبيهات الدروس والملفات الجديدة فوراً.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    Button(
                        onClick = {
                            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        },
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("تفعيل")
                    }
                }
            }
        }

        when (announcementsState) {
            UiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            is UiState.Error -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(announcementsState.message, color = MaterialTheme.colorScheme.error)
            }
            is UiState.Success -> {
                if (announcementsState.data.isEmpty()) {
                    AbkEmptyState(
                        title = "لا توجد إشعارات حالياً",
                        subtitle = "ستصل هنا تنبيهات الدروس الجديدة والنوطات والإعلانات من إدارة منصة ABK."
                    )
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(bottom = 24.dp)
                    ) {
                        items(announcementsState.data, key = { it.id }) { ann ->
                            AnnouncementBannerCard(
                                announcement = ann,
                                isUnread = ann.id !in readIds,
                                onClick = { onAnnouncementClick(ann) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AccountScreen(
    userProfile: UserProfile?,
    isAdmin: Boolean,
    favoritesCount: Int,
    watchedCount: Int,
    completedCount: Int,
    onOpenAdminPanel: () -> Unit,
    onSignOut: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .testTag("account_screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "حسابي",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary
        )

        Card(
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(18.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                if (!userProfile?.photoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = userProfile?.photoUrl,
                        contentDescription = "صورة الحساب",
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(64.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Filled.Person,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(34.dp)
                            )
                        }
                    }
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = userProfile?.displayName?.ifBlank { "طالب ABK" } ?: "طالب ABK",
                        style = MaterialTheme.typography.titleLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (!userProfile?.email.isNullOrBlank()) {
                        Text(
                            text = userProfile!!.email,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        InfoPill(
                            text = if (isAdmin) "مدير المنصة" else "حساب طالب متزامن",
                            containerColor = if (isAdmin) AbkNavyDeep else MaterialTheme.colorScheme.primaryContainer,
                            contentColor = if (isAdmin) Color.White else MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }
        }

        // Student Progress Summary
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            AccountStatCard(
                label = "دروس تمت مشاهدتها",
                value = watchedCount.toString(),
                icon = Icons.Filled.PlayCircleFilled,
                tint = AbkSkyPrimary,
                modifier = Modifier.weight(1f)
            )
            AccountStatCard(
                label = "دروس مكتملة",
                value = completedCount.toString(),
                icon = Icons.Filled.CheckCircle,
                tint = AbkSuccess,
                modifier = Modifier.weight(1f)
            )
            AccountStatCard(
                label = "المفضلة",
                value = favoritesCount.toString(),
                icon = Icons.Filled.Favorite,
                tint = Color(0xFFE11D48),
                modifier = Modifier.weight(1f)
            )
        }

        // STRICTLY ADMIN-ONLY SECTION — Completely invisible to regular students
        if (isAdmin) {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = AbkNavyDeep),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("admin_entry_card")
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.AdminPanelSettings,
                            contentDescription = null,
                            tint = Color(0xFF38BDF8),
                            modifier = Modifier.size(28.dp)
                        )
                        Column {
                            Text(
                                text = "لوحة تحكم المدير المنفصلة",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = Color.White
                            )
                            Text(
                                text = "إدارة المواد، الدروس، ملفات PDF، الإعلانات، وحسابات الطلاب.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.82f)
                            )
                        }
                    }
                    Button(
                        onClick = onOpenAdminPanel,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .testTag("open_admin_panel_btn"),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = AbkSkyPrimary)
                    ) {
                        Text("فتح لوحة التحكم الإدارية", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }

        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Filled.DownloadDone,
                    contentDescription = null,
                    tint = AbkSuccess
                )
                Column {
                    Text("مزامنة تلقائية مجانية", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "جميع مفضلاتك وتقدمك الدراسي محفوظ ومزامن تلقائياً عبر حسابك.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .testTag("sign_out_button"),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.6f))
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Logout,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = "تسجيل الخروج",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}

@Composable
private fun AccountStatCard(
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
            Text(text = value, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
