package com.example.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.firebase.extractReadableFirestoreMessage
import com.example.data.model.Announcement
import com.example.data.model.FavoriteItem
import com.example.data.model.FavoriteType
import com.example.data.model.Lesson
import com.example.data.model.LessonProgress
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.UiState
import com.example.data.model.UserProfile
import com.example.data.repository.AbkContentRepository
import com.example.data.repository.StudentRepository
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SearchResults(
    val subjects: List<Subject> = emptyList(),
    val lessons: List<Lesson> = emptyList(),
    val materials: List<StudyMaterial> = emptyList()
) {
    val isEmpty: Boolean get() = subjects.isEmpty() && lessons.isEmpty() && materials.isEmpty()
}

class MainViewModel(
    private val contentRepository: AbkContentRepository,
    private val studentRepository: StudentRepository,
    private val currentUserId: String,
    private val currentUserEmail: String?,
    private val isEmailVerified: Boolean,
    firebaseUser: FirebaseUser
) : ViewModel() {

    private companion object {
        const val TAG = "MainViewModel"
        const val STOP_TIMEOUT_MS = 5000L
    }

    private val _snackbarEvents = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val snackbarEvents = _snackbarEvents.asSharedFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    init {
        viewModelScope.launch {
            studentRepository.ensureUserProfile(firebaseUser)
        }
    }

    val userProfile: StateFlow<UserProfile?> = studentRepository.observeUserProfile(currentUserId)
        .catch { error ->
            unwrapFirestoreError(error, "فشل تحميل ملف الطالب")
            emit(null)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    val isAdmin: StateFlow<Boolean> = studentRepository.observeIsAdmin(
        currentUserId,
        currentUserEmail,
        isEmailVerified
    )
        .catch { error ->
            if (error is CancellationException) throw error
            emit(false)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), false)

    val subjectsState: StateFlow<UiState<List<Subject>>> =
        contentRepository.observePublishedSubjects().asUiState("تعذر تحميل المواد الدراسية")

    val lessonsState: StateFlow<UiState<List<Lesson>>> =
        contentRepository.observePublishedLessons().asUiState("تعذر تحميل الدروس")

    val materialsState: StateFlow<UiState<List<StudyMaterial>>> =
        contentRepository.observePublishedMaterials().asUiState("تعذر تحميل المكتبة")

    val announcementsState: StateFlow<UiState<List<Announcement>>> =
        contentRepository.observePublishedAnnouncements().asUiState("تعذر تحميل الإعلانات")

    val favoritesState: StateFlow<UiState<List<FavoriteItem>>> =
        studentRepository.observeFavorites(currentUserId).asUiState("تعذر تحميل المفضلة")

    val progressState: StateFlow<UiState<List<LessonProgress>>> =
        studentRepository.observeProgress(currentUserId).asUiState("تعذر تحميل تقدم المشاهدة")

    val readAnnouncementIds: StateFlow<Set<String>> =
        studentRepository.observeReadAnnouncementIds(currentUserId)
            .catch { error ->
                if (error is CancellationException) throw error
                emit(emptySet())
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptySet())

    val unreadAnnouncementsCount: StateFlow<Int> = combine(
        announcementsState,
        readAnnouncementIds
    ) { state, readIds ->
        val items = (state as? UiState.Success)?.data ?: emptyList()
        items.count { it.id !in readIds }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), 0)

    val searchResults: StateFlow<SearchResults> = combine(
        _searchQuery,
        subjectsState,
        lessonsState,
        materialsState
    ) { query, subjState, lessonState, matState ->
        val q = query.trim()
        if (q.isEmpty()) {
            SearchResults()
        } else {
            val subjects = (subjState as? UiState.Success)?.data.orEmpty()
                .filter {
                    it.title.contains(q, ignoreCase = true) ||
                        it.description.contains(q, ignoreCase = true)
                }
            val lessons = (lessonState as? UiState.Success)?.data.orEmpty()
                .filter {
                    it.title.contains(q, ignoreCase = true) ||
                        it.description.contains(q, ignoreCase = true) ||
                        it.subjectName.contains(q, ignoreCase = true) ||
                        it.unitTitle.contains(q, ignoreCase = true) ||
                        (it.teacherName?.contains(q, ignoreCase = true) == true)
                }
            val materials = (matState as? UiState.Success)?.data.orEmpty()
                .filter {
                    it.title.contains(q, ignoreCase = true) ||
                        it.description.contains(q, ignoreCase = true) ||
                        it.subjectName.contains(q, ignoreCase = true) ||
                        it.parsedType().labelAr.contains(q, ignoreCase = true)
                }
            SearchResults(subjects, lessons, materials)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SearchResults())

    fun updateSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun toggleFavorite(
        itemId: String,
        itemType: FavoriteType,
        title: String,
        subtitle: String,
        subjectName: String,
        imageUrl: String?
    ) {
        viewModelScope.launch {
            val result = studentRepository.toggleFavorite(
                userId = currentUserId,
                itemId = itemId,
                itemType = itemType,
                title = title,
                subtitle = subtitle,
                subjectName = subjectName,
                imageUrl = imageUrl
            )
            result.onSuccess { added ->
                _snackbarEvents.tryEmit(if (added) "تمت الإضافة إلى المفضلة" else "تمت الإزالة من المفضلة")
            }.onFailure { err ->
                _snackbarEvents.tryEmit(err.extractReadableFirestoreMessage("تعذر تحديث المفضلة"))
            }
        }
    }

    fun saveLessonProgress(
        lesson: Lesson,
        positionMs: Long,
        durationMs: Long,
        completed: Boolean
    ) {
        viewModelScope.launch {
            studentRepository.saveLessonProgress(
                userId = currentUserId,
                lesson = lesson,
                positionMs = positionMs,
                durationMs = durationMs,
                completed = completed
            )
        }
    }

    fun markAnnouncementRead(announcementId: String) {
        viewModelScope.launch {
            studentRepository.markAnnouncementRead(currentUserId, announcementId)
        }
    }

    fun markAllAnnouncementsRead() {
        val announcements = (announcementsState.value as? UiState.Success)?.data.orEmpty()
        val readIds = readAnnouncementIds.value
        val unread = announcements.filter { it.id !in readIds }
        if (unread.isEmpty()) return
        viewModelScope.launch {
            unread.forEach { announcement ->
                studentRepository.markAnnouncementRead(currentUserId, announcement.id)
            }
            _snackbarEvents.tryEmit("تم تحديد جميع الإشعارات كمقروءة")
        }
    }

    fun showMessage(message: String) {
        _snackbarEvents.tryEmit(message)
    }

    private fun <T> Flow<List<T>>.asUiState(errorFallback: String): StateFlow<UiState<List<T>>> {
        return map<List<T>, UiState<List<T>>> { UiState.Success(it) }
            .catch { error ->
                val msg = unwrapFirestoreError(error, errorFallback)
                emit(UiState.Error(msg))
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = UiState.Loading
            )
    }

    private fun unwrapFirestoreError(error: Throwable, fallback: String): String {
        val firestoreError = generateSequence(error) { it.cause }
            .filterIsInstance<FirebaseFirestoreException>()
            .firstOrNull()
        if (firestoreError == null && error is CancellationException) throw error
        val rootError = firestoreError ?: error
        Log.w(TAG, "Stream error", rootError)
        return rootError.extractReadableFirestoreMessage(fallback)
    }
}
