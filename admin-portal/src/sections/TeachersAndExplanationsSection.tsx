import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  AssetUrlOrUploadInput,
  EmptyBox,
  RowActionButtons,
  SectionHeader,
  StatusBadge,
  StatusSelector,
} from '../components/CommonUi';
import {
  commitSortOrderBatch,
  hardDeleteEntity,
  normalizeStatusFlags,
  restoreEntity,
  softDeleteEntity,
  updateEntityStatus,
  upsertEntity,
  type CmsStore,
} from '../services/firestoreCms';
import type {
  ContentBlock,
  ContentBlockType,
  LessonExplanation,
  PublishStatus,
  QaItem,
  QuizQuestion,
  StaffSession,
  Teacher,
} from '../types';
import { BLOCK_TYPE_LABELS } from '../types';

export function TeachersSection({
  store,
  staff,
  canEdit,
  canHardDelete,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  canEdit: boolean;
  canHardDelete: boolean;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);

  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [linkedUid, setLinkedUid] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState(1);
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');

  const teachers = store.teachers
    .filter((t) => (showDeleted ? true : !t.deletedAt))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);

  function startCreate() {
    setEditing(null);
    setName('');
    setHeadline('');
    setBio('');
    setPhotoUrl('');
    setLinkedUid('');
    setYoutubeUrl('');
    setTelegramUrl('');
    setWebsiteUrl('');
    setSubjectIds([]);
    setSortOrder(teachers.length + 1);
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(t: Teacher) {
    setEditing(t);
    setName(t.name);
    setHeadline(t.headline || '');
    setBio(t.bio || '');
    setPhotoUrl(t.photoUrl || '');
    setLinkedUid(t.linkedUid || '');
    setYoutubeUrl(t.youtubeUrl || '');
    setTelegramUrl(t.telegramUrl || '');
    setWebsiteUrl(t.websiteUrl || '');
    setSubjectIds(t.subjectIds || []);
    setSortOrder(t.sortOrder);
    setStatus(t.status || (t.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await upsertEntity(
        'teachers',
        editing?.id,
        {
          name: name.trim(),
          headline: headline.trim(),
          bio: bio.trim(),
          photoUrl: photoUrl.trim() || undefined,
          linkedUid: linkedUid.trim() || undefined,
          youtubeUrl: youtubeUrl.trim() || undefined,
          telegramUrl: telegramUrl.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
          subjectIds,
          sortOrder: Number(sortOrder) || 1,
          ...normalizeStatusFlags(status),
        },
        staff,
        name.trim()
      );
      setOpenForm(false);
      onToast('تم حفظ بيانات الأستاذ بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  async function moveTeacherOrder(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= teachers.length) return;
    const reordered = [...teachers];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await commitSortOrderBatch('teachers', reordered.map((x) => x.id));
    onToast('تم تحديث ترتيب الأساتذة');
  }

  return (
    <div>
      <SectionHeader
        title="إدارة الأساتذة والمدرسين"
        subtitle="أضف ملفات الأساتذة مع الصورة والنبذة والروابط وربطهم بالمواد والدروس."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
        action={
          canEdit && (
            <button type="button" onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white">
              <Plus className="h-4 w-4" />
              إضافة أستاذ
            </button>
          )
        }
      />

      {openForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-2xl border border-sky-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">اسم الأستاذ *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أ. قصي البابا" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">التخصص / المسمى</label>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="أستاذ الرياضيات والتحليل" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">نبذة تعريفية</label>
              <textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">معرف حساب Firebase (UID - اختياري)</label>
              <input dir="ltr" value={linkedUid} onChange={(e) => setLinkedUid(e.target.value)} placeholder="لربط دخول الأستاذ إلى لوحة التحكم" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">الترتيب</label>
                <input type="number" min={1} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <StatusSelector value={status} onChange={setStatus} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">قناة YouTube (اختياري)</label>
              <input dir="ltr" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">قناة Telegram / موقع (اختياري)</label>
              <input dir="ltr" value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm" />
            </div>
          </div>

          <AssetUrlOrUploadInput
            label="صورة الأستاذ"
            value={photoUrl}
            onChange={(url) => setPhotoUrl(url)}
            folderPath="teachers/avatars"
            imageOnly
            onToast={onToast}
          />

          {activeSubjects.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">المواد التي يدرسها</label>
              <div className="flex flex-wrap gap-2">
                {activeSubjects.map((s) => {
                  const selected = subjectIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSubjectIds(selected ? subjectIds.filter((x) => x !== s.id) : [...subjectIds, s.id])
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {s.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs">إلغاء</button>
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white">حفظ الأستاذ</button>
          </div>
        </form>
      )}

      {teachers.length === 0 ? (
        <EmptyBox title="لا يوجد أساتذة بعد" subtitle="أضف أساتذة المنصة لربط شروحاتهم المتعددة بالدروس." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {teachers.map((t, idx) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                {t.photoUrl ? (
                  <img src={t.photoUrl} alt={t.name} className="h-14 w-14 rounded-full border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-lg font-extrabold text-sky-700">
                    {t.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-[#0F294A]">{t.sortOrder}. {t.name}</h4>
                    <StatusBadge status={t.status} published={t.published} deletedAt={t.deletedAt} />
                  </div>
                  <p className="text-xs text-slate-500">{t.headline || 'مدرس في منصة ABK'}</p>
                  <p className="mt-0.5 text-[11px] text-sky-700">
                    {store.explanations.filter((e) => e.teacherId === t.id && !e.deletedAt).length} شرح درس
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && !t.deletedAt && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void moveTeacherOrder(idx, -1)}
                      disabled={idx === 0}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      title="تحريك للأعلى"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveTeacherOrder(idx, 1)}
                      disabled={idx === teachers.length - 1}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      title="تحريك للأسفل"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <RowActionButtons
                  published={t.published}
                  deletedAt={t.deletedAt}
                  canEdit={canEdit}
                  canHardDelete={canHardDelete}
                  onTogglePublish={() => updateEntityStatus('teachers', t.id, t.published ? 'DRAFT' : 'PUBLISHED', staff, t.name)}
                  onEdit={() => startEdit(t)}
                  onSoftDelete={() => softDeleteEntity('teachers', t.id, staff, t.name)}
                  onRestore={() => restoreEntity('teachers', t.id, staff, t.name)}
                  onHardDelete={() => hardDeleteEntity('teachers', t.id, staff, t.name)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExplanationsAndBlocksSection({
  store,
  staff,
  canEdit,
  canHardDelete,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  canEdit: boolean;
  canHardDelete: boolean;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);
  const activeLessons = store.lessons.filter((l) => !l.deletedAt);
  const activeTeachers = store.teachers.filter((t) => !t.deletedAt);

  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedExplanationId, setSelectedExplanationId] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  // Explanation Form
  const [openExpForm, setOpenExpForm] = useState(false);
  const [editingExp, setEditingExp] = useState<LessonExplanation | null>(null);
  const [expTeacherId, setExpTeacherId] = useState('');
  const [expTitle, setExpTitle] = useState('');
  const [expSummary, setExpSummary] = useState('');
  const [expSort, setExpSort] = useState(1);
  const [expStatus, setExpStatus] = useState<PublishStatus>('PUBLISHED');

  // Content Block Form
  const [openBlockForm, setOpenBlockForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ContentBlock | null>(null);
  const [blockType, setBlockType] = useState<ContentBlockType>('YOUTUBE_VIDEO');
  const [customTypeKey, setCustomTypeKey] = useState('');
  const [blockTitle, setBlockTitle] = useState('');
  const [blockSubtitle, setBlockSubtitle] = useState('');
  const [blockBodyText, setBlockBodyText] = useState('');
  const [blockMediaUrl, setBlockMediaUrl] = useState('');
  const [blockDuration, setBlockDuration] = useState('');
  const [blockFileSize, setBlockFileSize] = useState('');
  const [qaItems, setQaItems] = useState<QaItem[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [blockSort, setBlockSort] = useState(1);
  const [blockStatus, setBlockStatus] = useState<PublishStatus>('PUBLISHED');
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);

  const filteredLessons = useMemo(
    () => activeLessons.filter((l) => (!selectedSubjectId ? true : l.subjectId === selectedSubjectId)),
    [activeLessons, selectedSubjectId]
  );

  const currentLesson = activeLessons.find((l) => l.id === selectedLessonId) || filteredLessons[0] || null;
  const explanationsForLesson = useMemo(
    () =>
      store.explanations
        .filter((e) => (currentLesson ? e.lessonId === currentLesson.id : false))
        .filter((e) => (showDeleted ? true : !e.deletedAt))
        .filter((e) => (staff.role === 'TEACHER' ? e.teacherUid === staff.uid : true))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.explanations, currentLesson, showDeleted, staff]
  );

  const currentExplanation =
    explanationsForLesson.find((e) => e.id === selectedExplanationId) || explanationsForLesson[0] || null;

  const blocksForExplanation = useMemo(
    () =>
      store.blocks
        .filter((b) => (currentExplanation ? b.explanationId === currentExplanation.id : false))
        .filter((b) => (showDeleted ? true : !b.deletedAt))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.blocks, currentExplanation, showDeleted]
  );

  function startNewExp() {
    if (!currentLesson) return;
    const defaultTeacher =
      staff.role === 'TEACHER'
        ? activeTeachers.find((t) => t.linkedUid === staff.uid) || activeTeachers[0]
        : activeTeachers[0];
    setEditingExp(null);
    setExpTeacherId(defaultTeacher?.id || '');
    setExpTitle(defaultTeacher ? `شرح ${defaultTeacher.name}` : '');
    setExpSummary('');
    setExpSort(explanationsForLesson.length + 1);
    setExpStatus(staff.role === 'TEACHER' ? 'DRAFT' : 'PUBLISHED');
    setOpenExpForm(true);
  }

  async function saveExp(e: React.FormEvent) {
    e.preventDefault();
    if (!currentLesson) return;
    const teacher = activeTeachers.find((t) => t.id === expTeacherId);
    if (!teacher || !expTitle.trim()) return;
    try {
      const savedId = await upsertEntity(
        'lessonExplanations',
        editingExp?.id,
        {
          lessonId: currentLesson.id,
          lessonTitle: currentLesson.title,
          subjectId: currentLesson.subjectId,
          subjectName: currentLesson.subjectName,
          teacherId: teacher.id,
          teacherName: teacher.name,
          teacherPhotoUrl: teacher.photoUrl || undefined,
          teacherUid: teacher.linkedUid || undefined,
          title: expTitle.trim(),
          summary: expSummary.trim(),
          sortOrder: Number(expSort) || 1,
          ...normalizeStatusFlags(staff.role === 'TEACHER' ? 'DRAFT' : expStatus),
        },
        staff,
        `${teacher.name} - ${currentLesson.title}`
      );
      setSelectedExplanationId(savedId);
      setOpenExpForm(false);
      onToast('تم ربط الأستاذ بالدرس وحفظ الشرح المستقل');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  function startNewBlock() {
    if (!currentExplanation) return;
    setEditingBlock(null);
    setBlockType('YOUTUBE_VIDEO');
    setCustomTypeKey('');
    setBlockTitle('');
    setBlockSubtitle('');
    setBlockBodyText('');
    setBlockMediaUrl('');
    setBlockDuration('');
    setBlockFileSize('');
    setQaItems([{ question: '', answer: '' }]);
    setQuizQuestions([
      { id: `q_${Date.now()}`, prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', questionType: 'MCQ' },
    ]);
    setBlockSort(blocksForExplanation.length + 1);
    setBlockStatus(staff.role === 'TEACHER' ? 'DRAFT' : 'PUBLISHED');
    setOpenBlockForm(true);
  }

  function startEditBlock(b: ContentBlock) {
    setEditingBlock(b);
    setBlockType(b.blockType);
    setCustomTypeKey(b.customTypeKey || '');
    setBlockTitle(b.title);
    setBlockSubtitle(b.subtitle || '');
    setBlockBodyText(b.bodyText || '');
    setBlockMediaUrl(b.mediaUrl || '');
    setBlockDuration(b.durationLabel || '');
    setBlockFileSize(b.fileSizeLabel || '');
    setQaItems(b.qaItems?.length ? b.qaItems : [{ question: '', answer: '' }]);
    setQuizQuestions(
      b.quizQuestions?.length
        ? b.quizQuestions
        : [{ id: `q_${Date.now()}`, prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', questionType: 'MCQ' }]
    );
    setBlockSort(b.sortOrder);
    setBlockStatus(b.status || (b.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenBlockForm(true);
  }

  async function saveBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!currentExplanation || !blockTitle.trim()) return;
    const isQa = blockType === 'QA';
    const isQuiz = blockType === 'QUIZ_MCQ' || blockType === 'QUIZ_TRUE_FALSE' || blockType === 'INTERACTIVE_EXAM';

    try {
      await upsertEntity(
        'contentBlocks',
        editingBlock?.id,
        {
          explanationId: currentExplanation.id,
          lessonId: currentExplanation.lessonId,
          subjectId: currentExplanation.subjectId,
          teacherId: currentExplanation.teacherId,
          teacherUid: currentExplanation.teacherUid || undefined,
          blockType,
          customTypeKey: blockType === 'CUSTOM' ? customTypeKey : undefined,
          title: blockTitle.trim(),
          subtitle: blockSubtitle.trim() || undefined,
          bodyText: blockBodyText.trim() || undefined,
          mediaUrl: blockMediaUrl.trim() || undefined,
          durationLabel: blockDuration.trim() || undefined,
          fileSizeLabel: blockFileSize.trim() || undefined,
          qaItems: isQa ? qaItems.filter((q) => q.question.trim() && q.answer.trim()) : undefined,
          quizQuestions: isQuiz ? quizQuestions.filter((q) => q.prompt.trim()) : undefined,
          sortOrder: Number(blockSort) || 1,
          ...normalizeStatusFlags(staff.role === 'TEACHER' ? 'DRAFT' : blockStatus),
        },
        staff,
        blockTitle.trim()
      );
      setOpenBlockForm(false);
      onToast('تم حفظ كتلة المحتوى بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل حفظ الكتلة', true);
    }
  }

  async function handleDropBlock(targetId: string) {
    if (!dragBlockId || dragBlockId === targetId) return;
    const oldIdx = blocksForExplanation.findIndex((b) => b.id === dragBlockId);
    const newIdx = blocksForExplanation.findIndex((b) => b.id === targetId);
    if (oldIdx < 0 || newIdx < 0) return;
    const copy = [...blocksForExplanation];
    const [moved] = copy.splice(oldIdx, 1);
    copy.splice(newIdx, 0, moved);
    setDragBlockId(null);
    await commitSortOrderBatch('contentBlocks', copy.map((c) => c.id));
    onToast('تم إعادة ترتيب كتل المحتوى');
  }

  const canMutateBlocks = canEdit || staff.role === 'TEACHER';

  return (
    <div className="space-y-5">
      <SectionHeader
        title="ربط الأساتذة بالدروس وبناء الشروحات المتعددة"
        subtitle="كل أستاذ يملك محتوى مستقلاً تماماً للدرس نفسه (فيديوهات، PDF، صور، ملخصات، سؤال وجواب، واختبارات تفاعلية)."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
      />

      {/* Lesson Selector Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">تصفية حسب المادة</label>
          <select
            value={selectedSubjectId}
            onChange={(e) => {
              setSelectedSubjectId(e.target.value);
              setSelectedLessonId('');
              setSelectedExplanationId('');
            }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">كل المواد ({activeSubjects.length})</option>
            {activeSubjects.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">اختر الدرس</label>
          <select
            value={currentLesson?.id || ''}
            onChange={(e) => {
              setSelectedLessonId(e.target.value);
              setSelectedExplanationId('');
            }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {filteredLessons.length === 0 && <option value="">لا توجد دروس</option>}
            {filteredLessons.map((l) => (
              <option key={l.id} value={l.id}>
                [{l.subjectName}] {l.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!currentLesson ? (
        <EmptyBox title="اختر أو أضف درساً أولاً" subtitle="توجه لقسم الدروس لإضافة درس ثم عد لربط الأساتذة به." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Teachers Explaining This Lesson */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0F294A]">الأساتذة الشارحون للدرس</h3>
              {canMutateBlocks && activeTeachers.length > 0 && (
                <button
                  type="button"
                  onClick={startNewExp}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-bold text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  إضافة شرح أستاذ
                </button>
              )}
            </div>

            {openExpForm && (
              <form onSubmit={saveExp} className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-3">
                <select
                  required
                  value={expTeacherId}
                  onChange={(e) => {
                    setExpTeacherId(e.target.value);
                    const t = activeTeachers.find((x) => x.id === e.target.value);
                    if (t && !editingExp) setExpTitle(`شرح ${t.name}`);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  {activeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <input
                  required
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="عنوان الشرح (مثال: شرح أ. قصي الشامل)"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
                <input
                  value={expSummary}
                  onChange={(e) => setExpSummary(e.target.value)}
                  placeholder="ملخص سريع للشرح"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                />
                {staff.role !== 'TEACHER' && <StatusSelector value={expStatus} onChange={setExpStatus} />}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpenExpForm(false)} className="text-xs text-slate-500">إلغاء</button>
                  <button type="submit" className="rounded-lg bg-[#0F294A] px-3 py-1.5 text-xs font-bold text-white">حفظ</button>
                </div>
              </form>
            )}

            {explanationsForLesson.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">لم يرتبط أي أستاذ بهذا الدرس بعد.</p>
            ) : (
              <div className="space-y-2">
                {explanationsForLesson.map((exp) => {
                  const active = currentExplanation?.id === exp.id;
                  return (
                    <div
                      key={exp.id}
                      onClick={() => setSelectedExplanationId(exp.id)}
                      className={`cursor-pointer rounded-xl border p-3 transition ${
                        active ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#0F294A]">{exp.teacherName}</p>
                        <StatusBadge status={exp.status} published={exp.published} deletedAt={exp.deletedAt} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">{exp.title}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{store.blocks.filter((b) => b.explanationId === exp.id && !b.deletedAt).length} كتلة</span>
                        <RowActionButtons
                          published={exp.published}
                          deletedAt={exp.deletedAt}
                          canEdit={canEdit}
                          canHardDelete={canHardDelete}
                          onTogglePublish={() =>
                            updateEntityStatus('lessonExplanations', exp.id, exp.published ? 'DRAFT' : 'PUBLISHED', staff, exp.title)
                          }
                          onSoftDelete={() => softDeleteEntity('lessonExplanations', exp.id, staff, exp.title)}
                          onRestore={() => restoreEntity('lessonExplanations', exp.id, staff, exp.title)}
                          onHardDelete={() => hardDeleteEntity('lessonExplanations', exp.id, staff, exp.title)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Content Blocks Builder */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-[#0F294A]">
                  {currentExplanation ? `محتوى شرح: ${currentExplanation.teacherName}` : 'اختر أستاذاً لإدارة محتواه'}
                </h3>
                <p className="text-xs text-slate-500">اسحب وأفلت الكتل لإعادة ترتيب ظهورها في شاشة الطالب.</p>
              </div>
              {currentExplanation && canMutateBlocks && (
                <button
                  type="button"
                  onClick={startNewBlock}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-3.5 py-2 text-xs font-bold text-white"
                >
                  <Plus className="h-4 w-4" />
                  إضافة كتلة محتوى
                </button>
              )}
            </div>

            {openBlockForm && currentExplanation && (
              <form onSubmit={saveBlock} className="space-y-4 rounded-2xl border border-sky-200 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">نوع الكتلة *</label>
                    <select
                      value={blockType}
                      onChange={(e) => {
                        const next = e.target.value as ContentBlockType;
                        setBlockType(next);
                        if (next === 'QUIZ_TRUE_FALSE') {
                          setQuizQuestions([
                            { id: `q_${Date.now()}`, prompt: '', options: ['صح', 'خطأ'], correctIndex: 0, explanation: '', questionType: 'TRUE_FALSE' },
                          ]);
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {Object.entries(BLOCK_TYPE_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان الكتلة *</label>
                    <input
                      required
                      value={blockTitle}
                      onChange={(e) => setBlockTitle(e.target.value)}
                      placeholder="مثال: الفيديو التمهيدي / نوطة الدرس / اختبار سريع"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  {blockType === 'CUSTOM' && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">القسم المخصص</label>
                      <select
                        value={customTypeKey}
                        onChange={(e) => setCustomTypeKey(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">اختر نوعاً مخصصاً</option>
                        {store.customTypes.map((ct) => (
                          <option key={ct.id} value={ct.key}>{ct.labelAr}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">وصف فرعي (اختياري)</label>
                    <input value={blockSubtitle} onChange={(e) => setBlockSubtitle(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">الترتيب</label>
                      <input type="number" min={1} value={blockSort} onChange={(e) => setBlockSort(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                    </div>
                    {staff.role !== 'TEACHER' && <StatusSelector value={blockStatus} onChange={setBlockStatus} />}
                  </div>
                </div>

                {(['YOUTUBE_VIDEO', 'EXTERNAL_VIDEO', 'PDF_FILE', 'IMAGE', 'EXTERNAL_LINK', 'DOWNLOAD_FILE', 'ASSIGNMENT'].includes(blockType)) && (
                  <AssetUrlOrUploadInput
                    label={
                      blockType === 'YOUTUBE_VIDEO'
                        ? 'رابط YouTube'
                        : blockType === 'EXTERNAL_LINK'
                          ? 'الرابط الخارجي'
                          : blockType === 'ASSIGNMENT'
                            ? 'مرفق الواجب / رابط الملف (اختياري)'
                            : 'رابط الملف / أو ارفعه مباشرة'
                    }
                    value={blockMediaUrl}
                    onChange={(url, size) => {
                      setBlockMediaUrl(url);
                      if (size) setBlockFileSize(size);
                    }}
                    folderPath={`lessons/${currentExplanation.lessonId}`}
                    imageOnly={blockType === 'IMAGE'}
                    onToast={onToast}
                  />
                )}

                {(['YOUTUBE_VIDEO', 'EXTERNAL_VIDEO'].includes(blockType)) && (
                  <div className="max-w-xs">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">المدة (مثال 14:30)</label>
                    <input value={blockDuration} onChange={(e) => setBlockDuration(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  </div>
                )}

                {(['NOTE_SUMMARY', 'RICH_TEXT', 'CUSTOM', 'EXTERNAL_LINK', 'ASSIGNMENT'].includes(blockType)) && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      {blockType === 'ASSIGNMENT' ? 'نص الواجب / تعليمات التسليم' : 'المحتوى النصي / الملخص'}
                    </label>
                    <textarea rows={4} value={blockBodyText} onChange={(e) => setBlockBodyText(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  </div>
                )}

                {blockType === 'QA' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#0F294A]">بنود السؤال والجواب</label>
                      <button
                        type="button"
                        onClick={() => setQaItems([...qaItems, { question: '', answer: '' }])}
                        className="text-xs font-bold text-sky-700"
                      >
                        + سؤال جديد
                      </button>
                    </div>
                    {qaItems.map((qa, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-2">
                        <input
                          value={qa.question}
                          onChange={(e) => {
                            const copy = [...qaItems];
                            copy[idx] = { ...copy[idx], question: e.target.value };
                            setQaItems(copy);
                          }}
                          placeholder="السؤال..."
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                        />
                        <div className="flex gap-2">
                          <input
                            value={qa.answer}
                            onChange={(e) => {
                              const copy = [...qaItems];
                              copy[idx] = { ...copy[idx], answer: e.target.value };
                              setQaItems(copy);
                            }}
                            placeholder="الجواب..."
                            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                          />
                          <button type="button" onClick={() => setQaItems(qaItems.filter((_, i) => i !== idx))} className="text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(['QUIZ_MCQ', 'QUIZ_TRUE_FALSE', 'INTERACTIVE_EXAM'].includes(blockType)) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#0F294A]">الأسئلة التفاعلية</label>
                      <button
                        type="button"
                        onClick={() =>
                          setQuizQuestions([
                            ...quizQuestions,
                            {
                              id: `q_${Date.now()}`,
                              prompt: '',
                              options: blockType === 'QUIZ_TRUE_FALSE' ? ['صح', 'خطأ'] : ['', '', '', ''],
                              correctIndex: 0,
                              explanation: '',
                              questionType: blockType === 'QUIZ_TRUE_FALSE' ? 'TRUE_FALSE' : 'MCQ',
                            },
                          ])
                        }
                        className="text-xs font-bold text-sky-700"
                      >
                        + إضافة سؤال
                      </button>
                    </div>
                    {quizQuestions.map((qq, qIdx) => (
                      <div key={qq.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex gap-2">
                          <input
                            value={qq.prompt}
                            onChange={(e) => {
                              const copy = [...quizQuestions];
                              copy[qIdx] = { ...copy[qIdx], prompt: e.target.value };
                              setQuizQuestions(copy);
                            }}
                            placeholder={`نص السؤال ${qIdx + 1}`}
                            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold"
                          />
                          <button type="button" onClick={() => setQuizQuestions(quizQuestions.filter((_, i) => i !== qIdx))} className="text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {qq.options.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                name={`correct_${qq.id}`}
                                checked={qq.correctIndex === oIdx}
                                onChange={() => {
                                  const copy = [...quizQuestions];
                                  copy[qIdx] = { ...copy[qIdx], correctIndex: oIdx };
                                  setQuizQuestions(copy);
                                }}
                              />
                              <input
                                value={opt}
                                onChange={(e) => {
                                  const copy = [...quizQuestions];
                                  const nextOpts = [...copy[qIdx].options];
                                  nextOpts[oIdx] = e.target.value;
                                  copy[qIdx] = { ...copy[qIdx], options: nextOpts };
                                  setQuizQuestions(copy);
                                }}
                                placeholder={`الخيار ${oIdx + 1}`}
                                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                        <input
                          value={qq.explanation || ''}
                          onChange={(e) => {
                            const copy = [...quizQuestions];
                            copy[qIdx] = { ...copy[qIdx], explanation: e.target.value };
                            setQuizQuestions(copy);
                          }}
                          placeholder="تفسير الإجابة الصحيحة (يظهر للطالب بعد الحل)"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpenBlockForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs">إلغاء</button>
                  <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white">حفظ الكتلة</button>
                </div>
              </form>
            )}

            {currentExplanation && blocksForExplanation.length === 0 ? (
              <EmptyBox title="لا توجد كتل محتوى لهذا الأستاذ" subtitle="أضف فيديو، نوطة PDF، صور، ملخص، أو اختبار تفاعلي." />
            ) : (
              <div className="space-y-2.5">
                {blocksForExplanation.map((blk) => (
                  <div
                    key={blk.id}
                    draggable={canMutateBlocks && !blk.deletedAt}
                    onDragStart={() => setDragBlockId(blk.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropBlock(blk.id)}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-2.5">
                      <GripVertical className="h-4 w-4 cursor-grab text-slate-400" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-sky-700 shadow-2xs">
                            {BLOCK_TYPE_LABELS[blk.blockType]}
                          </span>
                          <span className="text-sm font-bold text-[#0F294A]">{blk.sortOrder}. {blk.title}</span>
                          <StatusBadge status={blk.status} published={blk.published} deletedAt={blk.deletedAt} />
                        </div>
                        {blk.mediaUrl && (
                          <p dir="ltr" className="mt-0.5 max-w-md truncate text-left text-[11px] text-slate-500">
                            {blk.mediaUrl}
                          </p>
                        )}
                      </div>
                    </div>
                    <RowActionButtons
                      published={blk.published}
                      deletedAt={blk.deletedAt}
                      canEdit={canMutateBlocks}
                      canHardDelete={canHardDelete}
                      onTogglePublish={
                        canEdit
                          ? () => updateEntityStatus('contentBlocks', blk.id, blk.published ? 'DRAFT' : 'PUBLISHED', staff, blk.title)
                          : undefined
                      }
                      onEdit={() => startEditBlock(blk)}
                      onSoftDelete={() => softDeleteEntity('contentBlocks', blk.id, staff, blk.title)}
                      onRestore={() => restoreEntity('contentBlocks', blk.id, staff, blk.title)}
                      onHardDelete={() => hardDeleteEntity('contentBlocks', blk.id, staff, blk.title)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
