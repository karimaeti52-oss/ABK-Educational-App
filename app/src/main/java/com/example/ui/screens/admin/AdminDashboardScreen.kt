package com.example.ui.screens.admin

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.model.AccountStatus
import com.example.data.model.Announcement
import com.example.data.model.Lesson
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.UiState
import com.example.data.model.UserProfile
import com.example.data.model.UserRole
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.AbkSearchBar
import com.example.ui.components.InfoPill
import com.example.ui.theme.AbkNavyDeep
import com.example.ui.theme.AbkSkyPrimary
import com.example.ui.theme.AbkSuccess
import com.example.viewmodel.AdminViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    adminViewModel: AdminViewModel,
    currentUserId: String,
    onBack: () -> Unit
) {
    val subjectsState by adminViewModel.subjectsState.collectAsStateWithLifecycle()
    val lessonsState by adminViewModel.lessonsState.collectAsStateWithLifecycle()
    val materialsState by adminViewModel.materialsState.collectAsStateWithLifecycle()
    val announcementsState by adminViewModel.announcementsState.collectAsStateWithLifecycle()
    val usersState by adminViewModel.usersState.collectAsStateWithLifecycle()

    val subjects = (subjectsState as? UiState.Success)?.data.orEmpty()
    val lessons = (lessonsState as? UiState.Success)?.data.orEmpty()
    val materials = (materialsState as? UiState.Success)?.data.orEmpty()
    val announcements = (announcementsState as? UiState.Success)?.data.orEmpty()
    val users = (usersState as? UiState.Success)?.data.orEmpty()

    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(Unit) {
        adminViewModel.events.collect { msg ->
            snackbarHostState.showSnackbar(msg)
        }
    }

    var selectedTab by remember { mutableIntStateOf(0) }
    var editingSubject by remember { mutableStateOf<Subject?>(null) }
    var showSubjectDialog by remember { mutableStateOf(false) }

    var editingLesson by remember { mutableStateOf<Lesson?>(null) }
    var showLessonDialog by remember { mutableStateOf(false) }

    var editingMaterial by remember { mutableStateOf<StudyMaterial?>(null) }
    var showMaterialDialog by remember { mutableStateOf(false) }

    var editingAnnouncement by remember { mutableStateOf<Announcement?>(null) }
    var showAnnouncementDialog by remember { mutableStateOf(false) }

    var deleteConfirmAction by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) }
    var studentSearch by remember { mutableStateOf("") }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("لوحة تحكم المدير — ABK", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "إدارة كاملة وآمنة للمنصة بدون كود",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("admin_back_btn")) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = AbkNavyDeep,
                    titleContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            if (selectedTab in 0..3) {
                FloatingActionButton(
                    onClick = {
                        when (selectedTab) {
                            0 -> { editingSubject = null; showSubjectDialog = true }
                            1 -> {
                                if (subjects.isEmpty()) {
                                    adminViewModel.seedCoreSubjects()
                                } else {
                                    editingLesson = null; showLessonDialog = true
                                }
                            }
                            2 -> {
                                if (subjects.isEmpty()) {
                                    adminViewModel.seedCoreSubjects()
                                } else {
                                    editingMaterial = null; showMaterialDialog = true
                                }
                            }
                            3 -> { editingAnnouncement = null; showAnnouncementDialog = true }
                        }
                    },
                    containerColor = AbkSkyPrimary,
                    contentColor = Color.White,
                    modifier = Modifier.testTag("admin_add_fab")
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "إضافة")
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .testTag("admin_dashboard_screen")
        ) {
            // Live KPIs strip
            val activeStudentsCount = users.count { it.parsedStatus() == AccountStatus.ACTIVE }
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                item { KpiPill("المستخدمون", users.size.toString()) }
                item { KpiPill("النشطون", activeStudentsCount.toString()) }
                item { KpiPill("المواد", subjects.size.toString()) }
                item { KpiPill("الدروس", lessons.size.toString()) }
                item { KpiPill("ملفات PDF", materials.size.toString()) }
                item { KpiPill("الإعلانات", announcements.size.toString()) }
            }

            val tabs = listOf("المواد", "الدروس", "ملفات PDF", "الإعلانات", "الطلاب")
            ScrollableTabRow(selectedTabIndex = selectedTab, edgePadding = 12.dp) {
                tabs.forEachIndexed { idx, label ->
                    Tab(
                        selected = selectedTab == idx,
                        onClick = { selectedTab = idx },
                        text = { Text(label) }
                    )
                }
            }

            when (selectedTab) {
                0 -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        item {
                            FilledTonalButton(
                                onClick = { adminViewModel.seedCoreSubjects() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("seed_subjects_btn"),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Icon(Icons.Filled.AutoAwesome, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("إضافة المواد الثمانية الأساسية تلقائياً")
                            }
                        }
                        if (subjects.isEmpty()) {
                            item {
                                AbkEmptyState(
                                    title = "لا توجد مواد بعد",
                                    subtitle = "اضغط الزر أعلاه لإضافة الرياضيات والتحليل والعربية والفيزياء وغيرها بضغطة واحدة."
                                )
                            }
                        } else {
                            items(subjects, key = { it.id }) { subject ->
                                AdminItemCard(
                                    title = "${subject.sortOrder}. ${subject.title}",
                                    subtitle = subject.description,
                                    badge = if (subject.published) "منشورة" else "مخفية",
                                    badgeSuccess = subject.published,
                                    onEdit = { editingSubject = subject; showSubjectDialog = true },
                                    onDelete = {
                                        deleteConfirmAction = "حذف مادة ${subject.title}؟" to {
                                            adminViewModel.deleteSubject(subject.id)
                                        }
                                    }
                                )
                            }
                        }
                        item { Spacer(Modifier.height(72.dp)) }
                    }
                }

                1 -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (lessons.isEmpty()) {
                            item {
                                AbkEmptyState(
                                    title = "لا توجد دروس فيديو بعد",
                                    subtitle = "اضغط زر + لإضافة درس من YouTube أو MP4 أو استضافة خارجية."
                                )
                            }
                        } else {
                            items(lessons, key = { it.id }) { lesson ->
                                AdminItemCard(
                                    title = lesson.title,
                                    subtitle = "${lesson.subjectName} • ${lesson.unitTitle} • ${lesson.parsedVideoType().labelAr}",
                                    badge = if (lesson.published) "منشور" else "مخفي",
                                    badgeSuccess = lesson.published,
                                    extraAction = {
                                        IconButton(onClick = { adminViewModel.toggleLessonPublished(lesson) }) {
                                            Icon(
                                                imageVector = if (lesson.published) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                                contentDescription = "نشر أو إخفاء",
                                                tint = AbkSkyPrimary
                                            )
                                        }
                                    },
                                    onEdit = { editingLesson = lesson; showLessonDialog = true },
                                    onDelete = {
                                        deleteConfirmAction = "حذف درس ${lesson.title}؟" to {
                                            adminViewModel.deleteLesson(lesson.id)
                                        }
                                    }
                                )
                            }
                        }
                        item { Spacer(Modifier.height(72.dp)) }
                    }
                }

                2 -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (materials.isEmpty()) {
                            item {
                                AbkEmptyState(
                                    title = "لا توجد ملفات PDF بعد",
                                    subtitle = "اضغط زر + لإضافة كتاب مدرسي أو نوطة أو ملخص أو امتحان تدريبي."
                                )
                            }
                        } else {
                            items(materials, key = { it.id }) { mat ->
                                AdminItemCard(
                                    title = mat.title,
                                    subtitle = "${mat.subjectName} • ${mat.parsedType().labelAr}",
                                    badge = if (mat.published) "منشور" else "مخفي",
                                    badgeSuccess = mat.published,
                                    onEdit = { editingMaterial = mat; showMaterialDialog = true },
                                    onDelete = {
                                        deleteConfirmAction = "حذف ملف ${mat.title}؟" to {
                                            adminViewModel.deleteMaterial(mat.id)
                                        }
                                    }
                                )
                            }
                        }
                        item { Spacer(Modifier.height(72.dp)) }
                    }
                }

                3 -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (announcements.isEmpty()) {
                            item {
                                AbkEmptyState(
                                    title = "لا توجد إعلانات بعد",
                                    subtitle = "اضغط زر + لإرسال إشعار وتنبيه مجاني وفوري لجميع الطلاب داخل التطبيق."
                                )
                            }
                        } else {
                            items(announcements, key = { it.id }) { ann ->
                                AdminItemCard(
                                    title = ann.title,
                                    subtitle = "${ann.parsedCategory().labelAr} • ${ann.body}",
                                    badge = if (ann.pinned) "مثبت" else "عادي",
                                    badgeSuccess = ann.published,
                                    onEdit = { editingAnnouncement = ann; showAnnouncementDialog = true },
                                    onDelete = {
                                        deleteConfirmAction = "حذف إعلان ${ann.title}؟" to {
                                            adminViewModel.deleteAnnouncement(ann.id)
                                        }
                                    }
                                )
                            }
                        }
                        item { Spacer(Modifier.height(72.dp)) }
                    }
                }

                4 -> {
                    val filteredUsers = users.filter {
                        studentSearch.isBlank() ||
                            it.displayName.contains(studentSearch, ignoreCase = true) ||
                            it.email.contains(studentSearch, ignoreCase = true)
                    }
                    Column(modifier = Modifier.fillMaxSize()) {
                        Box(modifier = Modifier.padding(16.dp)) {
                            AbkSearchBar(
                                query = studentSearch,
                                onQueryChange = { studentSearch = it },
                                placeholder = "ابحث عن طالب بالاسم أو البريد…"
                            )
                        }
                        if (filteredUsers.isEmpty()) {
                            AbkEmptyState(
                                title = "لا يوجد طلاب مطابقون",
                                subtitle = "سيظهر هنا الطلاب فور تسجيل دخولهم في التطبيق."
                            )
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                items(filteredUsers, key = { it.userId }) { user ->
                                    val isSelf = user.userId == currentUserId
                                    val parsedStatus = user.parsedStatus()
                                    val isBlocked = parsedStatus == AccountStatus.SUSPENDED || parsedStatus == AccountStatus.BANNED
                                    val isUserAdmin = user.parsedRole() == UserRole.ADMIN
                                    Card(
                                        shape = RoundedCornerShape(16.dp),
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(14.dp),
                                            verticalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(user.displayName, style = MaterialTheme.typography.titleMedium)
                                                    Text(
                                                        user.email,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                                    )
                                                }
                                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    InfoPill(
                                                        text = if (isUserAdmin) "مدير" else "طالب",
                                                        containerColor = if (isUserAdmin) AbkNavyDeep else MaterialTheme.colorScheme.primaryContainer,
                                                        contentColor = if (isUserAdmin) Color.White else MaterialTheme.colorScheme.onPrimaryContainer
                                                    )
                                                    InfoPill(
                                                        text = parsedStatus.labelAr,
                                                        containerColor = if (isBlocked) MaterialTheme.colorScheme.errorContainer else Color(0xFFD1FAE5),
                                                        contentColor = if (isBlocked) MaterialTheme.colorScheme.error else AbkSuccess
                                                    )
                                                }
                                            }
                                            if (!isSelf) {
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    OutlinedButton(
                                                        onClick = { adminViewModel.toggleUserSuspension(user) },
                                                        shape = RoundedCornerShape(10.dp),
                                                        colors = ButtonDefaults.outlinedButtonColors(
                                                            contentColor = if (isBlocked) AbkSuccess else MaterialTheme.colorScheme.error
                                                        )
                                                    ) {
                                                        Icon(
                                                            imageVector = if (isBlocked) Icons.Filled.CheckCircle else Icons.Filled.Block,
                                                            contentDescription = null,
                                                            modifier = Modifier.size(16.dp)
                                                        )
                                                        Spacer(Modifier.width(4.dp))
                                                        Text(if (isBlocked) "تفعيل الحساب" else "تعطيل الحساب")
                                                    }
                                                    TextButton(
                                                        onClick = { adminViewModel.toggleAdminPrivilege(user, !isUserAdmin) }
                                                    ) {
                                                        Text(if (isUserAdmin) "إلغاء الإدارة" else "ترقية لمدير")
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                item { Spacer(Modifier.height(24.dp)) }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showSubjectDialog) {
        SubjectEditorDialog(
            initial = editingSubject,
            onDismiss = { showSubjectDialog = false },
            onSave = { title, desc, imgUrl, iconKey, order, pub ->
                adminViewModel.saveSubject(editingSubject?.id, title, desc, imgUrl, iconKey, order, pub)
                showSubjectDialog = false
            }
        )
    }

    if (showLessonDialog) {
        LessonEditorDialog(
            initial = editingLesson,
            subjects = subjects,
            onDismiss = { showLessonDialog = false },
            onSave = { subj, unit, unitOrder, lessonOrder, title, desc, teacher, dur, thumb, videoUrl, type, pub ->
                adminViewModel.saveLesson(
                    editingLesson?.id, subj, unit, unitOrder, lessonOrder, title, desc, teacher, dur, thumb, videoUrl, type, pub
                )
                showLessonDialog = false
            }
        )
    }

    if (showMaterialDialog) {
        MaterialEditorDialog(
            initial = editingMaterial,
            subjects = subjects,
            lessons = lessons,
            onDismiss = { showMaterialDialog = false },
            onSave = { subj, lesson, type, title, desc, cover, fileUrl, pub ->
                adminViewModel.saveMaterial(
                    editingMaterial?.id, subj, lesson, type, title, desc, cover, fileUrl, pub
                )
                showMaterialDialog = false
            }
        )
    }

    if (showAnnouncementDialog) {
        AnnouncementEditorDialog(
            initial = editingAnnouncement,
            subjects = subjects,
            onDismiss = { showAnnouncementDialog = false },
            onSave = { title, body, category, subjId, pinned, pub ->
                adminViewModel.saveAnnouncement(
                    editingAnnouncement?.id, title, body, category, subjId, pinned, pub
                )
                showAnnouncementDialog = false
            }
        )
    }

    deleteConfirmAction?.let { (message, action) ->
        AlertDialog(
            onDismissRequest = { deleteConfirmAction = null },
            title = { Text("تأكيد الحذف") },
            text = { Text(message) },
            confirmButton = {
                Button(
                    onClick = {
                        action()
                        deleteConfirmAction = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("حذف")
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteConfirmAction = null }) { Text("إلغاء") }
            }
        )
    }
}

@Composable
private fun KpiPill(label: String, value: String) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), color = AbkNavyDeep)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AdminItemCard(
    title: String,
    subtitle: String,
    badge: String,
    badgeSuccess: Boolean,
    extraAction: @Composable (() -> Unit)? = null,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    InfoPill(
                        text = badge,
                        containerColor = if (badgeSuccess) Color(0xFFD1FAE5) else MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = if (badgeSuccess) AbkSuccess else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle.isNotBlank()) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            extraAction?.invoke()
            IconButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, contentDescription = "تعديل", tint = AbkNavyDeep)
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "حذف", tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}
