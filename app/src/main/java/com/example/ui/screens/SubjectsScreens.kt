package com.example.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.data.model.FavoriteItem
import com.example.data.model.FavoriteType
import com.example.data.model.Lesson
import com.example.data.model.LessonProgress
import com.example.data.model.MaterialType
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.UiState
import com.example.data.model.UnitItem
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.AbkSearchBar
import com.example.ui.components.LessonCard
import com.example.ui.components.MaterialCard
import com.example.ui.components.SubjectCard
import com.example.ui.components.subjectVisuals
import com.example.ui.theme.AbkNavyDeep
import com.example.util.PdfCacheManager

@Composable
fun SubjectsScreen(
    subjectsState: UiState<List<Subject>>,
    lessons: List<Lesson>,
    materials: List<StudyMaterial>,
    onOpenSubject: (String) -> Unit
) {
    var localSearch by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("subjects_screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "المواد الدراسية",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary
        )
        AbkSearchBar(
            query = localSearch,
            onQueryChange = { localSearch = it },
            placeholder = "ابحث عن مادة دراسية…"
        )

        when (subjectsState) {
            UiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            is UiState.Error -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(subjectsState.message, color = MaterialTheme.colorScheme.error)
            }
            is UiState.Success -> {
                val filtered = subjectsState.data.filter {
                    localSearch.isBlank() ||
                        it.title.contains(localSearch, ignoreCase = true) ||
                        it.description.contains(localSearch, ignoreCase = true)
                }
                if (filtered.isEmpty()) {
                    AbkEmptyState(
                        title = "لا توجد مواد مطابقة",
                        subtitle = "ستظهر هنا جميع المواد الدراسية فور نشرها من لوحة التحكم."
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 164.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        contentPadding = PaddingValues(bottom = 24.dp)
                    ) {
                        items(filtered, key = { it.id }) { subject ->
                            SubjectCard(
                                subject = subject,
                                lessonCount = lessons.count { it.subjectId == subject.id },
                                materialCount = materials.count { it.subjectId == subject.id },
                                onClick = { onOpenSubject(subject.id) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubjectDetailScreen(
    subject: Subject?,
    lessons: List<Lesson>,
    materials: List<StudyMaterial>,
    favorites: List<FavoriteItem>,
    progressList: List<LessonProgress>,
    onBack: () -> Unit,
    onWatchLesson: (Lesson) -> Unit,
    onOpenMaterial: (StudyMaterial) -> Unit,
    onDownloadMaterial: (StudyMaterial) -> Unit,
    onShareMaterial: (StudyMaterial) -> Unit,
    onToggleFavoriteLesson: (Lesson) -> Unit,
    onToggleFavoriteMaterial: (StudyMaterial) -> Unit,
    units: List<UnitItem> = emptyList()
) {
    val context = LocalContext.current
    var selectedTab by remember { mutableIntStateOf(0) }
    var selectedMaterialFilter by remember { mutableStateOf<MaterialType?>(null) }

    val favoriteLessonIds = favorites.filter { it.parsedType() == FavoriteType.LESSON }.map { it.itemId }.toSet()
    val favoriteMaterialIds = favorites.filter { it.parsedType() == FavoriteType.MATERIAL }.map { it.itemId }.toSet()
    val progressMap = progressList.associateBy { it.lessonId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = subject?.title ?: "تفاصيل المادة",
                        style = MaterialTheme.typography.titleLarge
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("subject_detail_back_btn")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { innerPadding ->
        if (subject == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                AbkEmptyState(
                    title = "المادة غير متوفرة",
                    subtitle = "ربما تم حذف المادة أو إخفاؤها من لوحة التحكم."
                )
            }
            return@Scaffold
        }

        val (_, accent, fallbackRes) = subjectVisuals(subject.iconKey)
        val unitTitleById = remember(units) { units.associate { it.id to it.title } }
        val unitOrderById = remember(units) { units.associate { it.id to it.sortOrder } }
        val groupedLessons = remember(lessons, units) {
            lessons.sortedWith(
                compareBy<Lesson> { it.unitId?.let { id -> unitOrderById[id] } ?: it.unitOrder }
                    .thenBy { it.lessonOrder }
            ).groupBy { lesson ->
                val explicitUnit = lesson.unitId?.let { unitTitleById[it] }
                explicitUnit?.ifBlank { null } ?: lesson.unitTitle.ifBlank { "الدروس" }
            }
        }
        val filteredMaterials = remember(materials, selectedMaterialFilter) {
            if (selectedMaterialFilter == null) materials
            else materials.filter { it.parsedType() == selectedMaterialFilter }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(130.dp)
            ) {
                if (!subject.imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = subject.imageUrl,
                        contentDescription = subject.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                        error = painterResource(id = fallbackRes)
                    )
                } else {
                    Image(
                        painter = painterResource(id = fallbackRes),
                        contentDescription = subject.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.verticalGradient(listOf(Color.Transparent, AbkNavyDeep.copy(alpha = 0.88f))))
                )
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(16.dp)
                ) {
                    Text(
                        text = subject.title,
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = Color.White
                    )
                    if (subject.description.isNotBlank()) {
                        Text(
                            text = subject.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.9f)
                        )
                    }
                }
            }

            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("الدروس (${lessons.size})") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("الكتب والملفات (${materials.size})") }
                )
            }

            if (selectedTab == 0) {
                if (lessons.isEmpty()) {
                    AbkEmptyState(
                        title = "لا توجد دروس في هذه المادة بعد",
                        subtitle = "سيتم عرض الفيديوهات التعليمية هنا مرتبة حسب الفصول والوحدات."
                    )
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        groupedLessons.forEach { (unitTitle, unitLessons) ->
                            item(key = "unit_$unitTitle") {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = accent.copy(alpha = 0.1f),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = unitTitle,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = accent
                                        )
                                        Text(
                                            text = "${unitLessons.size} درس",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = accent
                                        )
                                    }
                                }
                            }
                            items(unitLessons, key = { it.id }) { lesson ->
                                LessonCard(
                                    lesson = lesson,
                                    progress = progressMap[lesson.id],
                                    isFavorite = lesson.id in favoriteLessonIds,
                                    onWatchClick = { onWatchLesson(lesson) },
                                    onToggleFavorite = { onToggleFavoriteLesson(lesson) }
                                )
                            }
                        }
                        item { Spacer(Modifier.height(16.dp)) }
                    }
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            FilterChip(
                                selected = selectedMaterialFilter == null,
                                onClick = { selectedMaterialFilter = null },
                                label = { Text("الكل") },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                                    selectedLabelColor = Color.White
                                )
                            )
                        }
                        items(MaterialType.entries) { type ->
                            FilterChip(
                                selected = selectedMaterialFilter == type,
                                onClick = {
                                    selectedMaterialFilter = if (selectedMaterialFilter == type) null else type
                                },
                                label = { Text(type.labelAr) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                                    selectedLabelColor = Color.White
                                )
                            )
                        }
                    }

                    if (filteredMaterials.isEmpty()) {
                        AbkEmptyState(
                            title = "لا توجد ملفات في هذا التصنيف",
                            subtitle = "تظهر هنا الكتب المدرسية والنوطات والملخصات وأوراق العمل والامتحانات."
                        )
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(filteredMaterials, key = { it.id }) { mat ->
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
                            item { Spacer(Modifier.height(16.dp)) }
                        }
                    }
                }
            }
        }
    }
}
