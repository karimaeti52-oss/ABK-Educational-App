package com.example.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.R
import com.example.data.model.CatalogNode
import com.example.data.model.Lesson
import com.example.data.model.StudyMaterial
import com.example.data.model.Subject
import com.example.ui.components.AbkEmptyState
import com.example.ui.components.CatalogNodeCard
import com.example.ui.components.SectionHeader
import com.example.ui.components.SubjectCard
import com.example.ui.theme.AbkNavyDeep

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogBrowserScreen(
    node: CatalogNode?,
    allNodes: List<CatalogNode>,
    subjects: List<Subject>,
    lessons: List<Lesson>,
    materials: List<StudyMaterial>,
    onBack: () -> Unit,
    onOpenChildNode: (String) -> Unit,
    onOpenSubject: (String) -> Unit
) {
    val childNodes = remember(node?.id, allNodes) {
        allNodes.filter { it.parentId == node?.id }
    }

    val descendantIds = remember(node?.id, allNodes) {
        if (node == null) emptySet()
        else collectNodeAndDescendants(node.id, allNodes)
    }

    val matchingSubjects = remember(node?.id, descendantIds, subjects) {
        if (node == null) emptyList()
        else subjects.filter { subj ->
            subj.nodeIds.any { it in descendantIds }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = node?.title ?: "الأقسام الدراسية",
                        style = MaterialTheme.typography.titleLarge
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("catalog_browser_back_btn")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { innerPadding ->
        if (node == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                AbkEmptyState(
                    title = "القسم غير متوفر",
                    subtitle = "ربما تم إخفاء هذا القسم أو نقله من لوحة الإدارة."
                )
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .testTag("catalog_browser_screen"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Banner Header
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(126.dp)
                ) {
                    if (!node.imageUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = node.imageUrl,
                            contentDescription = node.title,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                            error = painterResource(id = R.drawable.img_midad_hero)
                        )
                    } else {
                        Image(
                            painter = painterResource(id = R.drawable.img_midad_hero),
                            contentDescription = node.title,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color.Transparent, AbkNavyDeep.copy(alpha = 0.88f))
                                )
                            )
                    )
                    Column(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color.White.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = node.typeLabel.ifBlank { node.parsedNodeType().labelAr },
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                            )
                        }
                        Text(
                            text = node.title,
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                        if (!node.subtitle.isNullOrBlank()) {
                            Text(
                                text = node.subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.9f)
                            )
                        }
                    }
                }
            }

            if (childNodes.isNotEmpty()) {
                item {
                    SectionHeader(title = "الأقسام والفروع (${childNodes.size})")
                }
                items(childNodes.chunked(2)) { pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        pair.forEach { child ->
                            val grandChildren = allNodes.count { it.parentId == child.id }
                            val childDesc = collectNodeAndDescendants(child.id, allNodes)
                            val childSubjCount = subjects.count { s -> s.nodeIds.any { it in childDesc } }
                            CatalogNodeCard(
                                node = child,
                                childCount = grandChildren,
                                subjectCount = childSubjCount,
                                onClick = { onOpenChildNode(child.id) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (pair.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }

            if (matchingSubjects.isNotEmpty()) {
                item {
                    SectionHeader(title = "المواد الدراسية (${matchingSubjects.size})")
                }
                items(matchingSubjects.chunked(2)) { pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        pair.forEach { subject ->
                            SubjectCard(
                                subject = subject,
                                lessonCount = lessons.count { it.subjectId == subject.id },
                                materialCount = materials.count { it.subjectId == subject.id },
                                onClick = { onOpenSubject(subject.id) },
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (pair.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }

            if (childNodes.isEmpty() && matchingSubjects.isEmpty()) {
                item {
                    AbkEmptyState(
                        title = "لا توجد مواد أو أقسام مضافة هنا بعد",
                        subtitle = "سيتم إضافة المواد والفروع من لوحة الإدارة."
                    )
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

fun collectNodeAndDescendants(rootId: String, allNodes: List<CatalogNode>): Set<String> {
    val visited = mutableSetOf(rootId)
    val queue = ArrayDeque<String>()
    queue.add(rootId)
    while (queue.isNotEmpty()) {
        val current = queue.removeFirst()
        allNodes.filter { it.parentId == current }.forEach { child ->
            if (visited.add(child.id)) {
                queue.add(child.id)
            }
        }
    }
    return visited
}
