package com.example.data.repository

import com.example.data.firebase.OperationType
import com.example.data.firebase.handleFirestoreError
import com.example.data.model.AccountStatus
import com.example.data.model.Announcement
import com.example.data.model.AnnouncementCategory
import com.example.data.model.Lesson
import com.example.data.model.MaterialType
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.UserProfile
import com.example.data.model.UserRole
import com.example.data.model.VideoSourceType
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class AdminRepository(
    private val db: FirebaseFirestore
) {
    private val auth = Firebase.auth

    private fun requireAdminUid(): String =
        auth.currentUser?.uid ?: throw IllegalStateException("Admin must be signed in.")

    fun observeAllSubjects(): Flow<List<Subject>> = flow {
        val uid = requireAdminUid()
        emitAll(
            db.collection("subjects").snapshots()
                .map { snap ->
                    snap.toObjects(Subject::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedWith(compareBy<Subject> { it.sortOrder }.thenBy { it.title })
                }
                .catch { error ->
                    logStreamError(error, uid, "subjects")
                    throw error
                }
        )
    }

    fun observeAllLessons(): Flow<List<Lesson>> = flow {
        val uid = requireAdminUid()
        emitAll(
            db.collection("lessons").snapshots()
                .map { snap ->
                    snap.toObjects(Lesson::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedWith(compareBy<Lesson> { it.subjectName }.thenBy { it.unitOrder }.thenBy { it.lessonOrder })
                }
                .catch { error ->
                    logStreamError(error, uid, "lessons")
                    throw error
                }
        )
    }

    fun observeAllMaterials(): Flow<List<StudyMaterial>> = flow {
        val uid = requireAdminUid()
        emitAll(
            db.collection("materials").snapshots()
                .map { snap ->
                    snap.toObjects(StudyMaterial::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
                }
                .catch { error ->
                    logStreamError(error, uid, "materials")
                    throw error
                }
        )
    }

    fun observeAllAnnouncements(): Flow<List<Announcement>> = flow {
        val uid = requireAdminUid()
        emitAll(
            db.collection("announcements").snapshots()
                .map { snap ->
                    snap.toObjects(Announcement::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
                }
                .catch { error ->
                    logStreamError(error, uid, "announcements")
                    throw error
                }
        )
    }

    fun observeAllUsers(): Flow<List<UserProfile>> = flow {
        val uid = requireAdminUid()
        emitAll(
            db.collection("users").snapshots()
                .map { snap ->
                    snap.toObjects(UserProfile::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
                }
                .catch { error ->
                    logStreamError(error, uid, "users")
                    throw error
                }
        )
    }

    // --- SUBJECTS ---

    suspend fun saveSubject(
        existingId: String?,
        title: String,
        description: String,
        imageUrl: String?,
        iconKey: String,
        sortOrder: Long,
        published: Boolean
    ): Result<Unit> {
        val cleanTitle = title.trim()
        require(cleanTitle.isNotEmpty()) { "اسم المادة مطلوب" }
        val docRef = if (existingId.isNullOrBlank()) {
            db.collection("subjects").document()
        } else {
            db.collection("subjects").document(existingId)
        }
        return try {
            val uid = requireAdminUid()
            if (existingId.isNullOrBlank()) {
                val payload = mapOf(
                    "title" to cleanTitle.take(80),
                    "description" to description.trim().take(400),
                    "imageUrl" to imageUrl?.trim()?.takeIf { it.isNotEmpty() }?.take(500),
                    "iconKey" to iconKey.ifBlank { "general" }.take(40),
                    "sortOrder" to sortOrder.coerceIn(0L, 1000L),
                    "published" to published,
                    "createdBy" to uid,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                ).filterValues { it != null } as Map<String, Any>
                docRef.set(payload).await()
            } else {
                val updateMap = mapOf(
                    "title" to cleanTitle.take(80),
                    "description" to description.trim().take(400),
                    "imageUrl" to (imageUrl?.trim()?.take(500) ?: ""),
                    "iconKey" to iconKey.ifBlank { "general" }.take(40),
                    "sortOrder" to sortOrder.coerceIn(0L, 1000L),
                    "published" to published,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.update(updateMap).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docRef.path)
            Result.failure(e)
        }
    }

    suspend fun deleteSubject(subjectId: String): Result<Unit> {
        val path = "subjects/$subjectId"
        return try {
            requireAdminUid()
            db.collection("subjects").document(subjectId).delete().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, path)
            Result.failure(e)
        }
    }

    suspend fun seedCoreSubjects(): Result<Int> {
        return try {
            val uid = requireAdminUid()
            val defaults = listOf(
                Triple("subj_math", "الرياضيات", "math") to "الجبر والهندسة والمعادلات والتمارين المحلولة",
                Triple("subj_analysis", "التحليل", "analysis") to "النهايات والاشتقاق والتكامل والمتتاليات",
                Triple("subj_arabic", "اللغة العربية", "arabic") to "النحو والصرف والأدب والبلاغة والتعبير",
                Triple("subj_religion", "التربية الدينية", "religion") to "القرآن الكريم والحديث الشريف والفقه والأخلاق",
                Triple("subj_english", "اللغة الإنجليزية", "english") to "القواعد والمفردات والمحادثة والنصوص",
                Triple("subj_physics", "الفيزياء", "physics") to "الميكانيك والكهرباء والمغناطيسية والأمواج",
                Triple("subj_science", "العلوم", "science") to "الأحياء وعلم الأرض والظواهر الطبيعية",
                Triple("subj_chemistry", "الكيمياء", "chemistry") to "التفاعلات الكيميائية والعضوية والمحاليل"
            )
            var addedCount = 0
            defaults.forEachIndexed { index, (meta, desc) ->
                val (docId, title, iconKey) = meta
                val docRef = db.collection("subjects").document(docId)
                val snap = docRef.get().await()
                if (!snap.exists()) {
                    docRef.set(
                        mapOf(
                            "title" to title,
                            "description" to desc,
                            "iconKey" to iconKey,
                            "sortOrder" to (index + 1).toLong(),
                            "published" to true,
                            "createdBy" to uid,
                            "createdAt" to FieldValue.serverTimestamp(),
                            "updatedAt" to FieldValue.serverTimestamp()
                        )
                    ).await()
                    addedCount++
                }
            }
            Result.success(addedCount)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, "subjects")
            Result.failure(e)
        }
    }

    // --- LESSONS ---

    suspend fun saveLesson(
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
    ): Result<Unit> {
        val docRef = if (existingId.isNullOrBlank()) {
            db.collection("lessons").document()
        } else {
            db.collection("lessons").document(existingId)
        }
        return try {
            val uid = requireAdminUid()
            val cleanTitle = title.trim()
            val cleanVideoUrl = videoUrl.trim()
            require(cleanTitle.isNotEmpty() && cleanVideoUrl.isNotEmpty()) {
                "عنوان الدرس ورابط الفيديو مطلوبان"
            }
            if (existingId.isNullOrBlank()) {
                val payload = mapOf(
                    "subjectId" to subject.id.take(128),
                    "subjectName" to subject.title.take(80),
                    "unitTitle" to unitTitle.trim().ifBlank { "الوحدة الأولى" }.take(100),
                    "unitOrder" to unitOrder.coerceIn(0L, 500L),
                    "lessonOrder" to lessonOrder.coerceIn(0L, 500L),
                    "title" to cleanTitle.take(140),
                    "description" to description.trim().take(1000),
                    "teacherName" to teacherName?.trim()?.takeIf { it.isNotEmpty() }?.take(100),
                    "durationLabel" to durationLabel?.trim()?.takeIf { it.isNotEmpty() }?.take(30),
                    "thumbnailUrl" to thumbnailUrl?.trim()?.takeIf { it.isNotEmpty() }?.take(500),
                    "videoUrl" to cleanVideoUrl.take(1000),
                    "videoSourceType" to videoSourceType.name,
                    "published" to published,
                    "createdBy" to uid,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                ).filterValues { it != null } as Map<String, Any>
                docRef.set(payload).await()
            } else {
                val updateMap = mapOf(
                    "subjectId" to subject.id.take(128),
                    "subjectName" to subject.title.take(80),
                    "unitTitle" to unitTitle.trim().ifBlank { "الوحدة الأولى" }.take(100),
                    "unitOrder" to unitOrder.coerceIn(0L, 500L),
                    "lessonOrder" to lessonOrder.coerceIn(0L, 500L),
                    "title" to cleanTitle.take(140),
                    "description" to description.trim().take(1000),
                    "teacherName" to (teacherName?.trim()?.take(100) ?: ""),
                    "durationLabel" to (durationLabel?.trim()?.take(30) ?: ""),
                    "thumbnailUrl" to (thumbnailUrl?.trim()?.take(500) ?: ""),
                    "videoUrl" to cleanVideoUrl.take(1000),
                    "videoSourceType" to videoSourceType.name,
                    "published" to published,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.update(updateMap).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docRef.path)
            Result.failure(e)
        }
    }

    suspend fun toggleLessonPublished(lesson: Lesson): Result<Unit> {
        val path = "lessons/${lesson.id}"
        return try {
            requireAdminUid()
            db.collection("lessons").document(lesson.id)
                .update(
                    mapOf(
                        "published" to !lesson.published,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, path)
            Result.failure(e)
        }
    }

    suspend fun deleteLesson(lessonId: String): Result<Unit> {
        val path = "lessons/$lessonId"
        return try {
            requireAdminUid()
            db.collection("lessons").document(lessonId).delete().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, path)
            Result.failure(e)
        }
    }

    // --- MATERIALS (PDF / BOOKS / NOTES) ---

    suspend fun saveMaterial(
        existingId: String?,
        subject: Subject,
        lesson: Lesson?,
        materialType: MaterialType,
        title: String,
        description: String,
        coverUrl: String?,
        fileUrl: String,
        published: Boolean
    ): Result<Unit> {
        val docRef = if (existingId.isNullOrBlank()) {
            db.collection("materials").document()
        } else {
            db.collection("materials").document(existingId)
        }
        return try {
            val uid = requireAdminUid()
            val cleanTitle = title.trim()
            val cleanFileUrl = fileUrl.trim()
            require(cleanTitle.isNotEmpty() && cleanFileUrl.isNotEmpty()) {
                "اسم الملف ورابط PDF مطلوبان"
            }
            if (existingId.isNullOrBlank()) {
                val payload = mapOf(
                    "subjectId" to subject.id.take(128),
                    "subjectName" to subject.title.take(80),
                    "lessonId" to lesson?.id?.takeIf { it.isNotBlank() }?.take(128),
                    "lessonTitle" to lesson?.title?.takeIf { it.isNotBlank() }?.take(140),
                    "materialType" to materialType.name,
                    "title" to cleanTitle.take(140),
                    "description" to description.trim().take(1000),
                    "coverUrl" to coverUrl?.trim()?.takeIf { it.isNotEmpty() }?.take(500),
                    "fileUrl" to cleanFileUrl.take(1000),
                    "published" to published,
                    "createdBy" to uid,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                ).filterValues { it != null } as Map<String, Any>
                docRef.set(payload).await()
            } else {
                val updateMap = mapOf(
                    "subjectId" to subject.id.take(128),
                    "subjectName" to subject.title.take(80),
                    "lessonId" to (lesson?.id?.take(128) ?: ""),
                    "lessonTitle" to (lesson?.title?.take(140) ?: ""),
                    "materialType" to materialType.name,
                    "title" to cleanTitle.take(140),
                    "description" to description.trim().take(1000),
                    "coverUrl" to (coverUrl?.trim()?.take(500) ?: ""),
                    "fileUrl" to cleanFileUrl.take(1000),
                    "published" to published,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.update(updateMap).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docRef.path)
            Result.failure(e)
        }
    }

    suspend fun deleteMaterial(materialId: String): Result<Unit> {
        val path = "materials/$materialId"
        return try {
            requireAdminUid()
            db.collection("materials").document(materialId).delete().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, path)
            Result.failure(e)
        }
    }

    // --- ANNOUNCEMENTS / IN-APP NOTIFICATIONS ---

    suspend fun saveAnnouncement(
        existingId: String?,
        title: String,
        body: String,
        category: AnnouncementCategory,
        subjectId: String?,
        pinned: Boolean,
        published: Boolean
    ): Result<Unit> {
        val docRef = if (existingId.isNullOrBlank()) {
            db.collection("announcements").document()
        } else {
            db.collection("announcements").document(existingId)
        }
        return try {
            val uid = requireAdminUid()
            val cleanTitle = title.trim()
            val cleanBody = body.trim()
            require(cleanTitle.isNotEmpty() && cleanBody.isNotEmpty()) {
                "عنوان الإعلان ونصّه مطلوبان"
            }
            if (existingId.isNullOrBlank()) {
                val payload = mapOf(
                    "title" to cleanTitle.take(140),
                    "body" to cleanBody.take(1000),
                    "category" to category.name,
                    "subjectId" to subjectId?.takeIf { it.isNotBlank() }?.take(128),
                    "pinned" to pinned,
                    "published" to published,
                    "createdBy" to uid,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                ).filterValues { it != null } as Map<String, Any>
                docRef.set(payload).await()
            } else {
                val updateMap = mapOf(
                    "title" to cleanTitle.take(140),
                    "body" to cleanBody.take(1000),
                    "category" to category.name,
                    "subjectId" to (subjectId?.take(128) ?: ""),
                    "pinned" to pinned,
                    "published" to published,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                docRef.update(updateMap).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docRef.path)
            Result.failure(e)
        }
    }

    suspend fun deleteAnnouncement(announcementId: String): Result<Unit> {
        val path = "announcements/$announcementId"
        return try {
            requireAdminUid()
            db.collection("announcements").document(announcementId).delete().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, path)
            Result.failure(e)
        }
    }

    // --- STUDENT ACCOUNT MANAGEMENT ---

    suspend fun setUserAccountStatus(targetUserId: String, status: AccountStatus): Result<Unit> {
        val path = "users/$targetUserId"
        return try {
            requireAdminUid()
            db.collection("users").document(targetUserId)
                .update(
                    mapOf(
                        "accountStatus" to status.name,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, path)
            Result.failure(e)
        }
    }

    suspend fun setUserAdminRole(targetUser: UserProfile, makeAdmin: Boolean): Result<Unit> {
        val uidPath = "admins/${targetUser.userId}"
        return try {
            val adminUid = requireAdminUid()
            val adminRef = db.collection("admins").document(targetUser.userId)
            val userRef = db.collection("users").document(targetUser.userId)
            if (makeAdmin) {
                adminRef.set(
                    mapOf(
                        "uid" to targetUser.userId,
                        "email" to targetUser.email,
                        "grantedBy" to adminUid,
                        "createdAt" to FieldValue.serverTimestamp()
                    )
                ).await()
                userRef.update(
                    mapOf(
                        "role" to UserRole.ADMIN.name,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            } else {
                adminRef.delete().await()
                userRef.update(
                    mapOf(
                        "role" to UserRole.STUDENT.name,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, uidPath)
            Result.failure(e)
        }
    }

    private fun logStreamError(error: Throwable, uid: String, path: String) {
        val firestoreError = generateSequence(error) { it.cause }
            .filterIsInstance<FirebaseFirestoreException>()
            .firstOrNull()
        if (firestoreError == null && error is CancellationException) throw error
        val exceptionToLog = firestoreError ?: (error as? Exception)
        if (exceptionToLog != null && auth.currentUser?.uid == uid) {
            handleFirestoreError(exceptionToLog, OperationType.LIST, path)
        }
    }
}
