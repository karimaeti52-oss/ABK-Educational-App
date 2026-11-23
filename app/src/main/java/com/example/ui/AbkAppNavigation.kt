package com.example.ui

import android.app.Application
import android.content.Intent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
import coil.Coil
import coil.ImageLoader
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.example.R
import com.example.data.firebase.ensureFirebaseInitialized
import com.example.data.firebase.signOutUser
import com.example.data.model.AccountStatus
import com.example.data.model.ContentBlockType
import com.example.data.model.FavoriteType
import com.example.data.model.Lesson
import com.example.data.model.MaterialType
import com.example.data.model.StudyMaterial
import com.example.data.model.UiState
import com.example.data.model.VideoSourceType
import com.example.data.repository.AbkContentRepository
import com.example.data.repository.AdminRepository
import com.example.data.repository.StudentRepository
import com.example.ui.components.OfflineStatusBanner
import com.example.ui.components.UpdateDialog
import com.example.ui.screens.AccountScreen
import com.example.ui.screens.AuthScreen
import com.example.ui.screens.CatalogBrowserScreen
import com.example.ui.screens.ExplanationDetailScreen
import com.example.ui.screens.HomeScreen
import com.example.ui.screens.LessonTeachersScreen
import com.example.ui.screens.MyLibraryScreen
import com.example.ui.screens.NotificationsScreen
import com.example.ui.screens.PdfViewerScreen
import com.example.ui.screens.SubjectDetailScreen
import com.example.ui.screens.SubjectsScreen
import com.example.ui.screens.SuspendedAccountScreen
import com.example.ui.screens.VideoPlayerScreen
import com.example.ui.screens.admin.AdminDashboardScreen
import com.example.ui.theme.MidadTheme
import com.example.ui.theme.ThemePreferenceMode
import com.example.update.AppUpdateManager
import com.example.update.AppUpdateState
import com.example.util.NetworkMonitor
import com.example.util.NotificationHelper
import com.example.util.PdfCacheManager
import com.example.util.UrlUtils
import com.example.viewmodel.AdminViewModel
import com.example.viewmodel.MainViewModel
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.firestoreSettings
import com.google.firebase.firestore.persistentCacheSettings
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

object NavRoutes {
    const val HOME = "home"
    const val SUBJECTS = "subjects"
    const val LIBRARY = "library"
    const val NOTIFICATIONS = "notifications"
    const val ACCOUNT = "account"
    const val CATALOG_NODE = "catalog_node/{nodeId}"
    const val SUBJECT_DETAIL = "subject_detail/{subjectId}"
    const val LESSON_TEACHERS = "lesson_teachers/{lessonId}"
    const val EXPLANATION_DETAIL = "explanation_detail/{explanationId}"
    const val VIDEO_PLAYER = "video_player/{lessonId}"
    const val BLOCK_VIDEO_PLAYER = "block_video/{blockId}"
    const val PDF_VIEWER = "pdf_viewer/{materialId}"
    const val BLOCK_PDF_VIEWER = "block_pdf/{blockId}"
    const val ADMIN_DASHBOARD = "admin_dashboard"

    fun catalogNode(nodeId: String) = "catalog_node/$nodeId"
    fun subjectDetail(subjectId: String) = "subject_detail/$subjectId"
    fun lessonTeachers(lessonId: String) = "lesson_teachers/$lessonId"
    fun explanationDetail(explanationId: String) = "explanation_detail/$explanationId"
    fun videoPlayer(lessonId: String) = "video_player/$lessonId"
    fun blockVideoPlayer(blockId: String) = "block_video/$blockId"
    fun pdfViewer(materialId: String) = "pdf_viewer/$materialId"
    fun blockPdfViewer(blockId: String) = "block_pdf/$blockId"
}

private data class BottomTab(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
)

private val defaultStudentTabs = listOf(
    BottomTab(NavRoutes.HOME, "الرئيسية", Icons.Filled.Home, Icons.Outlined.Home),
    BottomTab(NavRoutes.SUBJECTS, "المواد", Icons.Filled.MenuBook, Icons.Outlined.MenuBook),
    BottomTab(NavRoutes.LIBRARY, "مكتبتي", Icons.Filled.Bookmarks, Icons.Outlined.Bookmarks),
    BottomTab(NavRoutes.NOTIFICATIONS, "الإشعارات", Icons.Filled.Notifications, Icons.Outlined.Notifications),
    BottomTab(NavRoutes.ACCOUNT, "حسابي", Icons.Filled.Person, Icons.Outlined.Person)
)

@Volatile
private var coilInitialized = false

@Volatile
private var firestoreConfigured = false

private val activeWorkerBaseUrlRef = AtomicReference("")

private fun ensureBoundedCoilImageLoader(appContext: android.content.Context) {
    if (coilInitialized) return
    synchronized(NavRoutes) {
        if (coilInitialized) return
        val imageHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val original = chain.request()
                val targetUrl = original.url.toString()
                val workerBaseUrl = activeWorkerBaseUrlRef.get()
                val shouldAttachAuth = original.header("Authorization").isNullOrBlank() &&
                    UrlUtils.isSameOriginAsBaseUrl(targetUrl, workerBaseUrl)
                val finalRequest = if (shouldAttachAuth) {
                    val token = runCatching {
                        runBlocking { Firebase.auth.currentUser?.getIdToken(false)?.await()?.token }
                    }.getOrNull()
                    if (!token.isNullOrBlank()) {
                        original.newBuilder()
                            .header("Authorization", "Bearer $token")
                            .build()
                    } else {
                        original
                    }
                } else {
                    original
                }
                chain.proceed(finalRequest)
            }
            .build()
        val imageLoader = ImageLoader.Builder(appContext)
            .okHttpClient(imageHttpClient)
            .memoryCache {
                MemoryCache.Builder(appContext)
                    .maxSizePercent(0.15)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(File(appContext.cacheDir, "midad_image_cache"))
                    .maxSizeBytes(40L * 1024L * 1024L)
                    .build()
            }
            .crossfade(true)
            .build()
        Coil.setImageLoader(imageLoader)
        coilInitialized = true
    }
}

@Composable
fun AbkAppNavigation(
    auth: FirebaseAuth? = null,
    darkTheme: Boolean = isSystemInDarkTheme(),
    themeMode: ThemePreferenceMode = ThemePreferenceMode.SYSTEM,
    onThemeModeChange: (ThemePreferenceMode) -> Unit = {}
) {
    val context = LocalContext.current
    LaunchedEffect(context) {
        ensureBoundedCoilImageLoader(context.applicationContext)
    }

    val resolvedAuth = remember(auth, context) {
        auth ?: if (ensureFirebaseInitialized(context)) {
            runCatching { Firebase.auth }.getOrNull()
        } else {
            null
        }
    }

    if (resolvedAuth == null) {
        AuthScreen(
            onAuthSuccess = {},
            firebaseReady = false
        )
        return
    }

    var currentUser by remember(resolvedAuth) { mutableStateOf(resolvedAuth.currentUser) }

    DisposableEffect(resolvedAuth) {
        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            currentUser = firebaseAuth.currentUser
        }
        resolvedAuth.addAuthStateListener(listener)
        currentUser = resolvedAuth.currentUser
        onDispose {
            resolvedAuth.removeAuthStateListener(listener)
        }
    }

    val user = currentUser

    if (user == null) {
        AuthScreen(
            onAuthSuccess = { signedInUser ->
                currentUser = signedInUser ?: resolvedAuth.currentUser
            },
            firebaseReady = true
        )
    } else {
        key(user.uid) {
            AuthenticatedAbkApp(
                firebaseUser = user,
                darkTheme = darkTheme,
                themeMode = themeMode,
                onThemeModeChange = onThemeModeChange
            )
        }
    }
}

@Composable
private fun AuthenticatedAbkApp(
    firebaseUser: FirebaseUser,
    darkTheme: Boolean,
    themeMode: ThemePreferenceMode,
    onThemeModeChange: (ThemePreferenceMode) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val credentialManager = remember {
        runCatching { CredentialManager.create(context) }.getOrNull()
    }
    val appDb = remember(context) {
        runCatching { resolveAbkFirestore(context.applicationContext as Application) }.getOrNull()
    }
    val updateManager = remember(appDb, context) {
        AppUpdateManager(context = context, db = appDb, scope = scope)
    }
    val updateState by updateManager.state.collectAsStateWithLifecycle()

    LaunchedEffect(updateManager) {
        updateManager.checkForUpdates(manual = false)
    }

    DisposableEffect(updateManager) {
        onDispose {
            updateManager.dispose()
        }
    }

    val mainViewModel: MainViewModel = viewModel(
        key = firebaseUser.uid,
        factory = viewModelFactory {
            initializer {
                val app = checkNotNull(this[APPLICATION_KEY]) as Application
                val db = resolveAbkFirestore(app)
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
    val platformConfig by mainViewModel.platformConfig.collectAsStateWithLifecycle()
    val isOnline by NetworkMonitor.observeIsOnline(context).collectAsStateWithLifecycle(initialValue = true)

    SideEffect {
        activeWorkerBaseUrlRef.set(platformConfig.r2WorkerBaseUrl.trim())
    }

    MidadTheme(darkTheme = darkTheme, platformConfig = platformConfig) {
        val currentStatus = userProfile?.parsedStatus()
        if (currentStatus == AccountStatus.SUSPENDED || currentStatus == AccountStatus.BANNED) {
            SuspendedAccountScreen(
                status = currentStatus,
                banReason = userProfile?.banReason,
                onSignOut = {
                    signOutUser(credentialManager, scope)
                }
            )
            return@MidadTheme
        }

        val catalogNodesState by mainViewModel.catalogNodesState.collectAsStateWithLifecycle()
        val subjectsState by mainViewModel.subjectsState.collectAsStateWithLifecycle()
        val unitsState by mainViewModel.unitsState.collectAsStateWithLifecycle()
        val teachersState by mainViewModel.teachersState.collectAsStateWithLifecycle()
        val lessonsState by mainViewModel.lessonsState.collectAsStateWithLifecycle()
        val explanationsState by mainViewModel.explanationsState.collectAsStateWithLifecycle()
        val contentBlocksState by mainViewModel.contentBlocksState.collectAsStateWithLifecycle()
        val customSectionTypesState by mainViewModel.customSectionTypesState.collectAsStateWithLifecycle()
        val materialsState by mainViewModel.materialsState.collectAsStateWithLifecycle()
        val announcementsState by mainViewModel.announcementsState.collectAsStateWithLifecycle()
        val favoritesState by mainViewModel.favoritesState.collectAsStateWithLifecycle()
        val progressState by mainViewModel.progressState.collectAsStateWithLifecycle()
        val readIds by mainViewModel.readAnnouncementIds.collectAsStateWithLifecycle()
        val unreadCount by mainViewModel.unreadAnnouncementsCount.collectAsStateWithLifecycle()
        val searchQuery by mainViewModel.searchQuery.collectAsStateWithLifecycle()
        val searchResults by mainViewModel.searchResults.collectAsStateWithLifecycle()

        val catalogNodes = (catalogNodesState as? UiState.Success)?.data.orEmpty()
        val subjects = (subjectsState as? UiState.Success)?.data.orEmpty()
        val units = (unitsState as? UiState.Success)?.data.orEmpty()
        val teachers = (teachersState as? UiState.Success)?.data.orEmpty()
        val lessons = (lessonsState as? UiState.Success)?.data.orEmpty()
        val explanations = (explanationsState as? UiState.Success)?.data.orEmpty()
        val contentBlocks = (contentBlocksState as? UiState.Success)?.data.orEmpty()
        val customSectionTypes = (customSectionTypesState as? UiState.Success)?.data.orEmpty()
        val materials = (materialsState as? UiState.Success)?.data.orEmpty()
        val announcements = (announcementsState as? UiState.Success)?.data.orEmpty()
        val favorites = (favoritesState as? UiState.Success)?.data.orEmpty()
        val progressList = (progressState as? UiState.Success)?.data.orEmpty()

        val studentTabs = remember(platformConfig.bottomNavItems) {
            if (platformConfig.bottomNavItems.isEmpty()) {
                defaultStudentTabs
            } else {
                val configured = platformConfig.bottomNavItems
                    .filter { it.visible }
                    .sortedBy { it.sortOrder }
                    .mapNotNull { item ->
                        val base = defaultStudentTabs.firstOrNull { it.route == item.route }
                        base?.copy(label = item.label.ifBlank { base.label })
                    }
                configured.ifEmpty { defaultStudentTabs }
            }
        }

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

        LaunchedEffect(updateState) {
            if (updateState is AppUpdateState.UpToDate) {
                snackbarHostState.showSnackbar("أنت تستخدم أحدث إصدار من مداد التعليمية")
                updateManager.clearStatus()
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

        val openLessonAction: (Lesson) -> Unit = { lesson ->
            val hasExplanations = explanations.any { it.lessonId == lesson.id }
            if (hasExplanations || lesson.videoUrl.isBlank()) {
                navController.navigate(NavRoutes.lessonTeachers(lesson.id))
            } else {
                navController.navigate(NavRoutes.videoPlayer(lesson.id))
            }
        }

        val authTokenProvider: suspend () -> String? = remember(firebaseUser) {
            {
                runCatching { firebaseUser.getIdToken(false).await().token }.getOrNull()
            }
        }

        val downloadMaterialAction: (StudyMaterial) -> Unit = { mat ->
            scope.launch {
                mainViewModel.showMessage("جاري تنزيل ${mat.title}…")
                val result = PdfCacheManager.exportPdfToDownloads(
                    context = context,
                    materialId = mat.id,
                    title = mat.title,
                    rawUrl = mat.fileUrl,
                    r2WorkerBaseUrl = platformConfig.r2WorkerBaseUrl,
                    authTokenProvider = authTokenProvider
                )
                result.onSuccess { msg -> mainViewModel.showMessage(msg) }
                    .onFailure { err -> mainViewModel.showMessage(err.localizedMessage ?: "تعذر تنزيل الملف") }
            }
        }

        val shareMaterialAction: (StudyMaterial) -> Unit = { mat ->
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, mat.title)
                putExtra(
                    Intent.EXTRA_TEXT,
                    "${mat.title} (${mat.subjectName}) - ${platformConfig.platformName.ifBlank { "مداد التعليمية" }}:\n${mat.fileUrl}"
                )
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

        val navigateToTab: (String) -> Unit = { route ->
            navController.navigate(route) {
                popUpTo(navController.graph.findStartDestination().id) {
                    saveState = true
                }
                launchSingleTop = true
                restoreState = true
            }
        }

        UpdateDialog(
            updateState = updateState,
            onStartDownload = { manifest -> updateManager.startUpdateDownload(manifest) },
            onRetryInstall = { manifest, apkFile -> updateManager.proceedToInstall(manifest, apkFile) },
            onOpenPermissionSettings = { updateManager.openInstallPermissionSettings() },
            onDismissOptional = { updateManager.dismissOptionalUpdate() },
            onClearError = { updateManager.clearStatus() }
        )

        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val useNavigationRail = maxWidth >= 840.dp

            Scaffold(
                snackbarHost = { SnackbarHost(snackbarHostState) },
                contentWindowInsets = WindowInsets.safeDrawing,
                bottomBar = {
                    if (showBottomBar && !useNavigationRail) {
                        NavigationBar(
                            containerColor = MaterialTheme.colorScheme.surface
                        ) {
                            studentTabs.forEach { tab ->
                                val selected = currentRoute == tab.route
                                NavigationBarItem(
                                    selected = selected,
                                    onClick = { navigateToTab(tab.route) },
                                    icon = {
                                        TabIconWithBadge(
                                            tab = tab,
                                            selected = selected,
                                            unreadCount = unreadCount
                                        )
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
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    if (showBottomBar && useNavigationRail) {
                        NavigationRail(
                            containerColor = MaterialTheme.colorScheme.surface,
                            modifier = Modifier.fillMaxHeight()
                        ) {
                            studentTabs.forEach { tab ->
                                val selected = currentRoute == tab.route
                                NavigationRailItem(
                                    selected = selected,
                                    onClick = { navigateToTab(tab.route) },
                                    icon = {
                                        TabIconWithBadge(
                                            tab = tab,
                                            selected = selected,
                                            unreadCount = unreadCount
                                        )
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

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        OfflineStatusBanner(isOnline = isOnline)
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .then(
                                    if (useNavigationRail) Modifier.widthIn(max = 960.dp)
                                    else Modifier
                                )
                        ) {
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
                                        onWatchLesson = openLessonAction,
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
                                        },
                                        platformConfig = platformConfig,
                                        catalogNodesState = catalogNodesState,
                                        onOpenCatalogNode = { nodeId ->
                                            navController.navigate(NavRoutes.catalogNode(nodeId))
                                        }
                                    )
                                }

                                composable(
                                    route = NavRoutes.CATALOG_NODE,
                                    arguments = listOf(navArgument("nodeId") { type = NavType.StringType })
                                ) { entry ->
                                    val nodeId = entry.arguments?.getString("nodeId") ?: ""
                                    val node = catalogNodes.firstOrNull { it.id == nodeId }
                                    CatalogBrowserScreen(
                                        node = node,
                                        allNodes = catalogNodes,
                                        subjects = subjects,
                                        lessons = lessons,
                                        materials = materials,
                                        onBack = { navController.popBackStack() },
                                        onOpenChildNode = { childId ->
                                            navController.navigate(NavRoutes.catalogNode(childId))
                                        },
                                        onOpenSubject = { id ->
                                            navController.navigate(NavRoutes.subjectDetail(id))
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
                                        onWatchLesson = openLessonAction,
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
                                        },
                                        themeMode = themeMode,
                                        onThemeModeChange = onThemeModeChange,
                                        updateState = updateState,
                                        onCheckForUpdates = { updateManager.checkForUpdates(manual = true) }
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
                                    val subjectUnits = units.filter { it.subjectId == subjectId }
                                    SubjectDetailScreen(
                                        subject = subject,
                                        lessons = subjectLessons,
                                        materials = subjectMaterials,
                                        favorites = favorites,
                                        progressList = progressList,
                                        onBack = { navController.popBackStack() },
                                        onWatchLesson = openLessonAction,
                                        onOpenMaterial = { mat -> navController.navigate(NavRoutes.pdfViewer(mat.id)) },
                                        onDownloadMaterial = downloadMaterialAction,
                                        onShareMaterial = shareMaterialAction,
                                        onToggleFavoriteLesson = toggleFavoriteLesson,
                                        onToggleFavoriteMaterial = toggleFavoriteMaterial,
                                        units = subjectUnits
                                    )
                                }

                                composable(
                                    route = NavRoutes.LESSON_TEACHERS,
                                    arguments = listOf(navArgument("lessonId") { type = NavType.StringType })
                                ) { entry ->
                                    val lessonId = entry.arguments?.getString("lessonId") ?: ""
                                    val lesson = lessons.firstOrNull { it.id == lessonId }
                                    val lessonExplanations = explanations.filter { it.lessonId == lessonId }
                                    val lessonBlocks = contentBlocks.filter { it.lessonId == lessonId }
                                    val related = lesson?.let { l ->
                                        materials.filter { it.lessonId == l.id || it.subjectId == l.subjectId }
                                    }.orEmpty()
                                    val prog = progressList.firstOrNull { it.lessonId == lessonId }
                                    val isFav = favorites.any { it.itemId == lessonId && it.parsedType() == FavoriteType.LESSON }

                                    LessonTeachersScreen(
                                        lesson = lesson,
                                        explanations = lessonExplanations,
                                        contentBlocks = lessonBlocks,
                                        teachers = teachers,
                                        relatedMaterials = related,
                                        isFavorite = isFav,
                                        progress = prog,
                                        onBack = { navController.popBackStack() },
                                        onToggleFavorite = { if (lesson != null) toggleFavoriteLesson(lesson) },
                                        onOpenExplanation = { expId ->
                                            navController.navigate(NavRoutes.explanationDetail(expId))
                                        },
                                        onWatchDirectLesson = {
                                            if (lesson != null) navController.navigate(NavRoutes.videoPlayer(lesson.id))
                                        },
                                        onOpenMaterial = { mat -> navController.navigate(NavRoutes.pdfViewer(mat.id)) },
                                        onDownloadMaterial = downloadMaterialAction,
                                        onShareMaterial = shareMaterialAction
                                    )
                                }

                                composable(
                                    route = NavRoutes.EXPLANATION_DETAIL,
                                    arguments = listOf(navArgument("explanationId") { type = NavType.StringType })
                                ) { entry ->
                                    val expId = entry.arguments?.getString("explanationId") ?: ""
                                    val exp = explanations.firstOrNull { it.id == expId }
                                    val teacher = exp?.let { e -> teachers.firstOrNull { it.id == e.teacherId } }
                                    val lesson = exp?.let { e -> lessons.firstOrNull { it.id == e.lessonId } }
                                    val expBlocks = contentBlocks.filter { it.explanationId == expId }
                                    val related = exp?.let { e ->
                                        materials.filter {
                                            it.teacherId == e.teacherId ||
                                                it.lessonId == e.lessonId ||
                                                it.subjectId == e.subjectId
                                        }
                                    }.orEmpty()

                                    ExplanationDetailScreen(
                                        explanation = exp,
                                        teacher = teacher,
                                        lesson = lesson,
                                        blocks = expBlocks,
                                        customSectionTypes = customSectionTypes,
                                        relatedMaterials = related,
                                        onBack = { navController.popBackStack() },
                                        onPlayBlockVideo = { block ->
                                            navController.navigate(NavRoutes.blockVideoPlayer(block.id))
                                        },
                                        onOpenBlockPdf = { block ->
                                            navController.navigate(NavRoutes.blockPdfViewer(block.id))
                                        },
                                        onOpenMaterial = { mat -> navController.navigate(NavRoutes.pdfViewer(mat.id)) },
                                        onDownloadMaterial = downloadMaterialAction,
                                        onShareMaterial = shareMaterialAction
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
                                        r2WorkerBaseUrl = platformConfig.r2WorkerBaseUrl,
                                        authTokenProvider = authTokenProvider,
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
                                    route = NavRoutes.BLOCK_VIDEO_PLAYER,
                                    arguments = listOf(navArgument("blockId") { type = NavType.StringType })
                                ) { entry ->
                                    val blockId = entry.arguments?.getString("blockId") ?: ""
                                    val block = contentBlocks.firstOrNull { it.id == blockId }
                                    val parentLesson = block?.let { b -> lessons.firstOrNull { it.id == b.lessonId } }
                                    val parentExp = block?.let { b -> explanations.firstOrNull { it.id == b.explanationId } }
                                    val syntheticLesson = block?.let { b ->
                                        val url = b.mediaUrl ?: ""
                                        val preferred = if (b.parsedBlockType() == ContentBlockType.YOUTUBE_VIDEO) {
                                            VideoSourceType.YOUTUBE
                                        } else {
                                            VideoSourceType.MP4
                                        }
                                        val sourceType = UrlUtils.detectVideoSourceType(url, preferred).name
                                        Lesson(
                                            id = parentLesson?.id ?: b.lessonId.ifBlank { b.id },
                                            subjectId = b.subjectId,
                                            subjectName = parentLesson?.subjectName ?: parentExp?.subjectName ?: "",
                                            unitTitle = parentLesson?.unitTitle ?: b.subtitle ?: "",
                                            title = b.title,
                                            description = b.bodyText ?: b.subtitle ?: "",
                                            teacherName = parentExp?.teacherName,
                                            durationLabel = b.durationLabel,
                                            thumbnailUrl = b.thumbnailUrl,
                                            videoUrl = url,
                                            videoSourceType = sourceType,
                                            r2ObjectKey = b.r2ObjectKey,
                                            sizeBytes = b.sizeBytes
                                        )
                                    }
                                    val related = block?.let { b ->
                                        materials.filter { it.lessonId == b.lessonId || it.subjectId == b.subjectId }
                                    }.orEmpty()
                                    val prog = parentLesson?.let { l -> progressList.firstOrNull { it.lessonId == l.id } }

                                    VideoPlayerScreen(
                                        lesson = syntheticLesson,
                                        relatedMaterials = related,
                                        initialProgress = prog,
                                        isFavorite = false,
                                        r2WorkerBaseUrl = platformConfig.r2WorkerBaseUrl,
                                        authTokenProvider = authTokenProvider,
                                        onBack = { navController.popBackStack() },
                                        onSaveProgress = { pos, dur, done ->
                                            if (parentLesson != null) {
                                                mainViewModel.saveLessonProgress(parentLesson, pos, dur, done)
                                            }
                                        },
                                        onToggleFavorite = { if (parentLesson != null) toggleFavoriteLesson(parentLesson) },
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
                                        r2WorkerBaseUrl = platformConfig.r2WorkerBaseUrl,
                                        authTokenProvider = authTokenProvider,
                                        onBack = { navController.popBackStack() },
                                        onDownloadClick = { if (mat != null) downloadMaterialAction(mat) },
                                        onShareClick = { if (mat != null) shareMaterialAction(mat) },
                                        onToggleFavorite = { if (mat != null) toggleFavoriteMaterial(mat) }
                                    )
                                }

                                composable(
                                    route = NavRoutes.BLOCK_PDF_VIEWER,
                                    arguments = listOf(navArgument("blockId") { type = NavType.StringType })
                                ) { entry ->
                                    val blockId = entry.arguments?.getString("blockId") ?: ""
                                    val block = contentBlocks.firstOrNull { it.id == blockId }
                                    val parentExp = block?.let { b -> explanations.firstOrNull { it.id == b.explanationId } }
                                    val syntheticMat = block?.let { b ->
                                        StudyMaterial(
                                            id = b.id,
                                            subjectId = b.subjectId,
                                            subjectName = parentExp?.subjectName ?: "",
                                            lessonId = b.lessonId,
                                            materialType = MaterialType.STUDY_NOTE.name,
                                            title = b.title,
                                            description = b.bodyText ?: b.subtitle ?: "",
                                            fileUrl = b.mediaUrl ?: ""
                                        )
                                    }
                                    PdfViewerScreen(
                                        material = syntheticMat,
                                        isFavorite = false,
                                        r2WorkerBaseUrl = platformConfig.r2WorkerBaseUrl,
                                        authTokenProvider = authTokenProvider,
                                        onBack = { navController.popBackStack() },
                                        onDownloadClick = { if (syntheticMat != null) downloadMaterialAction(syntheticMat) },
                                        onShareClick = { if (syntheticMat != null) shareMaterialAction(syntheticMat) },
                                        onToggleFavorite = {}
                                    )
                                }

                                composable(NavRoutes.ADMIN_DASHBOARD) {
                                    if (isAdmin) {
                                        val adminViewModel: AdminViewModel = viewModel(
                                            key = "admin_${firebaseUser.uid}",
                                            factory = viewModelFactory {
                                                initializer {
                                                    val app = checkNotNull(this[APPLICATION_KEY]) as Application
                                                    val db = resolveAbkFirestore(app)
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
        }
    }
}

@Composable
private fun TabIconWithBadge(
    tab: BottomTab,
    selected: Boolean,
    unreadCount: Int
) {
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
}

private fun resolveAbkFirestore(app: Application): FirebaseFirestore {
    val dbId = runCatching { app.getString(R.string.firestore_database_id) }
        .getOrNull()
        ?.takeIf { it.isNotBlank() }
    val db = if (dbId != null) {
        runCatching { FirebaseFirestore.getInstance(dbId) }.getOrElse { FirebaseFirestore.getInstance() }
    } else {
        FirebaseFirestore.getInstance()
    }
    if (!firestoreConfigured) {
        synchronized(NavRoutes) {
            if (!firestoreConfigured) {
                runCatching {
                    db.firestoreSettings = firestoreSettings {
                        setLocalCacheSettings(
                            persistentCacheSettings {
                                setSizeBytes(50L * 1024L * 1024L)
                            }
                        )
                    }
                }
                firestoreConfigured = true
            }
        }
    }
    return db
}
