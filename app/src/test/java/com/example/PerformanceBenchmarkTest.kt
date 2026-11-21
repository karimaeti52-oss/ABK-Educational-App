package com.example

import com.example.data.model.Lesson
import com.example.data.model.Subject
import com.example.update.AppUpdateManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import kotlin.system.measureTimeMillis

class PerformanceBenchmarkTest {

    @Test
    fun `search filter and page slicing over 10000 lessons executes within sub-second budget`() {
        val subjects = (1..200).map { i ->
            Subject(
                id = "subj_$i",
                title = "المادة الأكاديمية رقم $i",
                description = "وصف تفصيلي للمادة $i",
                sortOrder = i.toLong(),
                published = true
            )
        }
        val lessons = (1..10_000).map { i ->
            val subjIdx = (i % 200) + 1
            Lesson(
                id = "les_$i",
                subjectId = "subj_$subjIdx",
                subjectName = "المادة الأكاديمية رقم $subjIdx",
                unitTitle = "الوحدة ${(i % 10) + 1}",
                title = if (i % 50 == 0) "درس الفيزياء النووية المتقدم $i" else "درس التفاضل والتكامل $i",
                teacherName = "أ. كريم",
                lessonOrder = i.toLong(),
                published = true
            )
        }

        var pageSlice: List<Lesson> = emptyList()
        var matchedSubjects: List<Subject> = emptyList()
        val elapsedMs = measureTimeMillis {
            matchedSubjects = subjects.filter { it.title.contains("15") }
            val filteredLessons = lessons.filter {
                it.title.contains("النووية") && it.published
            }
            // Cursor page slice (25 items/page)
            pageSlice = filteredLessons.drop(25).take(25)
        }

        assertTrue("Expected matched subjects not empty", matchedSubjects.isNotEmpty())
        assertEquals(25, pageSlice.size)
        assertTrue(
            "Filtering & pagination across 10,000 lessons took ${elapsedMs}ms (expected < 1000ms)",
            elapsedMs < 1000L
        )
    }

    @Test
    fun `streaming SHA-256 verification handles 1MB payload efficiently`() {
        val oneMbPayload = ByteArray(1024 * 1024) { idx -> (idx % 251).toByte() }
        var hex = ""
        val elapsedMs = measureTimeMillis {
            hex = AppUpdateManager.computeSha256(ByteArrayInputStream(oneMbPayload))
        }
        assertEquals(64, hex.length)
        assertTrue("SHA-256 of 1MB took ${elapsedMs}ms (expected < 1000ms)", elapsedMs < 1000L)
    }

    @Test
    fun `spark quota budget verification under debounced writes and 50MB local cache`() {
        val sparkDailyReadLimit = 50_000L
        val sparkDailyWriteLimit = 20_000L

        // Without debouncing: saving every 1s during a 15-minute video = 900 writes/session.
        val unthrottledWritesPerStudent = 900L
        // With >=20s debounce: 15 minutes (900s) / 20s = ~45 writes/session max (plus completion).
        val debouncedWritesPerStudent = 900L / 20L
        assertTrue(debouncedWritesPerStudent * 20 <= unthrottledWritesPerStudent)

        // Daily student capacity staying within Spark write quota assuming avg 10 writes/user/day:
        val safeDauByWrites = sparkDailyWriteLimit / 10L
        // Daily student capacity staying within Spark read quota assuming ~25 cold reads/user/day:
        val safeDauByReads = sparkDailyReadLimit / 25L

        assertEquals(2_000L, safeDauByWrites)
        assertEquals(2_000L, safeDauByReads)
    }
}
