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

enum class PublishStatus(val labelAr: String) {
    DRAFT("مسودة"),
    PUBLISHED("منشور"),
    ARCHIVED("مؤرشف");

    companion object {
        fun fromString(raw: String?): PublishStatus =
            entries.firstOrNull { it.name == raw } ?: PUBLISHED
    }
}

enum class CatalogNodeType(val labelAr: String) {
    STAGE("مرحلة"),
    GRADE("صف"),
    BRANCH("فرع"),
    COURSE("مسار / دورة"),
    CUSTOM("قسم مخصص");

    companion object {
        fun fromString(raw: String?): CatalogNodeType =
            entries.firstOrNull { it.name == raw } ?: CUSTOM
    }
}

enum class ContentBlockType(val labelAr: String) {
    YOUTUBE_VIDEO("فيديو يوتيوب"),
    EXTERNAL_VIDEO("فيديو مباشر / خارجي"),
    PDF_FILE("ملف PDF / نوطة"),
    IMAGE("صورة تعليمية"),
    NOTE_SUMMARY("ملخص / ملاحظات"),
    QA("سؤال وجواب"),
    QUIZ_MCQ("اختبار اختيار من متعدد"),
    QUIZ_TRUE_FALSE("اختبار صح وخطأ"),
    INTERACTIVE_EXAM("اختبار تفاعلي شامل"),
    RICH_TEXT("نص منسق"),
    EXTERNAL_LINK("رابط خارجي"),
    DOWNLOAD_FILE("ملف للتنزيل"),
    ASSIGNMENT("واجب / تكليف"),
    CUSTOM("قسم مخصص");

    companion object {
        fun fromString(raw: String?): ContentBlockType =
            entries.firstOrNull { it.name == raw } ?: CUSTOM
    }
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
    SUSPENDED("معطل"),
    BANNED("محظور");

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
    PRACTICE_EXAM("امتحان تدريبي"),
    ASSIGNMENT("واجب / تكليف");

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
    val displayName: String? = null,
    val role: String = "ADMIN",
    val teacherId: String? = null,
    val active: Boolean = true,
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
    val banReason: String? = null,
    val lastActiveAt: Timestamp? = null,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedRole(): UserRole = UserRole.fromString(role)
    fun parsedStatus(): AccountStatus = AccountStatus.fromString(accountStatus)
}

@Keep
@IgnoreExtraProperties
data class CatalogNode(
    @DocumentId val id: String = "",
    val parentId: String? = null,
    val nodeType: String = CatalogNodeType.STAGE.name,
    val typeLabel: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val imageUrl: String? = null,
    val iconKey: String? = null,
    val accentColorHex: String? = null,
    val sortOrder: Long = 0L,
    val published: Boolean = true,
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedNodeType(): CatalogNodeType = CatalogNodeType.fromString(nodeType)
}

@Keep
@IgnoreExtraProperties
data class Subject(
    @DocumentId val id: String = "",
    val title: String = "",
    val description: String = "",
    val imageUrl: String? = null,
    val iconKey: String = "general",
    val nodeIds: List<String> = emptyList(),
    val nodePathLabel: String? = null,
    val teacherIds: List<String> = emptyList(),
    val sortOrder: Long = 0L,
    val published: Boolean = true,
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class UnitItem(
    @DocumentId val id: String = "",
    val subjectId: String = "",
    val subjectName: String = "",
    val title: String = "",
    val description: String? = null,
    val sortOrder: Long = 1L,
    val published: Boolean = true,
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class Teacher(
    @DocumentId val id: String = "",
    val name: String = "",
    val headline: String? = null,
    val bio: String? = null,
    val photoUrl: String? = null,
    val linkedUid: String? = null,
    val subjectIds: List<String> = emptyList(),
    val nodeIds: List<String> = emptyList(),
    val youtubeUrl: String? = null,
    val telegramUrl: String? = null,
    val websiteUrl: String? = null,
    val sortOrder: Long = 0L,
    val published: Boolean = true,
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
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
    val unitId: String? = null,
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
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedVideoType(): VideoSourceType = VideoSourceType.fromString(videoSourceType)
}

@Keep
@IgnoreExtraProperties
data class LessonExplanation(
    @DocumentId val id: String = "",
    val lessonId: String = "",
    val lessonTitle: String? = null,
    val subjectId: String = "",
    val subjectName: String? = null,
    val teacherId: String = "",
    val teacherName: String = "",
    val teacherPhotoUrl: String? = null,
    val teacherUid: String? = null,
    val title: String = "",
    val summary: String? = null,
    val sortOrder: Long = 0L,
    val published: Boolean = true,
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class QaItem(
    val question: String = "",
    val answer: String = ""
)

@Keep
@IgnoreExtraProperties
data class QuizQuestion(
    val id: String = "",
    val prompt: String = "",
    val options: List<String> = emptyList(),
    val correctIndex: Long = 0L,
    val explanation: String? = null,
    val questionType: String = "MCQ"
)

@Keep
@IgnoreExtraProperties
data class ContentBlock(
    @DocumentId val id: String = "",
    val explanationId: String = "",
    val lessonId: String = "",
    val subjectId: String = "",
    val teacherId: String = "",
    val teacherUid: String? = null,
    val blockType: String = ContentBlockType.RICH_TEXT.name,
    val customTypeKey: String? = null,
    val title: String = "",
    val subtitle: String? = null,
    val bodyText: String? = null,
    val mediaUrl: String? = null,
    val thumbnailUrl: String? = null,
    val durationLabel: String? = null,
    val fileSizeLabel: String? = null,
    val qaItems: List<QaItem> = emptyList(),
    val quizQuestions: List<QuizQuestion> = emptyList(),
    val sortOrder: Long = 0L,
    val published: Boolean = true,
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
) {
    fun parsedBlockType(): ContentBlockType = ContentBlockType.fromString(blockType)
}

@Keep
@IgnoreExtraProperties
data class CustomSectionType(
    @DocumentId val id: String = "",
    val key: String = "",
    val labelAr: String = "",
    val description: String? = null,
    val iconKey: String? = null,
    val accentColorHex: String? = null,
    val published: Boolean = true,
    val createdBy: String = ""
)

@Keep
@IgnoreExtraProperties
data class BottomNavConfigItem(
    val route: String = "",
    val label: String = "",
    val iconKey: String = "",
    val visible: Boolean = true,
    val sortOrder: Long = 0L
)

@Keep
@IgnoreExtraProperties
data class PlatformConfig(
    val platformName: String = "مداد التعليمية",
    val platformTagline: String = "طريقك نحو التفوق",
    val homeHeadline: String = "ماذا تدرس اليوم؟",
    val welcomeTitle: String = "ابدأ رحلتك الدراسية نحو التفوق",
    val welcomeSubtitle: String = "دروس مرئية منظمة، شروحات لعدة أساتذة، كتب ونوطات PDF واختبارات تفاعلية.",
    val logoUrl: String? = null,
    val heroBannerUrl: String? = null,
    val primaryColorHex: String = "#142A43",
    val secondaryColorHex: String = "#167D83",
    val accentColorHex: String? = "#C7A15A",
    val bottomNavItems: List<BottomNavConfigItem> = emptyList(),
    val allowOfflinePdf: Boolean = true,
    val showAnnouncements: Boolean = true,
    val showContinueWatching: Boolean = true,
    val maintenanceMode: Boolean = false,
    val updatedBy: String = ""
)

private val legacyAbkNames = setOf("ABK", "منصة ABK", "منصة ABK التعليمية", "أكاديمية ABK", "مِداد التعليمية")
private val legacyAbkTaglines = setOf("المنصة التعليمية", "طريقك للتفوق الدراسي في مكان واحد", "طريقك نحو التفوّق")

fun PlatformConfig.resolvedForMidad(): PlatformConfig {
    val cleanName = platformName.trim()
    val cleanTagline = platformTagline.trim()
    return copy(
        platformName = if (cleanName.isBlank() || cleanName in legacyAbkNames) "مداد التعليمية" else platformName,
        platformTagline = if (cleanTagline.isBlank() || cleanTagline in legacyAbkTaglines) "طريقك نحو التفوق" else platformTagline,
        primaryColorHex = if (primaryColorHex.equals("#0F294A", ignoreCase = true)) "#142A43" else primaryColorHex,
        secondaryColorHex = if (secondaryColorHex.equals("#0EA5E9", ignoreCase = true)) "#167D83" else secondaryColorHex,
        accentColorHex = if (accentColorHex.isNullOrBlank() || accentColorHex.equals("#38BDF8", ignoreCase = true)) "#C7A15A" else accentColorHex
    )
}

@Keep
@IgnoreExtraProperties
data class StudyMaterial(
    @DocumentId val id: String = "",
    val subjectId: String = "",
    val subjectName: String = "",
    val lessonId: String? = null,
    val lessonTitle: String? = null,
    val teacherId: String? = null,
    val materialType: String = MaterialType.STUDY_NOTE.name,
    val title: String = "",
    val description: String = "",
    val coverUrl: String? = null,
    val fileUrl: String = "",
    val published: Boolean = true,
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
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
    val status: String = PublishStatus.PUBLISHED.name,
    val deletedAt: Timestamp? = null,
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
