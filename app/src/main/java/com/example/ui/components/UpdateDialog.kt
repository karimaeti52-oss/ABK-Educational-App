package com.example.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.update.AppReleaseManifest
import com.example.update.AppUpdateState
import java.io.File

@Composable
fun UpdateDialog(
    updateState: AppUpdateState,
    onStartDownload: (AppReleaseManifest) -> Unit,
    onRetryInstall: (AppReleaseManifest, File) -> Unit,
    onOpenPermissionSettings: () -> Unit,
    onDismissOptional: () -> Unit,
    onClearError: () -> Unit
) {
    val shouldShow = updateState is AppUpdateState.Available ||
        updateState is AppUpdateState.Downloading ||
        updateState is AppUpdateState.Verifying ||
        updateState is AppUpdateState.PermissionRequired ||
        updateState is AppUpdateState.ReadyToInstall ||
        updateState is AppUpdateState.Installing ||
        updateState is AppUpdateState.Error

    if (!shouldShow) return

    val isMandatory = when (updateState) {
        is AppUpdateState.Available -> updateState.isMandatory
        is AppUpdateState.Downloading -> updateState.manifest.mandatory
        is AppUpdateState.Verifying -> updateState.manifest.mandatory
        is AppUpdateState.PermissionRequired -> updateState.manifest.mandatory
        is AppUpdateState.ReadyToInstall -> updateState.manifest.mandatory
        is AppUpdateState.Installing -> updateState.manifest.mandatory
        is AppUpdateState.Error -> updateState.manifest?.mandatory == true
        else -> false
    }

    AlertDialog(
        onDismissRequest = {
            if (!isMandatory && updateState !is AppUpdateState.Downloading && updateState !is AppUpdateState.Verifying) {
                if (updateState is AppUpdateState.Error) onClearError() else onDismissOptional()
            }
        },
        icon = {
            Icon(
                imageVector = when (updateState) {
                    is AppUpdateState.Verifying -> Icons.Filled.VerifiedUser
                    is AppUpdateState.PermissionRequired -> Icons.Filled.Security
                    else -> Icons.Filled.SystemUpdate
                },
                contentDescription = null,
                tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(30.dp)
            )
        },
        title = {
            Text(
                text = when (updateState) {
                    is AppUpdateState.Available -> if (updateState.isMandatory) "تحديث إلزامي لمداد التعليمية" else "يتوفر تحديث جديد لمداد التعليمية"
                    is AppUpdateState.Downloading -> "جارٍ تنزيل التحديث…"
                    is AppUpdateState.Verifying -> "جارٍ التحقق من سلامة الحزمة…"
                    is AppUpdateState.PermissionRequired -> "مطلوب إذن التثبيت"
                    is AppUpdateState.ReadyToInstall, is AppUpdateState.Installing -> "جاهز للتثبيت"
                    is AppUpdateState.Error -> "تعذر إتمام التحديث"
                    else -> ""
                },
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("app_update_dialog"),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                when (updateState) {
                    is AppUpdateState.Available -> {
                        ReleaseMetadataCard(updateState.manifest)
                        Text(
                            text = "ملاحظة: التحديث يتم فوق النسخة الحالية مباشرة مع الحفاظ الكامل على تسجيل دخولك وبياناتك.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                    is AppUpdateState.Downloading -> {
                        Text(
                            text = "الإصدار ${updateState.manifest.versionName} — ${updateState.progressPercent}%",
                            style = MaterialTheme.typography.titleSmall
                        )
                        LinearProgressIndicator(
                            progress = { updateState.progressPercent / 100f },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .testTag("update_download_progress")
                        )
                        val downloadedMb = updateState.bytesDownloaded / (1024f * 1024f)
                        val totalMb = updateState.totalBytes / (1024f * 1024f)
                        if (updateState.totalBytes > 0L) {
                            Text(
                                text = String.format("%.1f / %.1f ميجابايت", downloadedMb, totalMb),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    is AppUpdateState.Verifying -> {
                        Text(
                            text = "نتحقق الآن من البصمة الرقمية (SHA-256) لحزمة التحديث قبل فتح المثبّت…",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                    is AppUpdateState.PermissionRequired -> {
                        Text(
                            text = "اسمح لتطبيق مداد التعليمية بتثبيت التحديثات من إعدادات الجهاز، ثم ارجع واضغط تثبيت الآن.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    is AppUpdateState.ReadyToInstall, is AppUpdateState.Installing -> {
                        Text(
                            text = "تم التحقق من سلامة التحديث بنجاح. أكّد التثبيت من نافذة النظام مع بقاء جميع بياناتك محفوظة.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    is AppUpdateState.Error -> {
                        Text(
                            text = updateState.message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    else -> Unit
                }
            }
        },
        confirmButton = {
            when (updateState) {
                is AppUpdateState.Available -> {
                    Button(
                        onClick = { onStartDownload(updateState.manifest) },
                        modifier = Modifier.testTag("update_confirm_download_btn")
                    ) {
                        Text("تحديث الآن")
                    }
                }
                is AppUpdateState.PermissionRequired -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = onOpenPermissionSettings) {
                            Text("فتح الإعدادات")
                        }
                        Button(onClick = { onRetryInstall(updateState.manifest, updateState.apkFile) }) {
                            Text("تثبيت الآن")
                        }
                    }
                }
                is AppUpdateState.ReadyToInstall -> {
                    Button(onClick = { onRetryInstall(updateState.manifest, updateState.apkFile) }) {
                        Text("إعادة فتح المثبّت")
                    }
                }
                is AppUpdateState.Error -> {
                    val m = updateState.manifest
                    if (m != null) {
                        Button(onClick = { onStartDownload(m) }) {
                            Text("إعادة المحاولة")
                        }
                    } else {
                        Button(onClick = onClearError) {
                            Text("حسناً")
                        }
                    }
                }
                else -> Unit
            }
        },
        dismissButton = {
            if (!isMandatory && updateState is AppUpdateState.Available) {
                TextButton(
                    onClick = onDismissOptional,
                    modifier = Modifier.testTag("update_dismiss_btn")
                ) {
                    Text("لاحقاً")
                }
            } else if (!isMandatory && updateState is AppUpdateState.Error && updateState.manifest != null) {
                TextButton(onClick = onClearError) {
                    Text("إغلاق")
                }
            }
        }
    )
}

@Composable
private fun ReleaseMetadataCard(manifest: AppReleaseManifest) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "الإصدار الجديد: ${manifest.versionName.ifBlank { manifest.versionCode.toString() }}",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.primary
                )
                if (manifest.fileSizeBytes > 0L) {
                    val sizeMb = manifest.fileSizeBytes / (1024f * 1024f)
                    Text(
                        text = String.format("%.1f MB", sizeMb),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (manifest.releaseNotes.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = manifest.releaseNotes,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}
