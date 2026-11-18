package com.example.data.repository

import com.example.data.firebase.OperationType
import com.example.data.firebase.handleFirestoreError
import com.example.data.model.Announcement
import com.example.data.model.Lesson
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
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
                    ).sortedWith(compareBy<Subject> { it.sortOrder }.thenBy { it.title })
                }
                .catch { error ->
                    logStreamErrorIfAuthenticated(error, uid, "subjects")
                    throw error
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
                    ).sortedWith(
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
                    ).sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
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
                    ).sortedWith(
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
