package com.example

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import com.example.data.model.Subject
import com.example.data.model.UiState
import com.example.data.model.UserProfile
import com.example.ui.screens.AuthScreen
import com.example.ui.screens.HomeScreen
import com.example.ui.theme.ABKTheme
import com.example.viewmodel.SearchResults
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
        composeTestRule.onNodeWithText("ABK").assertIsDisplayed()
        composeTestRule.onNodeWithTag("auth_error_banner")
            .performScrollTo()
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("google_sign_in_button")
            .performScrollTo()
            .assertIsDisplayed()
    }

    @Test
    fun `HomeScreen renders cleanly with student profile and subjects`() {
        val sampleSubject = Subject(
            id = "math",
            title = "الرياضيات",
            description = "الجبر والتحليل",
            iconKey = "math",
            sortOrder = 1L,
            published = true
        )
        composeTestRule.setContent {
            ABKTheme {
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
                    onOpenAdminPanel = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("home_screen").assertIsDisplayed()
        composeTestRule.onNodeWithText("ABK").assertIsDisplayed()
        composeTestRule.onNodeWithText("الرياضيات").assertIsDisplayed()
    }
}
