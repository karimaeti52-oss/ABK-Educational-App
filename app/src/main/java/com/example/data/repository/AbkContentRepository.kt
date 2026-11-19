package com.example.data.repository

import com.example.data.firebase.OperationType
import com.example.data.firebase.handleFirestoreError
import com.example.data.model.Announcement
import com.example.data.model.CatalogNode
import com.example.data.model.ContentBlock
import com.example.data.model.CustomSectionType
import com.example.data.model.Lesson
import com.example.data.model.LessonExplanation
import com.example.data.model.PlatformConfig
import com.example.data.model.PublishStatus
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.Teacher
import com.example.data.model.UnitItem
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map

class AbkContentRepository(
    private val db: FirebaseFirestore
) {
    private val auth = Firebase.auth

    private fun requireUid(): String =
        auth.currentUser?.uid ?: throw IllegalStateException("User must be signed in.")

    fun observePlatformConfig(): Flow<PlatformConfig> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("platformConfig").document("main")
                .snapshots()
                .map { snapshot ->
                    if (snapshot.exists()) {
                        snapshot.toObject(PlatformConfig::class.java) ?: PlatformConfig()
                    } else {
                        PlatformConfig()
                    }
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "platformConfig/main")
                    emit(PlatformConfig())
                }
        )
    }

    fun observePublishedCatalogNodes(): Flow<List<CatalogNode>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("catalogNodes")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        CatalogNode::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedWith(compareBy<CatalogNode> { it.sortOrder }.thenBy { it.title })
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "catalogNodes")
                    emit(emptyList())
                }
        )
    }

    fun observePublishedSubjects(): Flow<List<Subject>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("subjects")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        Subject::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedWith(compareBy<Subject> { it.sortOrder }.thenBy { it.title })
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "subjects")
                    throw error
                }
        )
    }

    fun observePublishedUnits(): Flow<List<UnitItem>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("units")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        UnitItem::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedWith(compareBy<UnitItem> { it.sortOrder }.thenBy { it.title })
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "units")
                    emit(emptyList())
                }
        )
    }

    fun observePublishedTeachers(): Flow<List<Teacher>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("teachers")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        Teacher::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedWith(compareBy<Teacher> { it.sortOrder }.thenBy { it.name })
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "teachers")
                    emit(emptyList())
                }
        )
    }

    fun observePublishedLessons(): Flow<List<Lesson>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("lessons")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        Lesson::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedWith(
                            compareBy<Lesson> { it.unitOrder }
                                .thenBy { it.lessonOrder }
                                .thenByDescending { it.createdAt ?: Timestamp(0, 0) }
                        )
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "lessons")
                    throw error
                }
        )
    }

    fun observePublishedLessonExplanations(): Flow<List<LessonExplanation>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("lessonExplanations")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        LessonExplanation::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedWith(compareBy<LessonExplanation> { it.sortOrder }.thenBy { it.teacherName })
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "lessonExplanations")
                    emit(emptyList())
                }
        )
    }

    fun observePublishedContentBlocks(): Flow<List<ContentBlock>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("contentBlocks")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        ContentBlock::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedBy { it.sortOrder }
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "contentBlocks")
                    emit(emptyList())
                }
        )
    }

    fun observePublishedCustomSectionTypes(): Flow<List<CustomSectionType>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("customSectionTypes")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        CustomSectionType::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "customSectionTypes")
                    emit(emptyList())
                }
        )
    }

    fun observePublishedMaterials(): Flow<List<StudyMaterial>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("materials")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        StudyMaterial::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "materials")
                    throw error
                }
        )
    }

    fun observePublishedAnnouncements(): Flow<List<Announcement>> = flow {
        val uid = requireUid()
        emitAll(
            db.collection("announcements")
                .whereEqualTo("published", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        Announcement::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    )
                        .filter { it.deletedAt == null && it.status != PublishStatus.ARCHIVED.name }
                        .sortedWith(
                            compareByDescending<Announcement> { it.pinned }
                                .thenByDescending { it.createdAt ?: Timestamp(0, 0) }
                        )
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "announcements")
                    throw error
                }
        )
    }

    private fun logStreamErrorIfAuthenticated(error: Throwable, uid: String, path: String) {
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
