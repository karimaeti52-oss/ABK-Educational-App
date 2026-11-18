package com.example.ui

import android.app.Application
import android.content.Intent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmarks
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.Bookmarks
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.credentials.CredentialManager
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.R
import com.example.data.firebase.authStateFlow
import com.example.data.firebase.signOutUser
import com.example.data.model.AccountStatus
import com.example.data.model.FavoriteType
import com.example.data.model.Lesson
import com.example.data.model.StudyMaterial
import com.example.data.model.UiState
import com.example.data.repository.AbkContentRepository
import com.example.data.repository.AdminRepository
import com.example.data.repository.StudentRepository
import com.example.ui.components.OfflineStatusBanner
import com.example.ui.screens.AccountScreen
import com.example.ui.screens.AuthScreen
import com.example.ui.screens.HomeScreen
import com.example.ui.screens.MyLibraryScreen
import com.example.ui.screens.NotificationsScreen
import com.example.ui.screens.PdfViewerScreen
import com.example.ui.screens.SubjectDetailScreen
import com.example.ui.screens.SubjectsScreen
import com.example.ui.screens.SuspendedAccountScreen
import com.example.ui.screens.VideoPlayerScreen
import com.example.ui.screens.admin.AdminDashboardScreen
import com.example.util.NetworkMonitor
import com.example.util.NotificationHelper
import com.example.util.PdfCacheManager
import com.example.viewmodel.AdminViewModel
import com.example.viewmodel.MainViewModel
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.launch

object NavRoutes {
    const val HOME = "home"
    const val SUBJECTS = "subjects"
    const val LIBRARY = "library"
    const val NOTIFICATIONS = "notifications"
    const val ACCOUNT = "account"
    const val SUBJECT_DETAIL = "subject_detail/{subjectId}"
    const val VIDEO_PLAYER = "video_player/{lessonId}"
    const val PDF_VIEWER = "pdf_viewer/{materialId}"
    const val ADMIN_DASHBOARD = "admin_dashboard"

    fun subjectDetail(subjectId: String) = "subject_detail/$subjectId"
    fun videoPlayer(lessonId: String) = "video_player/$lessonId"
    fun pdfViewer(materialId: String) = "pdf_viewer/$materialId"
}

private data class BottomTab(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
)

private val studentTabs = listOf(
    BottomTab(NavRoutes.HOME, "الرئيسية", Icons.Filled.Home, Icons.Outlined.Home),
    BottomTab(NavRoutes.SUBJECTS, "المواد", Icons.Filled.MenuBook, Icons.Outlined.MenuBook),
    BottomTab(NavRoutes.LIBRARY, "مكتبتي", Icons.Filled.Bookmarks, Icons.Outlined.Bookmarks),
    BottomTab(NavRoutes.NOTIFICATIONS, "الإشعارات", Icons.Filled.Notifications, Icons.Outlined.Notifications),
    BottomTab(NavRoutes.ACCOUNT, "حسابي", Icons.Filled.Person, Icons.Outlined.Person)
)

@Composable
fun AbkAppNavigation(auth: FirebaseAuth = Firebase.auth) {
    val currentUser by auth.authStateFlow().collectAsStateWithLifecycle(initialValue = auth.currentUser)
    val user = currentUser

    if (user == null) {
        AuthScreen(onAuthSuccess = {})
    } else {
        key(user.uid) {
            AuthenticatedAbkApp(firebaseUser = user)
        }
    }
}

@Composable
private fun AuthenticatedAbkApp(firebaseUser: FirebaseUser) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val credentialManager = remember { CredentialManager.create(context) }

    val mainViewModel: MainViewModel = viewModel(
        key = firebaseUser.uid,
        factory = viewModelFactory {
            initializer {
                val app = checkNotNull(this[APPLICATION_KEY]) as Application
                val dbId = app.getString(R.string.firestore_database_id)
                val db = FirebaseFirestore.getInstance(dbId)
                MainViewModel(
                    contentRepository = AbkContentRepository(db),
                    studentRepository = StudentRepository(db),
                    currentUserId = firebaseUser.uid,
                    currentUserEmail = firebaseUser.email,
                    isEmailVerified = firebaseUser.isEmailVerified,
                    firebaseUser = firebaseUser
                )
            }
        }
    )

    val userProfile by mainViewModel.userProfile.collectAsStateWithLifecycle()
    val isAdmin by mainViewModel.isAdmin.collectAsStateWithLifecycle()
    val isOnline by NetworkMonitor.observeIsOnline(context).collectAsStateWithLifecycle(initialValue = true)

    // If account was disabled by admin, lock to Suspended screen
    if (userProfile?.parsedStatus() == AccountStatus.SUSPENDED) {
        SuspendedAccountScreen(
            onSignOut = {
                signOutUser(credentialManager, scope)
            }
        )
        return
    }

    val subjectsState by mainViewModel.subjectsState.collectAsStateWithLifecycle()
    val lessonsState by mainViewModel.lessonsState.collectAsStateWithLifecycle()
    val materialsState by mainViewModel.materialsState.collectAsStateWithLifecycle()
    val announcementsState by mainViewModel.announcementsState.collectAsStateWithLifecycle()
    val favoritesState by mainViewModel.favoritesState.collectAsStateWithLifecycle()
    val progressState by mainViewModel.progressState.collectAsStateWithLifecycle()
    val readIds by mainViewModel.readAnnouncementIds.collectAsStateWithLifecycle()
    val unreadCount by mainViewModel.unreadAnnouncementsCount.collectAsStateWithLifecycle()
    val searchQuery by mainViewModel.searchQuery.collectAsStateWithLifecycle()
    val searchResults by mainViewModel.searchResults.collectAsStateWithLifecycle()

    val subjects = (subjectsState as? UiState.Success)?.data.orEmpty()
    val lessons = (lessonsState as? UiState.Success)?.data.orEmpty()
    val materials = (materialsState as? UiState.Success)?.data.orEmpty()
    val announcements = (announcementsState as? UiState.Success)?.data.orEmpty()
    val favorites = (favoritesState as? UiState.Success)?.data.orEmpty()
    val progressList = (progressState as? UiState.Success)?.data.orEmpty()

    // Trigger local notification alert for newly arriving unread announcements during active session
    var knownAnnouncementIds by remember { mutableStateOf<Set<String>?>(null) }
    LaunchedEffect(announcements, readIds) {
        val currentIds = announcements.map { it.id }.toSet()
        val previous = knownAnnouncementIds
        if (previous == null) {
            knownAnnouncementIds = currentIds
        } else {
            val newlyAdded = announcements.filter { it.id !in previous && it.id !in readIds }
            newlyAdded.take(2).forEach { ann ->
                NotificationHelper.showAnnouncementNotification(
                    context = context,
                    notificationId = ann.id.hashCode(),
                    title = ann.title,
                    body = ann.body
                )
            }
            knownAnnouncementIds = currentIds
        }
    }

    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(Unit) {
        mainViewModel.snackbarEvents.collect { msg ->
            snackbarHostState.showSnackbar(msg)
        }
    }

    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    val showBottomBar = currentRoute in setOf(
        NavRoutes.HOME,
        NavRoutes.SUBJECTS,
        NavRoutes.LIBRARY,
        NavRoutes.NOTIFICATIONS,
        NavRoutes.ACCOUNT
    )

    val downloadMaterialAction: (StudyMaterial) -> Unit = { mat ->
        scope.launch {
            mainViewModel.showMessage("جاري تنزيل ${mat.title}…")
            val result = PdfCacheManager.exportPdfToDownloads(
                context = context,
                materialId = mat.id,
                title = mat.title,
                rawUrl = mat.fileUrl
            )
            result.onSuccess { msg -> mainViewModel.showMessage(msg) }
                .onFailure { err -> mainViewModel.showMessage(err.localizedMessage ?: "تعذر تنزيل الملف") }
        }
    }

    val shareMaterialAction: (StudyMaterial) -> Unit = { mat ->
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, mat.title)
            putExtra(Intent.EXTRA_TEXT, "${mat.title} (${mat.subjectName}) - منصة ABK التعليمية:\n${mat.fileUrl}")
        }
        context.startActivity(Intent.createChooser(sendIntent, "مشاركة رابط الملف"))
    }

    val toggleFavoriteLesson: (Lesson) -> Unit = { lesson ->
        mainViewModel.toggleFavorite(
            itemId = lesson.id,
            itemType = FavoriteType.LESSON,
            title = lesson.title,
            subtitle = lesson.unitTitle,
            subjectName = lesson.subjectName,
            imageUrl = lesson.thumbnailUrl
        )
    }

    val toggleFavoriteMaterial: (StudyMaterial) -> Unit = { mat ->
        mainViewModel.toggleFavorite(
            itemId = mat.id,
            itemType = FavoriteType.MATERIAL,
            title = mat.title,
            subtitle = mat.parsedType().labelAr,
            subjectName = mat.subjectName,
            imageUrl = mat.coverUrl
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        contentWindowInsets = WindowInsets.safeDrawing,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface
                ) {
                    studentTabs.forEach { tab ->
                        val selected = currentRoute == tab.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                if (tab.route == NavRoutes.NOTIFICATIONS && unreadCount > 0) {
                                    BadgedBox(
                                        badge = {
                                            Badge {
                                                Text(if (unreadCount > 9) "+9" else unreadCount.toString())
                                            }
                                        }
                                    ) {
                                        Icon(
                                            imageVector = if (selected) tab.selectedIcon else tab.unselectedIcon,
                                            contentDescription = tab.label
                                        )
                                    }
                                } else {
                                    Icon(
                                        imageVector = if (selected) tab.selectedIcon else tab.unselectedIcon,
                                        contentDescription = tab.label
                                    )
                                }
                            },
                            label = {
                                Text(
                                    text = tab.label,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            modifier = Modifier.testTag("nav_${tab.route}")
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            OfflineStatusBanner(isOnline = isOnline)
            Box(modifier = Modifier.weight(1f)) {
                NavHost(
                    navController = navController,
                    startDestination = NavRoutes.HOME
                ) {
                    composable(NavRoutes.HOME) {
                        HomeScreen(
                            userProfile = userProfile,
                            isAdmin = isAdmin,
                            searchQuery = searchQuery,
                            onSearchQueryChange = mainViewModel::updateSearchQuery,
                            searchResults = searchResults,
                            subjectsState = subjectsState,
                            lessonsState = lessonsState,
                            materialsState = materialsState,
                            announcementsState = announcementsState,
                            favoritesState = favoritesState,
                            progressState = progressState,
                            readAnnouncementIds = readIds,
                            onOpenSubject = { id -> navController.navigate(NavRoutes.subjectDetail(id)) },
                            onViewAllSubjects = { navController.navigate(NavRoutes.SUBJECTS) },
                            onWatchLesson = { lesson -> navController.navigate(NavRoutes.videoPlayer(lesson.id)) },
                            onOpenMaterial = { mat -> navController.navigate(NavRoutes.pdfViewer(mat.id)) },
                            onDownloadMaterial = downloadMaterialAction,
                            onShareMaterial = shareMaterialAction,
                            onToggleFavoriteLesson = toggleFavoriteLesson,
                            onToggleFavoriteMaterial = toggleFavoriteMaterial,
                            onOpenAnnouncement = { ann ->
                                mainViewModel.markAnnouncementRead(ann.id)
                                if (!ann.subjectId.isNullOrBlank()) {
                                    navController.navigate(NavRoutes.subjectDetail(ann.subjectId))
                                } else {
                                    navController.navigate(NavRoutes.NOTIFICATIONS)
                                }
                            },
                            onOpenNotifications = { navController.navigate(NavRoutes.NOTIFICATIONS) },
                            onOpenLibrary = { navController.navigate(NavRoutes.LIBRARY) },
                            onOpenAdminPanel = {
                                if (isAdmin) navController.navigate(NavRoutes.ADMIN_DASHBOARD)
                            }
                        )
                    }

                    composable(NavRoutes.SUBJECTS) {
                        SubjectsScreen(
                            subjectsState = subjectsState,
                            lessons = lessons,
                            materials = materials,
                            onOpenSubject = { id -> navController.navigate(NavRoutes.subjectDetail(id)) }
                        )
                    }

                    composable(NavRoutes.LIBRARY) {
                        MyLibraryScreen(
                            favoritesState = favoritesState,
                            progressState = progressState,
                            lessons = lessons,
                            materials = materials,
                            onWatchLesson = { lesson -> navController.navigate(NavRoutes.videoPlayer(lesson.id)) },
                            onOpenMaterial = { mat -> navController.navigate(NavRoutes.pdfViewer(mat.id)) },
                            onDownloadMaterial = downloadMaterialAction,
                            onShareMaterial = shareMaterialAction,
                            onToggleFavoriteLesson = toggleFavoriteLesson,
                            onToggleFavoriteMaterial = toggleFavoriteMaterial
                        )
                    }

                    composable(NavRoutes.NOTIFICATIONS) {
                        NotificationsScreen(
                            announcementsState = announcementsState,
                            readIds = readIds,
                            onAnnouncementClick = { ann ->
                                mainViewModel.markAnnouncementRead(ann.id)
                                if (!ann.subjectId.isNullOrBlank()) {
                                    navController.navigate(NavRoutes.subjectDetail(ann.subjectId))
                                }
                            },
                            onMarkAllRead = mainViewModel::markAllAnnouncementsRead
                        )
                    }

                    composable(NavRoutes.ACCOUNT) {
                        AccountScreen(
                            userProfile = userProfile,
                            isAdmin = isAdmin,
                            favoritesCount = favorites.size,
                            watchedCount = progressList.size,
                            completedCount = progressList.count { it.completed },
                            onOpenAdminPanel = {
                                if (isAdmin) navController.navigate(NavRoutes.ADMIN_DASHBOARD)
                            },
                            onSignOut = {
                                signOutUser(credentialManager, scope)
                            }
                        )
                    }

                    composable(
                        route = NavRoutes.SUBJECT_DETAIL,
                        arguments = listOf(navArgument("subjectId") { type = NavType.StringType })
                    ) { entry ->
                        val subjectId = entry.arguments?.getString("subjectId") ?: ""
                        val subject = subjects.firstOrNull { it.id == subjectId }
                        val subjectLessons = lessons.filter { it.subjectId == subjectId }
                        val subjectMaterials = materials.filter { it.subjectId == subjectId }
                        SubjectDetailScreen(
                            subject = subject,
                            lessons = subjectLessons,
                            materials = subjectMaterials,
                            favorites = favorites,
                            progressList = progressList,
                            onBack = { navController.popBackStack() },
                            onWatchLesson = { lesson -> navController.navigate(NavRoutes.videoPlayer(lesson.id)) },
                            onOpenMaterial = { mat -> navController.navigate(NavRoutes.pdfViewer(mat.id)) },
                            onDownloadMaterial = downloadMaterialAction,
                            onShareMaterial = shareMaterialAction,
                            onToggleFavoriteLesson = toggleFavoriteLesson,
                            onToggleFavoriteMaterial = toggleFavoriteMaterial
                        )
                    }

                    composable(
                        route = NavRoutes.VIDEO_PLAYER,
                        arguments = listOf(navArgument("lessonId") { type = NavType.StringType })
                    ) { entry ->
                        val lessonId = entry.arguments?.getString("lessonId") ?: ""
                        val lesson = lessons.firstOrNull { it.id == lessonId }
                        val related = lesson?.let { l -> materials.filter { it.subjectId == l.subjectId } }.orEmpty()
                        val prog = progressList.firstOrNull { it.lessonId == lessonId }
                        val isFav = favorites.any { it.itemId == lessonId && it.parsedType() == FavoriteType.LESSON }
                        VideoPlayerScreen(
                            lesson = lesson,
                            relatedMaterials = related,
                            initialProgress = prog,
                            isFavorite = isFav,
                            onBack = { navController.popBackStack() },
                            onSaveProgress = { pos, dur, done ->
                                if (lesson != null) {
                                    mainViewModel.saveLessonProgress(lesson, pos, dur, done)
                                }
                            },
                            onToggleFavorite = { if (lesson != null) toggleFavoriteLesson(lesson) },
                            onOpenMaterial = { mat -> navController.navigate(NavRoutes.pdfViewer(mat.id)) },
                            onDownloadMaterial = downloadMaterialAction,
                            onShareMaterial = shareMaterialAction
                        )
                    }

                    composable(
                        route = NavRoutes.PDF_VIEWER,
                        arguments = listOf(navArgument("materialId") { type = NavType.StringType })
                    ) { entry ->
                        val materialId = entry.arguments?.getString("materialId") ?: ""
                        val mat = materials.firstOrNull { it.id == materialId }
                        val isFav = favorites.any { it.itemId == materialId && it.parsedType() == FavoriteType.MATERIAL }
                        PdfViewerScreen(
                            material = mat,
                            isFavorite = isFav,
                            onBack = { navController.popBackStack() },
                            onDownloadClick = { if (mat != null) downloadMaterialAction(mat) },
                            onShareClick = { if (mat != null) shareMaterialAction(mat) },
                            onToggleFavorite = { if (mat != null) toggleFavoriteMaterial(mat) }
                        )
                    }

                    composable(NavRoutes.ADMIN_DASHBOARD) {
                        if (isAdmin) {
                            val adminViewModel: AdminViewModel = viewModel(
                                key = "admin_${firebaseUser.uid}",
                                factory = viewModelFactory {
                                    initializer {
                                        val app = checkNotNull(this[APPLICATION_KEY]) as Application
                                        val dbId = app.getString(R.string.firestore_database_id)
                                        val db = FirebaseFirestore.getInstance(dbId)
                                        AdminViewModel(AdminRepository(db))
                                    }
                                }
                            )
                            AdminDashboardScreen(
                                adminViewModel = adminViewModel,
                                currentUserId = firebaseUser.uid,
                                onBack = { navController.popBackStack() }
                            )
                        } else {
                            LaunchedEffect(Unit) {
                                navController.popBackStack()
                            }
                        }
                    }
                }
            }
        }
    }
}
