package com.example.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.firebase.extractReadableFirestoreMessage
import com.example.data.model.AccountStatus
import com.example.data.model.Announcement
import com.example.data.model.AnnouncementCategory
import com.example.data.model.Lesson
import com.example.data.model.MaterialType
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.UiState
import com.example.data.model.UserProfile
import com.example.data.model.VideoSourceType
import com.example.data.repository.AdminRepository
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AdminViewModel(
    private val adminRepository: AdminRepository
) : ViewModel() {

    private companion object {
        const val TAG = "AdminViewModel"
        const val STOP_TIMEOUT_MS = 5000L
    }

    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val events = _events.asSharedFlow()

    val subjectsState: StateFlow<UiState<List<Subject>>> =
        adminRepository.observeAllSubjects().asUiState("تعذر تحميل المواد")

    val lessonsState: StateFlow<UiState<List<Lesson>>> =
        adminRepository.observeAllLessons().asUiState("تعذر تحميل الدروس")

    val materialsState: StateFlow<UiState<List<StudyMaterial>>> =
        adminRepository.observeAllMaterials().asUiState("تعذر تحميل الملفات")

    val announcementsState: StateFlow<UiState<List<Announcement>>> =
        adminRepository.observeAllAnnouncements().asUiState("تعذر تحميل الإعلانات")

    val usersState: StateFlow<UiState<List<UserProfile>>> =
        adminRepository.observeAllUsers().asUiState("تعذر تحميل المستخدمين")

    fun seedCoreSubjects() {
        viewModelScope.launch {
            adminRepository.seedCoreSubjects()
                .onSuccess { count ->
                    val msg = if (count > 0) "تمت إضافة $count مواد دراسية بنجاح" else "المواد الأساسية موجودة بالفعل"
                    _events.tryEmit(msg)
                }
                .onFailure { err ->
                    _events.tryEmit(err.extractReadableFirestoreMessage("تعذر إضافة المواد الأساسية"))
                }
        }
    }

    fun saveSubject(
        existingId: String?,
        title: String,
        description: String,
        imageUrl: String?,
        iconKey: String,
        sortOrder: Long,
        published: Boolean
    ) {
        viewModelScope.launch {
            adminRepository.saveSubject(existingId, title, description, imageUrl, iconKey, sortOrder, published)
                .onSuccess { _events.tryEmit("تم حفظ المادة بنجاح") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر حفظ المادة")) }
        }
    }

    fun deleteSubject(subjectId: String) {
        viewModelScope.launch {
            adminRepository.deleteSubject(subjectId)
                .onSuccess { _events.tryEmit("تم حذف المادة") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر حذف المادة")) }
        }
    }

    fun saveLesson(
        existingId: String?,
        subject: Subject,
        unitTitle: String,
        unitOrder: Long,
        lessonOrder: Long,
        title: String,
        description: String,
        teacherName: String?,
        durationLabel: String?,
        thumbnailUrl: String?,
        videoUrl: String,
        videoSourceType: VideoSourceType,
        published: Boolean
    ) {
        viewModelScope.launch {
            adminRepository.saveLesson(
                existingId = existingId,
                subject = subject,
                unitTitle = unitTitle,
                unitOrder = unitOrder,
                lessonOrder = lessonOrder,
                title = title,
                description = description,
                teacherName = teacherName,
                durationLabel = durationLabel,
                thumbnailUrl = thumbnailUrl,
                videoUrl = videoUrl,
                videoSourceType = videoSourceType,
                published = published
            ).onSuccess { _events.tryEmit("تم حفظ الدرس بنجاح") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر حفظ الدرس")) }
        }
    }

    fun toggleLessonPublished(lesson: Lesson) {
        viewModelScope.launch {
            adminRepository.toggleLessonPublished(lesson)
                .onSuccess { _events.tryEmit(if (lesson.published) "تم إخفاء الدرس" else "تم نشر الدرس") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر تحديث حالة الدرس")) }
        }
    }

    fun deleteLesson(lessonId: String) {
        viewModelScope.launch {
            adminRepository.deleteLesson(lessonId)
                .onSuccess { _events.tryEmit("تم حذف الدرس") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر حذف الدرس")) }
        }
    }

    fun saveMaterial(
        existingId: String?,
        subject: Subject,
        lesson: Lesson?,
        materialType: MaterialType,
        title: String,
        description: String,
        coverUrl: String?,
        fileUrl: String,
        published: Boolean
    ) {
        viewModelScope.launch {
            adminRepository.saveMaterial(
                existingId = existingId,
                subject = subject,
                lesson = lesson,
                materialType = materialType,
                title = title,
                description = description,
                coverUrl = coverUrl,
                fileUrl = fileUrl,
                published = published
            ).onSuccess { _events.tryEmit("تم حفظ الملف بنجاح") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر حفظ الملف")) }
        }
    }

    fun deleteMaterial(materialId: String) {
        viewModelScope.launch {
            adminRepository.deleteMaterial(materialId)
                .onSuccess { _events.tryEmit("تم حذف الملف") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر حذف الملف")) }
        }
    }

    fun saveAnnouncement(
        existingId: String?,
        title: String,
        body: String,
        category: AnnouncementCategory,
        subjectId: String?,
        pinned: Boolean,
        published: Boolean
    ) {
        viewModelScope.launch {
            adminRepository.saveAnnouncement(
                existingId = existingId,
                title = title,
                body = body,
                category = category,
                subjectId = subjectId,
                pinned = pinned,
                published = published
            ).onSuccess { _events.tryEmit("تم نشر الإعلان والتنبيه للطلاب") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر نشر الإعلان")) }
        }
    }

    fun deleteAnnouncement(announcementId: String) {
        viewModelScope.launch {
            adminRepository.deleteAnnouncement(announcementId)
                .onSuccess { _events.tryEmit("تم حذف الإعلان") }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر حذف الإعلان")) }
        }
    }

    fun toggleUserSuspension(user: UserProfile) {
        val nextStatus = if (user.parsedStatus() == AccountStatus.ACTIVE) {
            AccountStatus.SUSPENDED
        } else {
            AccountStatus.ACTIVE
        }
        viewModelScope.launch {
            adminRepository.setUserAccountStatus(user.userId, nextStatus)
                .onSuccess {
                    _events.tryEmit(
                        if (nextStatus == AccountStatus.SUSPENDED) "تم تعطيل حساب الطالب"
                        else "تم تفعيل حساب الطالب"
                    )
                }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر تحديث حالة الحساب")) }
        }
    }

    fun toggleAdminPrivilege(user: UserProfile, makeAdmin: Boolean) {
        viewModelScope.launch {
            adminRepository.setUserAdminRole(user, makeAdmin)
                .onSuccess {
                    _events.tryEmit(if (makeAdmin) "تم منح صلاحية الإدارة" else "تمت إزالة صلاحية الإدارة")
                }
                .onFailure { err -> _events.tryEmit(err.extractReadableFirestoreMessage("تعذر تعديل الصلاحية")) }
        }
    }

    private fun <T> Flow<List<T>>.asUiState(errorFallback: String): StateFlow<UiState<List<T>>> {
        return map<List<T>, UiState<List<T>>> { UiState.Success(it) }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val rootError = firestoreError ?: error
                Log.w(TAG, "Admin stream error", rootError)
                emit(UiState.Error(rootError.extractReadableFirestoreMessage(errorFallback)))
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = UiState.Loading
            )
    }
}
