package com.example.data.firebase

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.util.Log
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

private const val AUTH_TAG = "AbkAuth"

fun ensureFirebaseInitialized(context: Context): Boolean {
    val appContext = context.applicationContext ?: context
    if (FirebaseApp.getApps(appContext).isNotEmpty()) return true
    return runCatching { FirebaseApp.initializeApp(appContext) != null }.getOrDefault(false)
}

tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

fun FirebaseAuth.authStateFlow(): Flow<FirebaseUser?> = callbackFlow {
    val listener = FirebaseAuth.AuthStateListener { auth ->
        trySend(auth.currentUser)
    }
    addAuthStateListener(listener)
    awaitClose { removeAuthStateListener(listener) }
}

fun attemptAutoSignIn(
    context: Context,
    credentialManager: CredentialManager,
    onAuthSuccess: (FirebaseUser) -> Unit,
    onUnauthenticated: () -> Unit,
    scope: CoroutineScope
) {
    if (!ensureFirebaseInitialized(context)) {
        Log.w(AUTH_TAG, "attemptAutoSignIn skipped: FirebaseApp not initialized")
        onUnauthenticated()
        return
    }
    val currentUser = runCatching { Firebase.auth.currentUser }.getOrNull()
    if (currentUser != null) {
        onAuthSuccess(currentUser)
        return
    }
    val clientId = resolveWebClientId(context)
    if (clientId == null) {
        Log.w(AUTH_TAG, "attemptAutoSignIn skipped: default_web_client_id missing or invalid")
        onUnauthenticated()
        return
    }
    val request = try {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(true)
            .setServerClientId(clientId)
            .setAutoSelectEnabled(true)
            .build()
        GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()
    } catch (e: Exception) {
        Log.w(AUTH_TAG, "attemptAutoSignIn request build failed: ${e.message}", e)
        onUnauthenticated()
        return
    }
    scope.launch {
        try {
            val activityContext = context.findActivity() ?: context
            val response = withTimeoutOrNull(4500L) {
                credentialManager.getCredential(activityContext, request)
            }
            val cred = response?.credential
            if (cred is CustomCredential && cred.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val token = GoogleIdTokenCredential.createFrom(cred.data).idToken
                if (token.isBlank()) {
                    Log.w(AUTH_TAG, "attemptAutoSignIn failed: empty Google ID token")
                    onUnauthenticated()
                    return@launch
                }
                val authResult = Firebase.auth.signInWithCredential(
                    GoogleAuthProvider.getCredential(token, null)
                ).await()
                val signedInUser = authResult.user ?: Firebase.auth.currentUser
                if (signedInUser != null) {
                    Log.i(AUTH_TAG, "attemptAutoSignIn succeeded for uid=${signedInUser.uid}")
                    onAuthSuccess(signedInUser)
                } else {
                    Log.w(AUTH_TAG, "attemptAutoSignIn failed: FirebaseAuth returned null user")
                    onUnauthenticated()
                }
            } else {
                onUnauthenticated()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.d(AUTH_TAG, "attemptAutoSignIn ended without active session (${e::class.java.simpleName}): ${e.message}")
            onUnauthenticated()
        }
    }
}

fun onGoogleSignInClicked(
    context: Context,
    credentialManager: CredentialManager,
    onAuthSuccess: (FirebaseUser) -> Unit,
    onAuthError: (String) -> Unit,
    scope: CoroutineScope,
    onAuthCancelled: (String?) -> Unit = {}
) {
    if (!ensureFirebaseInitialized(context)) {
        onAuthError("تعذر تهيئة خدمة Firebase في هذه النسخة. تأكد من تضمين app/google-services.json عند البناء.")
        return
    }
    val clientId = resolveWebClientId(context)
    if (clientId == null) {
        onAuthError(
            "تعذر العثور على Web Client ID صالح (default_web_client_id) لحزمة ${context.packageName}. " +
                "تحقق من تضمين app/google-services.json وتفعيل Google Sign-In في Firebase Authentication."
        )
        return
    }
    val activityContext = context.findActivity()
    if (activityContext == null) {
        onAuthError("تعذر بدء تسجيل الدخول: لم يتم العثور على Activity صالحة.")
        return
    }
    val request = try {
        val signInOption = GetSignInWithGoogleOption.Builder(serverClientId = clientId).build()
        GetCredentialRequest.Builder()
            .addCredentialOption(signInOption)
            .build()
    } catch (e: Exception) {
        Log.e(AUTH_TAG, "Failed to build GetCredentialRequest", e)
        onAuthError("تعذر تجهيز طلب Google Sign-In [${e::class.java.simpleName}]: ${e.localizedMessage ?: "خطأ غير معروف"}")
        return
    }

    scope.launch {
        try {
            val response = credentialManager.getCredential(activityContext, request)
            val cred = response.credential
            if (cred !is CustomCredential || cred.type != TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val msg = "نوع بيانات الاعتماد المستلمة غير متوقع: ${cred::class.java.simpleName} (${cred.type})"
                Log.e(AUTH_TAG, msg)
                onAuthError(msg)
                return@launch
            }

            val googleCredential = GoogleIdTokenCredential.createFrom(cred.data)
            val idToken = googleCredential.idToken
            if (idToken.isBlank()) {
                val msg = "تم اختيار حساب Google لكن رمز ID Token عاد فارغاً. تحقق من Web Client ID في google-services.json."
                Log.e(AUTH_TAG, msg)
                onAuthError(msg)
                return@launch
            }

            val authResult = Firebase.auth.signInWithCredential(
                GoogleAuthProvider.getCredential(idToken, null)
            ).await()

            val signedInUser = authResult.user ?: Firebase.auth.currentUser
            if (signedInUser != null) {
                Log.i(AUTH_TAG, "Firebase Google Sign-In succeeded: uid=${signedInUser.uid}, email=${signedInUser.email}")
                onAuthSuccess(signedInUser)
            } else {
                val msg = "نجحت مصادقة Google لكن FirebaseAuth لم يُرجع جلسة مستخدم صالحة (currentUser == null)."
                Log.e(AUTH_TAG, msg)
                onAuthError(msg)
            }
        } catch (e: GetCredentialCancellationException) {
            Log.w(AUTH_TAG, "GetCredentialCancellationException: type=${e.type}, message=${e.message}", e)
            val diagnostic = classifyCancellationOrConfigError(e, context.packageName)
            if (diagnostic != null) {
                onAuthError(diagnostic)
            } else {
                val rawDetails = listOfNotNull(e.errorMessage?.toString(), e.message)
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .distinct()
                    .joinToString(" | ")
                    .takeIf { it.isNotBlank() }
                onAuthCancelled(rawDetails)
            }
        } catch (e: NoCredentialException) {
            Log.e(AUTH_TAG, "NoCredentialException: type=${e.type}, message=${e.message}", e)
            onAuthError(
                "لم يتم العثور على بيانات اعتماد Google صالحة [NoCredentialException]. " +
                    "تأكد من إضافة بصمة SHA-1 وSHA-256 لشهادة الـ APK وحزمة ${context.packageName} في Firebase Console، " +
                    "ووجود حساب Google مفعّل على الجهاز.\nالتفاصيل: ${e.errorMessage ?: e.localizedMessage ?: "لا توجد تفاصيل"}"
            )
        } catch (e: GetCredentialProviderConfigurationException) {
            Log.e(AUTH_TAG, "Provider configuration error: ${e.message}", e)
            onAuthError(
                "إعدادات مزود Credential Manager ناقصة على الجهاز [GetCredentialProviderConfigurationException]. " +
                    "حدّث خدمات Google Play أو تحقق من مكتبات التوثيق.\nالتفاصيل: ${e.errorMessage ?: e.localizedMessage ?: ""}"
            )
        } catch (e: GetCredentialUnsupportedException) {
            Log.e(AUTH_TAG, "Credential Manager unsupported: ${e.message}", e)
            onAuthError(
                "الجهاز أو خدمات Google Play لا تدعم واجهة تسجيل الدخول الحالية [GetCredentialUnsupportedException]: " +
                    "${e.errorMessage ?: e.localizedMessage ?: ""}"
            )
        } catch (e: GetCredentialInterruptedException) {
            Log.w(AUTH_TAG, "Credential Manager interrupted: ${e.message}", e)
            onAuthError("تمت مقاطعة عملية تسجيل الدخول [GetCredentialInterruptedException]. يرجى المحاولة مرة أخرى.")
        } catch (e: GoogleIdTokenParsingException) {
            Log.e(AUTH_TAG, "Invalid Google ID token payload", e)
            onAuthError("تعذر قراءة رمز Google ID Token [GoogleIdTokenParsingException]: ${e.localizedMessage ?: ""}")
        } catch (e: FirebaseAuthException) {
            Log.e(AUTH_TAG, "FirebaseAuthException: code=${e.errorCode}, message=${e.message}", e)
            onAuthError(formatFirebaseAuthError(e))
        } catch (e: FirebaseNetworkException) {
            Log.e(AUTH_TAG, "FirebaseNetworkException during signInWithCredential", e)
            onAuthError("تعذر الاتصال بخوادم Firebase لإتمام تسجيل الدخول [FirebaseNetworkException]. تحقق من اتصال الإنترنت.")
        } catch (e: GetCredentialException) {
            Log.e(AUTH_TAG, "GetCredentialException: type=${e.type}, message=${e.message}", e)
            onAuthError(
                "فشل استلام بيانات الاعتماد من Google [${e::class.java.simpleName} / ${e.type}]: " +
                    "${e.errorMessage ?: e.localizedMessage ?: "خطأ غير معروف"}"
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.e(AUTH_TAG, "Unexpected Google Sign-In failure", e)
            onAuthError("فشل تسجيل الدخول بحساب Google [${e::class.java.simpleName}]: ${e.localizedMessage ?: "خطأ غير معروف"}")
        }
    }
}

internal fun classifyCancellationOrConfigError(
    e: GetCredentialCancellationException,
    packageName: String
): String? {
    val raw = listOfNotNull(e.errorMessage?.toString(), e.message).joinToString(" | ")
    val lower = raw.lowercase()
    val looksLikeDeveloperOrReauthError = listOf(
        "16",
        "28444",
        "10:",
        "reauth",
        "developer",
        "caller",
        "signature",
        "sha",
        "blocked",
        "not set up",
        "configuration",
        "client",
        "failed",
        "error",
        "play services"
    ).any { it in lower }

    return if (looksLikeDeveloperOrReauthError) {
        "تعذر إتمام تسجيل الدخول بعد اختيار الحساب [GetCredentialCancellationException]. " +
            "غالباً السبب عدم تطابق بصمة SHA-1 لشهادة التوقيع مع المشروع في Firebase لحزمة $packageName " +
            "أو إلغاء إعادة المصادقة في خدمات Google Play.\nالتفاصيل: $raw"
    } else {
        null
    }
}

internal fun formatFirebaseAuthError(e: FirebaseAuthException): String {
    val hint = when (e.errorCode) {
        "ERROR_OPERATION_NOT_ALLOWED" ->
            "مزود Google Sign-In غير مفعّل في Firebase Console ← Authentication ← Sign-in method."
        "ERROR_INVALID_CREDENTIAL", "ERROR_INVALID_IDP_RESPONSE" ->
            "رمز Google غير مقبول في Firebase (تحقق من تطابق Web Client ID في google-services.json وFirebase Console)."
        "ERROR_USER_DISABLED" ->
            "تم تعطيل هذا الحساب في Firebase Authentication."
        "ERROR_ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL" ->
            "يوجد حساب مسجل بنفس البريد الإلكتروني بطريقة دخول مختلفة."
        else ->
            "خطأ في مصادقة Firebase بعد اختيار حساب Google."
    }
    return "$hint\n[FirebaseAuthException / ${e.errorCode}]: ${e.localizedMessage ?: e.message ?: ""}"
}

fun signOutUser(
    credentialManager: CredentialManager?,
    scope: CoroutineScope,
    onSignOutComplete: () -> Unit = {}
) {
    scope.launch {
        withContext(NonCancellable) {
            try {
                credentialManager?.clearCredentialState(ClearCredentialStateRequest())
            } catch (e: Exception) {
                Log.w(AUTH_TAG, "Failed to clear credential state: ${e.message}")
            } finally {
                runCatching { Firebase.auth.signOut() }
                onSignOutComplete()
            }
        }
    }
}

@SuppressLint("DiscouragedApi")
internal fun resolveWebClientId(context: Context): String? {
    val resId = context.resources.getIdentifier(
        "default_web_client_id",
        "string",
        context.packageName
    )
    if (resId == 0) return null
    return try {
        val value = context.getString(resId).trim()
        value.takeIf {
            it.isNotBlank() &&
                !it.contains("placeholder", ignoreCase = true) &&
                it.endsWith(".apps.googleusercontent.com", ignoreCase = true)
        }
    } catch (_: Exception) {
        null
    }
}
