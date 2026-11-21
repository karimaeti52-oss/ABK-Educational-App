package com.example

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import com.example.data.model.AccountStatus
import com.example.data.model.CatalogNode
import com.example.data.model.CatalogNodeType
import com.example.data.model.ContentBlock
import com.example.data.model.ContentBlockType
import com.example.data.model.Lesson
import com.example.data.model.LessonExplanation
import com.example.data.model.PlatformConfig
import com.example.data.model.QaItem
import com.example.data.model.QuizQuestion
import com.example.data.model.Subject
import com.example.data.model.Teacher
import com.example.data.model.UiState
import com.example.data.model.UserProfile
import com.example.ui.screens.AccountScreen
import com.example.ui.screens.AuthScreen
import com.example.ui.screens.CatalogBrowserScreen
import com.example.ui.screens.ExplanationDetailScreen
import com.example.ui.screens.HomeScreen
import com.example.ui.screens.LessonTeachersScreen
import com.example.ui.screens.SuspendedAccountScreen
import com.example.ui.screens.VideoPlayerScreen
import com.example.ui.theme.ABKTheme
import com.example.ui.theme.MidadTheme
import com.example.ui.theme.ThemePreferenceMode
import com.example.update.AppUpdateState
import com.example.viewmodel.SearchResults
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AbkUiScreensRobolectricTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `AuthScreen renders cleanly when Firebase is unavailable`() {
        composeTestRule.setContent {
            ABKTheme {
                AuthScreen(
                    onAuthSuccess = { _ -> },
                    firebaseReady = false
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("مداد التعليمية").assertIsDisplayed()
        composeTestRule.onNodeWithText("طريقك نحو التفوق").assertIsDisplayed()
        composeTestRule.onNodeWithTag("auth_error_banner")
            .performScrollTo()
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("google_sign_in_button")
            .performScrollTo()
            .assertIsDisplayed()
    }

    @Test
    fun `HomeScreen renders dynamic PlatformConfig, What Are You Studying grid, and subjects`() {
        val sampleSubject = Subject(
            id = "math",
            title = "الرياضيات",
            description = "الجبر والتحليل",
            iconKey = "math",
            nodeIds = listOf("node_bac"),
            sortOrder = 1L,
            published = true
        )
        val stageNode = CatalogNode(
            id = "node_sec",
            nodeType = CatalogNodeType.STAGE.name,
            typeLabel = "مرحلة",
            title = "المرحلة الثانوية",
            subtitle = "الصفوف الثانوية والفروع",
            sortOrder = 1L,
            published = true
        )
        val childGrade = CatalogNode(
            id = "node_bac",
            parentId = "node_sec",
            nodeType = CatalogNodeType.GRADE.name,
            typeLabel = "صف",
            title = "الثالث الثانوي",
            sortOrder = 1L,
            published = true
        )

        var openedNodeId: String? = null

        composeTestRule.setContent {
            val config = PlatformConfig(
                platformName = "منصة ABK",
                platformTagline = "التعليمية المحدثة",
                homeHeadline = "ماذا تدرس؟",
                primaryColorHex = "#0F294A",
                secondaryColorHex = "#0EA5E9"
            )
            ABKTheme(platformConfig = config) {
                HomeScreen(
                    userProfile = UserProfile(userId = "u1", displayName = "طالب تجريبي"),
                    isAdmin = false,
                    searchQuery = "",
                    onSearchQueryChange = {},
                    searchResults = SearchResults(),
                    subjectsState = UiState.Success(listOf(sampleSubject)),
                    lessonsState = UiState.Success(emptyList()),
                    materialsState = UiState.Success(emptyList()),
                    announcementsState = UiState.Success(emptyList()),
                    favoritesState = UiState.Success(emptyList()),
                    progressState = UiState.Success(emptyList()),
                    readAnnouncementIds = emptySet(),
                    onOpenSubject = {},
                    onViewAllSubjects = {},
                    onWatchLesson = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {},
                    onToggleFavoriteLesson = {},
                    onToggleFavoriteMaterial = {},
                    onOpenAnnouncement = {},
                    onOpenNotifications = {},
                    onOpenLibrary = {},
                    onOpenAdminPanel = {},
                    platformConfig = config,
                    catalogNodesState = UiState.Success(listOf(stageNode, childGrade)),
                    onOpenCatalogNode = { openedNodeId = it }
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("home_screen").assertIsDisplayed()
        // Legacy "منصة ABK" automatically upgrades to "مداد التعليمية" via resolvedForMidad()
        composeTestRule.onNodeWithText("مداد التعليمية").assertIsDisplayed()
        composeTestRule.onNodeWithText("ماذا تدرس؟").assertIsDisplayed()
        composeTestRule.onNodeWithTag("catalog_node_card_node_sec").performClick()
        assertEquals("node_sec", openedNodeId)
    }

    @Test
    fun `HomeScreen preserves non-legacy custom platformName from admin branding`() {
        val customConfig = PlatformConfig(
            platformName = "أكاديمية النخبة",
            platformTagline = "شعار مخصص",
            homeHeadline = "استكشف الدروس",
            primaryColorHex = "#142A43",
            secondaryColorHex = "#167D83"
        )
        composeTestRule.setContent {
            MidadTheme(platformConfig = customConfig) {
                HomeScreen(
                    userProfile = UserProfile(userId = "u1", displayName = "طالب تجريبي"),
                    isAdmin = false,
                    searchQuery = "",
                    onSearchQueryChange = {},
                    searchResults = SearchResults(),
                    subjectsState = UiState.Success(emptyList()),
                    lessonsState = UiState.Success(emptyList()),
                    materialsState = UiState.Success(emptyList()),
                    announcementsState = UiState.Success(emptyList()),
                    favoritesState = UiState.Success(emptyList()),
                    progressState = UiState.Success(emptyList()),
                    readAnnouncementIds = emptySet(),
                    onOpenSubject = {},
                    onViewAllSubjects = {},
                    onWatchLesson = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {},
                    onToggleFavoriteLesson = {},
                    onToggleFavoriteMaterial = {},
                    onOpenAnnouncement = {},
                    onOpenNotifications = {},
                    onOpenLibrary = {},
                    onOpenAdminPanel = {},
                    platformConfig = customConfig
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("أكاديمية النخبة").assertIsDisplayed()
        composeTestRule.onNodeWithText("استكشف الدروس").assertIsDisplayed()
    }

    @Test
    fun `AccountScreen switches theme preference and triggers manual update check`() {
        var selectedMode: ThemePreferenceMode = ThemePreferenceMode.SYSTEM
        var updateCheckTriggered = false

        composeTestRule.setContent {
            MidadTheme(darkTheme = false) {
                AccountScreen(
                    userProfile = UserProfile(userId = "u1", displayName = "طالب مداد", email = "student@midad.edu"),
                    isAdmin = false,
                    favoritesCount = 3,
                    watchedCount = 7,
                    completedCount = 2,
                    onOpenAdminPanel = {},
                    onSignOut = {},
                    themeMode = selectedMode,
                    onThemeModeChange = { selectedMode = it },
                    updateState = AppUpdateState.Idle,
                    onCheckForUpdates = { updateCheckTriggered = true }
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("account_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("theme_mode_DARK").performScrollTo().performClick()
        assertEquals(ThemePreferenceMode.DARK, selectedMode)
        composeTestRule.onNodeWithTag("update_check_btn").performScrollTo().performClick()
        org.junit.Assert.assertTrue(updateCheckTriggered)
    }

    @Test
    fun `CatalogBrowserScreen shows child grades and descendant subjects`() {
        val parentStage = CatalogNode(id = "stage1", title = "المرحلة الثانوية", typeLabel = "مرحلة")
        val childBranch = CatalogNode(id = "branch1", parentId = "stage1", title = "الفرع العلمي", typeLabel = "فرع")
        val subj = Subject(id = "phys", title = "الفيزياء", nodeIds = listOf("branch1"))

        composeTestRule.setContent {
            ABKTheme {
                CatalogBrowserScreen(
                    node = parentStage,
                    allNodes = listOf(parentStage, childBranch),
                    subjects = listOf(subj),
                    lessons = emptyList(),
                    materials = emptyList(),
                    onBack = {},
                    onOpenChildNode = {},
                    onOpenSubject = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("الفرع العلمي").assertIsDisplayed()
        composeTestRule.onNodeWithTag("catalog_browser_screen")
            .performScrollToNode(hasTestTag("subject_card_phys"))
        composeTestRule.onNodeWithTag("subject_card_phys").assertIsDisplayed()
    }

    @Test
    fun `LessonTeachersScreen displays multiple teachers explaining the same lesson`() {
        val lesson = Lesson(
            id = "les_limits",
            subjectId = "math",
            subjectName = "الرياضيات",
            unitTitle = "النهايات والاستمرار",
            title = "درس النهايات الأساسية"
        )
        val t1 = Teacher(id = "t1", name = "أ. قصي البابا", headline = "مدرس رياضيات")
        val t2 = Teacher(id = "t2", name = "أ. كريم عيتي", headline = "خبير التحليل")
        val exp1 = LessonExplanation(id = "e1", lessonId = "les_limits", teacherId = "t1", teacherName = t1.name, title = "شرح مبسط مع أمثلة")
        val exp2 = LessonExplanation(id = "e2", lessonId = "les_limits", teacherId = "t2", teacherName = t2.name, title = "شرح متقدم وتمارين")

        var clickedExpId: String? = null

        composeTestRule.setContent {
            ABKTheme {
                LessonTeachersScreen(
                    lesson = lesson,
                    explanations = listOf(exp1, exp2),
                    contentBlocks = emptyList(),
                    teachers = listOf(t1, t2),
                    relatedMaterials = emptyList(),
                    isFavorite = false,
                    progress = null,
                    onBack = {},
                    onToggleFavorite = {},
                    onOpenExplanation = { clickedExpId = it },
                    onWatchDirectLesson = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("أ. قصي البابا").assertIsDisplayed()
        composeTestRule.onNodeWithText("أ. كريم عيتي").assertIsDisplayed()
        composeTestRule.onNodeWithTag("explanation_teacher_card_e2").performClick()
        assertEquals("e2", clickedExpId)
    }

    @Test
    fun `ExplanationDetailScreen evaluates interactive quiz and expands Q&A`() {
        val teacher = Teacher(id = "t1", name = "أ. كريم عيتي")
        val exp = LessonExplanation(id = "e1", lessonId = "l1", teacherId = "t1", teacherName = teacher.name, title = "الشرح الشامل")
        val qaBlock = ContentBlock(
            id = "b_qa",
            blockType = ContentBlockType.QA.name,
            title = "أسئلة متكررة",
            qaItems = listOf(QaItem(question = "متى تكون النهاية موجودة؟", answer = "عندما تتساوى النهاية من اليمين واليسار."))
        )
        val quizBlock = ContentBlock(
            id = "b_quiz",
            blockType = ContentBlockType.QUIZ_MCQ.name,
            title = "اختبار سريع",
            quizQuestions = listOf(
                QuizQuestion(
                    id = "q1",
                    prompt = "ما ناتج 2 + 3؟",
                    options = listOf("4", "5", "6"),
                    correctIndex = 1L,
                    explanation = "مجموع 2 و 3 يساوي 5."
                )
            )
        )

        composeTestRule.setContent {
            ABKTheme {
                ExplanationDetailScreen(
                    explanation = exp,
                    teacher = teacher,
                    lesson = null,
                    blocks = listOf(qaBlock, quizBlock),
                    customSectionTypes = emptyList(),
                    relatedMaterials = emptyList(),
                    onBack = {},
                    onPlayBlockVideo = {},
                    onOpenBlockPdf = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {}
                )
            }
        }
        composeTestRule.waitForIdle()

        // Expand Q&A
        composeTestRule.onNodeWithTag("qa_item_b_qa_0").performScrollTo().performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("عندما تتساوى النهاية من اليمين واليسار.").assertIsDisplayed()

        // Answer quiz & grade
        composeTestRule.onNodeWithTag("quiz_opt_b_quiz_0_1").performScrollTo().performClick()
        composeTestRule.onNodeWithTag("submit_quiz_btn_b_quiz").performScrollTo().performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("نتيجتك: 1 / 1").assertIsDisplayed()
        composeTestRule.onNodeWithText("التوضيح: مجموع 2 و 3 يساوي 5.").assertIsDisplayed()
    }

    @Test
    fun `SuspendedAccountScreen displays BANNED message and ban reason`() {
        composeTestRule.setContent {
            ABKTheme {
                SuspendedAccountScreen(
                    status = AccountStatus.BANNED,
                    banReason = "مخالفة تعليمات الاستخدام",
                    onSignOut = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("تم حظر الحساب من الإدارة").assertIsDisplayed()
        composeTestRule.onNodeWithText("السبب المسجل: مخالفة تعليمات الاستخدام").assertIsDisplayed()
    }

    @Test
    fun `ExplanationDetailScreen renders ASSIGNMENT content block`() {
        val teacher = Teacher(id = "t1", name = "أ. كريم عيتي")
        val exp = LessonExplanation(id = "e1", lessonId = "l1", teacherId = "t1", teacherName = teacher.name, title = "الشرح")
        val assignmentBlock = ContentBlock(
            id = "b_hw",
            blockType = ContentBlockType.ASSIGNMENT.name,
            title = "واجب الدرس الأول",
            bodyText = "حل التمارين من 1 إلى 5",
            mediaUrl = "https://example.com/hw.pdf"
        )

        composeTestRule.setContent {
            ABKTheme {
                ExplanationDetailScreen(
                    explanation = exp,
                    teacher = teacher,
                    lesson = null,
                    blocks = listOf(assignmentBlock),
                    customSectionTypes = emptyList(),
                    relatedMaterials = emptyList(),
                    onBack = {},
                    onPlayBlockVideo = {},
                    onOpenBlockPdf = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("block_assignment_card_b_hw").assertIsDisplayed()
        composeTestRule.onNodeWithText("واجب الدرس الأول").assertIsDisplayed()
        composeTestRule.onNodeWithText("حل التمارين من 1 إلى 5").assertIsDisplayed()
    }

    @Test
    fun `VideoPlayerScreen plays YouTube Shorts in-app, toggles fullscreen cleanly, and hides external YouTube button`() {
        val sampleLesson = Lesson(
            id = "les_yt_1",
            subjectId = "math",
            subjectName = "الرياضيات",
            unitTitle = "المتتاليات",
            title = "شرح درس المتتاليات الهندسية",
            teacherName = "أ. كريم عيتي",
            videoUrl = "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            videoSourceType = "YOUTUBE"
        )

        composeTestRule.setContent {
            ABKTheme {
                VideoPlayerScreen(
                    lesson = sampleLesson,
                    relatedMaterials = emptyList(),
                    initialProgress = null,
                    isFavorite = false,
                    onBack = {},
                    onSaveProgress = { _, _, _ -> },
                    onToggleFavorite = {},
                    onOpenMaterial = {},
                    onDownloadMaterial = {},
                    onShareMaterial = {}
                )
            }
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("video_player_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("youtube_inapp_webview").assertIsDisplayed()
        composeTestRule.onNodeWithTag("open_on_youtube_btn").assertDoesNotExist()
        composeTestRule.onNodeWithText("فتح الفيديو على YouTube").assertDoesNotExist()
        composeTestRule.onNodeWithText("فتح على YouTube").assertDoesNotExist()

        // Enter fullscreen inside ABK
        composeTestRule.onNodeWithTag("enter_fullscreen_button").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("video_fullscreen_container").assertIsDisplayed()
        composeTestRule.onNodeWithTag("exit_fullscreen_button").assertIsDisplayed()

        // Exit fullscreen back to lesson view inside ABK
        composeTestRule.onNodeWithTag("exit_fullscreen_button").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("video_player_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("youtube_inapp_webview").assertIsDisplayed()
    }
}
