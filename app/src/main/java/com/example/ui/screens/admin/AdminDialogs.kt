package com.example.ui.screens.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.data.model.Announcement
import com.example.data.model.AnnouncementCategory
import com.example.data.model.Lesson
import com.example.data.model.MaterialType
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.data.model.VideoSourceType
import com.example.util.UrlUtils

private val subjectIconOptions = listOf(
    "math" to "الرياضيات",
    "analysis" to "التحليل",
    "arabic" to "اللغة العربية",
    "religion" to "التربية الدينية",
    "english" to "اللغة الإنجليزية",
    "physics" to "الفيزياء",
    "science" to "العلوم",
    "chemistry" to "الكيمياء",
    "general" to "مادة عامة"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubjectEditorDialog(
    initial: Subject?,
    onDismiss: () -> Unit,
    onSave: (
        title: String,
        description: String,
        imageUrl: String?,
        iconKey: String,
        sortOrder: Long,
        published: Boolean
    ) -> Unit
) {
    var title by remember { mutableStateOf(initial?.title ?: "") }
    var description by remember { mutableStateOf(initial?.description ?: "") }
    var imageUrl by remember { mutableStateOf(initial?.imageUrl ?: "") }
    var iconKey by remember { mutableStateOf(initial?.iconKey ?: "general") }
    var sortOrderText by remember { mutableStateOf((initial?.sortOrder ?: 1L).toString()) }
    var published by remember { mutableStateOf(initial?.published ?: true) }
    var iconMenuExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "إضافة مادة جديدة" else "تعديل المادة") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("اسم المادة *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("وصف مختصر") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = imageUrl,
                    onValueChange = { imageUrl = it },
                    label = { Text("رابط صورة المادة (اختياري)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                ExposedDropdownMenuBox(
                    expanded = iconMenuExpanded,
                    onExpandedChange = { iconMenuExpanded = !iconMenuExpanded }
                ) {
                    val selectedLabel = subjectIconOptions.firstOrNull { it.first == iconKey }?.second ?: "مادة عامة"
                    OutlinedTextField(
                        value = selectedLabel,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("أيقونة / تصنيف المادة") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = iconMenuExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = iconMenuExpanded,
                        onDismissRequest = { iconMenuExpanded = false }
                    ) {
                        subjectIconOptions.forEach { (key, label) ->
                            DropdownMenuItem(
                                text = { Text(label) },
                                onClick = {
                                    iconKey = key
                                    iconMenuExpanded = false
                                }
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = sortOrderText,
                    onValueChange = { sortOrderText = it.filter { ch -> ch.isDigit() } },
                    label = { Text("ترتيب العرض") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("نشر المادة للطلاب", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = published, onCheckedChange = { published = it })
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val order = sortOrderText.toLongOrNull() ?: 1L
                    onSave(title, description, imageUrl.ifBlank { null }, iconKey, order, published)
                },
                enabled = title.trim().isNotEmpty(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("حفظ")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("إلغاء") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonEditorDialog(
    initial: Lesson?,
    subjects: List<Subject>,
    onDismiss: () -> Unit,
    onSave: (
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
    ) -> Unit
) {
    var selectedSubject by remember {
        mutableStateOf(
            subjects.firstOrNull { it.id == initial?.subjectId } ?: subjects.firstOrNull()
        )
    }
    var subjectMenuExpanded by remember { mutableStateOf(false) }
    var unitTitle by remember { mutableStateOf(initial?.unitTitle ?: "الوحدة الأولى") }
    var unitOrderText by remember { mutableStateOf((initial?.unitOrder ?: 1L).toString()) }
    var lessonOrderText by remember { mutableStateOf((initial?.lessonOrder ?: 1L).toString()) }
    var title by remember { mutableStateOf(initial?.title ?: "") }
    var description by remember { mutableStateOf(initial?.description ?: "") }
    var teacherName by remember { mutableStateOf(initial?.teacherName ?: "") }
    var durationLabel by remember { mutableStateOf(initial?.durationLabel ?: "") }
    var thumbnailUrl by remember { mutableStateOf(initial?.thumbnailUrl ?: "") }
    var videoUrl by remember { mutableStateOf(initial?.videoUrl ?: "") }
    var sourceType by remember { mutableStateOf(initial?.parsedVideoType() ?: VideoSourceType.YOUTUBE) }
    var sourceMenuExpanded by remember { mutableStateOf(false) }
    var published by remember { mutableStateOf(initial?.published ?: true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "إضافة درس فيديو جديد" else "تعديل الدرس") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ExposedDropdownMenuBox(
                    expanded = subjectMenuExpanded,
                    onExpandedChange = { subjectMenuExpanded = !subjectMenuExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedSubject?.title ?: "اختر المادة",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("المادة الدراسية *") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = subjectMenuExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = subjectMenuExpanded,
                        onDismissRequest = { subjectMenuExpanded = false }
                    ) {
                        subjects.forEach { subj ->
                            DropdownMenuItem(
                                text = { Text(subj.title) },
                                onClick = {
                                    selectedSubject = subj
                                    subjectMenuExpanded = false
                                }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("عنوان الدرس *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = unitTitle,
                    onValueChange = { unitTitle = it },
                    label = { Text("اسم الوحدة / الفصل *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = unitOrderText,
                        onValueChange = { unitOrderText = it.filter { ch -> ch.isDigit() } },
                        label = { Text("رقم الوحدة") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = lessonOrderText,
                        onValueChange = { lessonOrderText = it.filter { ch -> ch.isDigit() } },
                        label = { Text("ترتيب الدرس") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
                OutlinedTextField(
                    value = videoUrl,
                    onValueChange = {
                        videoUrl = it
                        if (initial == null) {
                            sourceType = UrlUtils.detectVideoSourceType(it)
                        }
                    },
                    label = { Text("رابط الفيديو (YouTube أو MP4 أو رابط خارجي) *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                ExposedDropdownMenuBox(
                    expanded = sourceMenuExpanded,
                    onExpandedChange = { sourceMenuExpanded = !sourceMenuExpanded }
                ) {
                    OutlinedTextField(
                        value = sourceType.labelAr,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("نوع رابط الفيديو") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = sourceMenuExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = sourceMenuExpanded,
                        onDismissRequest = { sourceMenuExpanded = false }
                    ) {
                        VideoSourceType.entries.forEach { type ->
                            DropdownMenuItem(
                                text = { Text(type.labelAr) },
                                onClick = {
                                    sourceType = type
                                    sourceMenuExpanded = false
                                }
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("وصف الدرس") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = teacherName,
                        onValueChange = { teacherName = it },
                        label = { Text("اسم المدرس") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = durationLabel,
                        onValueChange = { durationLabel = it },
                        label = { Text("المدة (مثال 15:30)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
                OutlinedTextField(
                    value = thumbnailUrl,
                    onValueChange = { thumbnailUrl = it },
                    label = { Text("رابط الصورة المصغرة (اختياري)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("نشر الدرس للطلاب", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = published, onCheckedChange = { published = it })
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val subj = selectedSubject ?: return@Button
                    onSave(
                        subj,
                        unitTitle,
                        unitOrderText.toLongOrNull() ?: 1L,
                        lessonOrderText.toLongOrNull() ?: 1L,
                        title,
                        description,
                        teacherName.ifBlank { null },
                        durationLabel.ifBlank { null },
                        thumbnailUrl.ifBlank { null },
                        videoUrl,
                        sourceType,
                        published
                    )
                },
                enabled = selectedSubject != null && title.trim().isNotEmpty() && videoUrl.trim().isNotEmpty(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("حفظ")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("إلغاء") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaterialEditorDialog(
    initial: StudyMaterial?,
    subjects: List<Subject>,
    lessons: List<Lesson>,
    onDismiss: () -> Unit,
    onSave: (
        subject: Subject,
        lesson: Lesson?,
        materialType: MaterialType,
        title: String,
        description: String,
        coverUrl: String?,
        fileUrl: String,
        published: Boolean
    ) -> Unit
) {
    var selectedSubject by remember {
        mutableStateOf(subjects.firstOrNull { it.id == initial?.subjectId } ?: subjects.firstOrNull())
    }
    var subjectMenuExpanded by remember { mutableStateOf(false) }

    val subjectLessons = remember(selectedSubject, lessons) {
        lessons.filter { it.subjectId == selectedSubject?.id }
    }
    var selectedLesson by remember {
        mutableStateOf(lessons.firstOrNull { it.id == initial?.lessonId })
    }
    var lessonMenuExpanded by remember { mutableStateOf(false) }

    var materialType by remember { mutableStateOf(initial?.parsedType() ?: MaterialType.STUDY_NOTE) }
    var typeMenuExpanded by remember { mutableStateOf(false) }

    var title by remember { mutableStateOf(initial?.title ?: "") }
    var description by remember { mutableStateOf(initial?.description ?: "") }
    var coverUrl by remember { mutableStateOf(initial?.coverUrl ?: "") }
    var fileUrl by remember { mutableStateOf(initial?.fileUrl ?: "") }
    var published by remember { mutableStateOf(initial?.published ?: true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "إضافة ملف PDF جديد" else "تعديل أو استبدال الملف") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ExposedDropdownMenuBox(
                    expanded = subjectMenuExpanded,
                    onExpandedChange = { subjectMenuExpanded = !subjectMenuExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedSubject?.title ?: "اختر المادة",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("المادة الدراسية *") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = subjectMenuExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = subjectMenuExpanded,
                        onDismissRequest = { subjectMenuExpanded = false }
                    ) {
                        subjects.forEach { subj ->
                            DropdownMenuItem(
                                text = { Text(subj.title) },
                                onClick = {
                                    selectedSubject = subj
                                    selectedLesson = null
                                    subjectMenuExpanded = false
                                }
                            )
                        }
                    }
                }

                ExposedDropdownMenuBox(
                    expanded = typeMenuExpanded,
                    onExpandedChange = { typeMenuExpanded = !typeMenuExpanded }
                ) {
                    OutlinedTextField(
                        value = materialType.labelAr,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("نوع الملف *") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeMenuExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = typeMenuExpanded,
                        onDismissRequest = { typeMenuExpanded = false }
                    ) {
                        MaterialType.entries.forEach { type ->
                            DropdownMenuItem(
                                text = { Text(type.labelAr) },
                                onClick = {
                                    materialType = type
                                    typeMenuExpanded = false
                                }
                            )
                        }
                    }
                }

                if (subjectLessons.isNotEmpty()) {
                    ExposedDropdownMenuBox(
                        expanded = lessonMenuExpanded,
                        onExpandedChange = { lessonMenuExpanded = !lessonMenuExpanded }
                    ) {
                        OutlinedTextField(
                            value = selectedLesson?.title ?: "غير مرتبط بدرس محدد",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("ربط بدرس (اختياري)") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = lessonMenuExpanded) },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = lessonMenuExpanded,
                            onDismissRequest = { lessonMenuExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("عام للمادة") },
                                onClick = {
                                    selectedLesson = null
                                    lessonMenuExpanded = false
                                }
                            )
                            subjectLessons.forEach { l ->
                                DropdownMenuItem(
                                    text = { Text(l.title) },
                                    onClick = {
                                        selectedLesson = l
                                        lessonMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("اسم الملف / الكتاب / النوطة *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = fileUrl,
                    onValueChange = { fileUrl = it },
                    label = { Text("رابط ملف PDF المباشر أو Google Drive *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(
                    text = "تلميح: يدعم روابط PDF المباشرة وروابط مشاركة Google Drive تلقائياً.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("وصف الملف") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = coverUrl,
                    onValueChange = { coverUrl = it },
                    label = { Text("رابط صورة الغلاف (اختياري)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("نشر الملف للطلاب", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = published, onCheckedChange = { published = it })
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val subj = selectedSubject ?: return@Button
                    onSave(
                        subj,
                        selectedLesson,
                        materialType,
                        title,
                        description,
                        coverUrl.ifBlank { null },
                        fileUrl,
                        published
                    )
                },
                enabled = selectedSubject != null && title.trim().isNotEmpty() && fileUrl.trim().isNotEmpty(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("حفظ")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("إلغاء") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnnouncementEditorDialog(
    initial: Announcement?,
    subjects: List<Subject>,
    onDismiss: () -> Unit,
    onSave: (
        title: String,
        body: String,
        category: AnnouncementCategory,
        subjectId: String?,
        pinned: Boolean,
        published: Boolean
    ) -> Unit
) {
    var title by remember { mutableStateOf(initial?.title ?: "") }
    var body by remember { mutableStateOf(initial?.body ?: "") }
    var category by remember { mutableStateOf(initial?.parsedCategory() ?: AnnouncementCategory.NEW_LESSON) }
    var catExpanded by remember { mutableStateOf(false) }
    var selectedSubjectId by remember { mutableStateOf(initial?.subjectId) }
    var subjExpanded by remember { mutableStateOf(false) }
    var pinned by remember { mutableStateOf(initial?.pinned ?: true) }
    var published by remember { mutableStateOf(initial?.published ?: true) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "إرسال إعلان وتنبيه للطلاب" else "تعديل الإعلان") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("عنوان التنبيه *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    label = { Text("نص الإعلان أو الإشعار *") },
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth()
                )
                ExposedDropdownMenuBox(
                    expanded = catExpanded,
                    onExpandedChange = { catExpanded = !catExpanded }
                ) {
                    OutlinedTextField(
                        value = category.labelAr,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("تصنيف الإشعار") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = catExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = catExpanded,
                        onDismissRequest = { catExpanded = false }
                    ) {
                        AnnouncementCategory.entries.forEach { cat ->
                            DropdownMenuItem(
                                text = { Text(cat.labelAr) },
                                onClick = {
                                    category = cat
                                    catExpanded = false
                                }
                            )
                        }
                    }
                }
                if (subjects.isNotEmpty()) {
                    ExposedDropdownMenuBox(
                        expanded = subjExpanded,
                        onExpandedChange = { subjExpanded = !subjExpanded }
                    ) {
                        val subjLabel = subjects.firstOrNull { it.id == selectedSubjectId }?.title ?: "عام لكل المنصة"
                        OutlinedTextField(
                            value = subjLabel,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("توجيه إلى مادة (اختياري)") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = subjExpanded) },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .fillMaxWidth()
                        )
                        ExposedDropdownMenu(
                            expanded = subjExpanded,
                            onDismissRequest = { subjExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("عام لكل المنصة") },
                                onClick = {
                                    selectedSubjectId = null
                                    subjExpanded = false
                                }
                            )
                            subjects.forEach { s ->
                                DropdownMenuItem(
                                    text = { Text(s.title) },
                                    onClick = {
                                        selectedSubjectId = s.id
                                        subjExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("تثبيت في الصفحة الرئيسية", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = pinned, onCheckedChange = { pinned = it })
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("نشر الإعلان فوراً", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = published, onCheckedChange = { published = it })
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(title, body, category, selectedSubjectId, pinned, published) },
                enabled = title.trim().isNotEmpty() && body.trim().isNotEmpty(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("إرسال ونشر")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("إلغاء") }
        }
    )
}
