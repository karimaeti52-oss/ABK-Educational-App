package com.example.data.repository

import com.example.data.firebase.OperationType
import com.example.data.firebase.handleFirestoreError
import com.example.data.model.AccountStatus
import com.example.data.model.FavoriteItem
import com.example.data.model.FavoriteType
import com.example.data.model.Lesson
import com.example.data.model.LessonProgress
import com.example.data.model.UserProfile
import com.example.data.model.UserRole
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseUser
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

class StudentRepository(
    private val db: FirebaseFirestore
) {
    private val auth = Firebase.auth

    companion object {
        private val STAFF_CLAIMS_ROLES = setOf("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER", "TEACHER", "VIEWER")
        const val FAVORITES_LIMIT = 200L
        const val PROGRESS_LIMIT = 200L
        const val READ_ANNOUNCEMENTS_LIMIT = 100L
    }

    private fun requireUserId(): String =
        auth.currentUser?.uid ?: throw IllegalStateException("User must be signed in.")

    suspend fun ensureUserProfile(user: FirebaseUser): Result<Unit> {
        val docPath = "users/${user.uid}"
        return try {
            val uid = requireUserId()
            check(uid == user.uid) { "Authenticated user mismatch." }
            val userRef = db.collection("users").document(uid)
            val existingSnap = userRef.get().await()
            val safeName = (user.displayName?.takeIf { it.isNotBlank() } ?: "طالب مداد").take(100)
            val safeEmail = (user.email ?: "").take(160)
            val safePhoto = user.photoUrl?.toString()?.take(500)

            if (!existingSnap.exists()) {
                val payload = mutableMapOf<String, Any>(
                    "userId" to uid,
                    "displayName" to safeName,
                    "email" to safeEmail,
                    "role" to UserRole.STUDENT.name,
                    "accountStatus" to AccountStatus.ACTIVE.name,
                    "lastActiveAt" to FieldValue.serverTimestamp(),
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                if (!safePhoto.isNullOrBlank()) {
                    payload["photoUrl"] = safePhoto
                }
                userRef.set(payload).await()
            } else {
                val status = existingSnap.getString("accountStatus")
                if (status != AccountStatus.SUSPENDED.name && status != AccountStatus.BANNED.name) {
                    val updateMap = mutableMapOf<String, Any>(
                        "displayName" to safeName,
                        "email" to safeEmail,
                        "lastActiveAt" to FieldValue.serverTimestamp(),
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                    if (!safePhoto.isNullOrBlank()) {
                        updateMap["photoUrl"] = safePhoto
                    }
                    userRef.update(updateMap).await()
                }
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docPath)
            Result.failure(e)
        }
    }

    fun observeUserProfile(userId: String): Flow<UserProfile?> = flow {
        val uid = requireUserId()
        check(uid == userId) { "Unauthorized profile access." }
        val path = "users/$userId"
        emitAll(
            db.collection("users").document(userId)
                .snapshots()
                .map { snap ->
                    if (snap.exists()) {
                        snap.toObject(
                            UserProfile::class.java,
                            DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                        )
                    } else null
                }
                .catch { error ->
                    logStreamError(error, uid, OperationType.GET, path)
                    throw error
                }
        )
    }

    fun observeIsAdmin(
        userId: String,
        @Suppress("UNUSED_PARAMETER") email: String?,
        @Suppress("UNUSED_PARAMETER") isEmailVerified: Boolean
    ): Flow<Boolean> = flow {
        val uid = requireUserId()
        check(uid == userId)
        val claims = runCatching { auth.currentUser?.getIdToken(false)?.await()?.claims }.getOrNull().orEmpty()
        val claimRole = claims["abkRole"] as? String
        val hasStaffClaim = claimRole != null && claimRole in STAFF_CLAIMS_ROLES
        val path = "admins/$userId"
        val currentAdminSnap = runCatching { db.collection("admins").document(userId).get().await() }.getOrNull()
        if (currentAdminSnap?.exists() == true && currentAdminSnap.getBoolean("active") == false) {
            emit(false)
            return@flow
        }
        if (hasStaffClaim) {
            emit(true)
            return@flow
        }
        emitAll(
            db.collection("admins").document(userId)
                .snapshots()
                .map { snap ->
                    snap.exists() &&
                        snap.getBoolean("active") == true &&
                        (snap.getString("role") in STAFF_CLAIMS_ROLES)
                }
                .catch { error ->
                    logStreamError(error, uid, OperationType.GET, path)
                    emit(false)
                }
        )
    }

    fun observeFavorites(userId: String): Flow<List<FavoriteItem>> = flow {
        val uid = requireUserId()
        check(uid == userId)
        val path = "users/$userId/favorites"
        emitAll(
            db.collection("users").document(userId).collection("favorites")
                .limit(FAVORITES_LIMIT)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        FavoriteItem::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    ).sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
                }
                .catch { error ->
                    logStreamError(error, uid, OperationType.LIST, path)
                    throw error
                }
        )
    }

    suspend fun toggleFavorite(
        userId: String,
        itemId: String,
        itemType: FavoriteType,
        title: String,
        subtitle: String,
        subjectName: String,
        imageUrl: String?
    ): Result<Boolean> {
        val docId = "${itemType.name.lowercase()}_$itemId"
        val docPath = "users/$userId/favorites/$docId"
        return try {
            val uid = requireUserId()
            check(uid == userId)
            val docRef = db.collection("users").document(uid)
                .collection("favorites").document(docId)
            val existing = docRef.get().await()
            if (existing.exists()) {
                docRef.delete().await()
                Result.success(false)
            } else {
                val payload = mapOf(
                    "userId" to uid,
                    "itemId" to itemId.take(128),
                    "itemType" to itemType.name,
                    "title" to title.ifBlank { "عنصر" }.take(140),
                    "subtitle" to subtitle.take(140),
                    "subjectName" to subjectName.take(80),
                    "imageUrl" to imageUrl?.takeIf { it.isNotBlank() }?.take(500),
                    "createdAt" to FieldValue.serverTimestamp()
                ).filterValues { it != null } as Map<String, Any>
                docRef.set(payload).await()
                Result.success(true)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docPath)
            Result.failure(e)
        }
    }

    fun observeProgress(userId: String): Flow<List<LessonProgress>> = flow {
        val uid = requireUserId()
        check(uid == userId)
        val path = "users/$userId/progress"
        emitAll(
            db.collection("users").document(userId).collection("progress")
                .limit(PROGRESS_LIMIT)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(
                        LessonProgress::class.java,
                        DocumentSnapshot.ServerTimestampBehavior.ESTIMATE
                    ).sortedByDescending { it.updatedAt ?: it.createdAt ?: Timestamp(0, 0) }
                }
                .catch { error ->
                    logStreamError(error, uid, OperationType.LIST, path)
                    throw error
                }
        )
    }

    suspend fun saveLessonProgress(
        userId: String,
        lesson: Lesson,
        positionMs: Long,
        durationMs: Long,
        completed: Boolean
    ): Result<Unit> {
        val docPath = "users/$userId/progress/${lesson.id}"
        return try {
            val uid = requireUserId()
            check(uid == userId)
            require(lesson.id.isNotBlank()) { "Lesson ID must not be blank." }
            val safePos = positionMs.coerceAtLeast(0L)
            val safeDur = durationMs.coerceAtLeast(0L)
            val docRef = db.collection("users").document(uid)
                .collection("progress").document(lesson.id)
            val existing = docRef.get().await()
            if (existing.exists()) {
                val alreadyCompleted = existing.getBoolean("completed") == true
                val prevPos = existing.getLong("lastPositionMs") ?: 0L
                val prevDur = existing.getLong("durationMs") ?: 0L
                val finalCompleted = completed || alreadyCompleted
                if (alreadyCompleted == finalCompleted &&
                    kotlin.math.abs(safePos - prevPos) < 2000L &&
                    safeDur == prevDur
                ) {
                    return Result.success(Unit)
                }
                val updatePayload = mutableMapOf<String, Any>(
                    "lessonTitle" to lesson.title.ifBlank { "درس" }.take(140),
                    "subjectId" to lesson.subjectId.take(128),
                    "subjectName" to lesson.subjectName.take(80),
                    "lastPositionMs" to safePos,
                    "durationMs" to safeDur,
                    "completed" to finalCompleted,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                lesson.thumbnailUrl?.takeIf { it.isNotBlank() }?.let {
                    updatePayload["thumbnailUrl"] = it.take(500)
                }
                docRef.update(updatePayload).await()
            } else {
                val createPayload = mapOf(
                    "userId" to uid,
                    "lessonId" to lesson.id.take(128),
                    "lessonTitle" to lesson.title.ifBlank { "درس" }.take(140),
                    "subjectId" to lesson.subjectId.take(128),
                    "subjectName" to lesson.subjectName.take(80),
                    "thumbnailUrl" to lesson.thumbnailUrl?.takeIf { it.isNotBlank() }?.take(500),
                    "lastPositionMs" to safePos,
                    "durationMs" to safeDur,
                    "completed" to completed,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                ).filterValues { it != null } as Map<String, Any>
                docRef.set(createPayload).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docPath)
            Result.failure(e)
        }
    }

    fun observeReadAnnouncementIds(userId: String): Flow<Set<String>> = flow {
        val uid = requireUserId()
        check(uid == userId)
        val path = "users/$userId/readAnnouncements"
        emitAll(
            db.collection("users").document(userId).collection("readAnnouncements")
                .limit(READ_ANNOUNCEMENTS_LIMIT)
                .snapshots()
                .map { snapshot ->
                    snapshot.documents.map { it.id }.toSet()
                }
                .catch { error ->
                    logStreamError(error, uid, OperationType.LIST, path)
                    throw error
                }
        )
    }

    suspend fun markAnnouncementRead(userId: String, announcementId: String): Result<Unit> {
        val docPath = "users/$userId/readAnnouncements/$announcementId"
        return try {
            val uid = requireUserId()
            check(uid == userId)
            val docRef = db.collection("users").document(uid)
                .collection("readAnnouncements").document(announcementId)
            val snap = docRef.get().await()
            if (!snap.exists()) {
                docRef.set(
                    mapOf(
                        "userId" to uid,
                        "announcementId" to announcementId,
                        "createdAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, docPath)
            Result.failure(e)
        }
    }

    private fun logStreamError(
        error: Throwable,
        uid: String,
        op: OperationType,
        path: String
    ) {
        val firestoreError = generateSequence(error) { it.cause }
            .filterIsInstance<FirebaseFirestoreException>()
            .firstOrNull()
        if (firestoreError == null && error is CancellationException) throw error
        val exceptionToLog = firestoreError ?: (error as? Exception)
        if (exceptionToLog != null && auth.currentUser?.uid == uid) {
            handleFirestoreError(exceptionToLog, op, path)
        }
    }
}
