package com.example.data.model

import androidx.annotation.Keep
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.ServerTimestamp

sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
}

enum class UserRole {
    STUDENT,
    ADMIN;

    companion object {
        fun fromString(raw: String?): UserRole =
            entries.firstOrNull { it.name == raw } ?: STUDENT
    }
}

enum class AccountStatus(val labelAr: String) {
    ACTIVE("نشط"),
    SUSPENDED("معطل");

    companion object {
        fun fromString(raw: String?): AccountStatus =
            entries.firstOrNull { it.name == raw } ?: ACTIVE
    }
}

enum class VideoSourceType(val labelAr: String) {
    YOUTUBE("YouTube"),
    MP4("ملف MP4 مباشر"),
    EXTERNAL("رابط استضافة خارجية");

    companion object {
        fun fromString(raw: String?): VideoSourceType =
            entries.firstOrNull { it.name == raw } ?: EXTERNAL
    }
}

enum class MaterialType(val labelAr: String) {
    TEXTBOOK("كتاب مدرسي"),
    STUDY_NOTE("نوطة دراسية"),
    SUMMARY("ملخص"),
    IMPORTANT_QUESTIONS("أسئلة مهمة"),
    WORKSHEET("ورقة عمل"),
    PRACTICE_EXAM("امتحان تدريبي");

    companion object {
        fun fromString(raw: String?): MaterialType =
            entries.firstOrNull { it.name == raw } ?: STUDY_NOTE
    }
}

enum class AnnouncementCategory(val labelAr: String) {
    NEW_LESSON("درس جديد"),
    NEW_MATERIAL("ملف جديد"),
    GENERAL("إعلان عام"),
    URGENT("تنبيه هام");

    companion object {
        fun fromString(raw: String?): AnnouncementCategory =
            entries.firstOrNull { it.name == raw } ?: GENERAL
    }
}

enum class FavoriteType {
    LESSON,
    MATERIAL;

    companion object {
        fun fromString(raw: String?): FavoriteType =
            entries.firstOrNull { it.name == raw } ?: LESSON
    }
}

@Keep
@IgnoreExtraProperties
data class AdminEntry(
    @DocumentId val id: String = "",
    val uid: String = "",
    val email: String = "",
    val grantedBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class UserProfile(
    @DocumentId val id: String = "",
    val userId: String = "",
    val displayName: String = "",
    val email: String = "",
    val photoUrl: String? = null,
    val role: String = UserRole.STUDENT.name,
    val accountStatus: String = AccountStatus.ACTIVE.name,
    val lastActiveAt: Timestamp? = null,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedRole(): UserRole = UserRole.fromString(role)
    fun parsedStatus(): AccountStatus = AccountStatus.fromString(accountStatus)
}

@Keep
@IgnoreExtraProperties
data class Subject(
    @DocumentId val id: String = "",
    val title: String = "",
    val description: String = "",
    val imageUrl: String? = null,
    val iconKey: String = "general",
    val sortOrder: Long = 0L,
    val published: Boolean = true,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class Lesson(
    @DocumentId val id: String = "",
    val subjectId: String = "",
    val subjectName: String = "",
    val unitTitle: String = "",
    val unitOrder: Long = 1L,
    val lessonOrder: Long = 1L,
    val title: String = "",
    val description: String = "",
    val teacherName: String? = null,
    val durationLabel: String? = null,
    val thumbnailUrl: String? = null,
    val videoUrl: String = "",
    val videoSourceType: String = VideoSourceType.YOUTUBE.name,
    val published: Boolean = true,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedVideoType(): VideoSourceType = VideoSourceType.fromString(videoSourceType)
}

@Keep
@IgnoreExtraProperties
data class StudyMaterial(
    @DocumentId val id: String = "",
    val subjectId: String = "",
    val subjectName: String = "",
    val lessonId: String? = null,
    val lessonTitle: String? = null,
    val materialType: String = MaterialType.STUDY_NOTE.name,
    val title: String = "",
    val description: String = "",
    val coverUrl: String? = null,
    val fileUrl: String = "",
    val published: Boolean = true,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedType(): MaterialType = MaterialType.fromString(materialType)
}

@Keep
@IgnoreExtraProperties
data class Announcement(
    @DocumentId val id: String = "",
    val title: String = "",
    val body: String = "",
    val category: String = AnnouncementCategory.GENERAL.name,
    val subjectId: String? = null,
    val pinned: Boolean = false,
    val published: Boolean = true,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedCategory(): AnnouncementCategory = AnnouncementCategory.fromString(category)
}

@Keep
@IgnoreExtraProperties
data class FavoriteItem(
    @DocumentId val id: String = "",
    val userId: String = "",
    val itemId: String = "",
    val itemType: String = FavoriteType.LESSON.name,
    val title: String = "",
    val subtitle: String = "",
    val subjectName: String = "",
    val imageUrl: String? = null,
    @ServerTimestamp val createdAt: Timestamp? = null
) {
    fun parsedType(): FavoriteType = FavoriteType.fromString(itemType)
}

@Keep
@IgnoreExtraProperties
data class LessonProgress(
    @DocumentId val id: String = "",
    val userId: String = "",
    val lessonId: String = "",
    val lessonTitle: String = "",
    val subjectId: String = "",
    val subjectName: String = "",
    val thumbnailUrl: String? = null,
    val lastPositionMs: Long = 0L,
    val durationMs: Long = 0L,
    val completed: Boolean = false,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    val progressFraction: Float
        get() = if (durationMs > 0L) (lastPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f) else 0f
}

@Keep
@IgnoreExtraProperties
data class ReadAnnouncement(
    @DocumentId val id: String = "",
    val userId: String = "",
    val announcementId: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null
)
