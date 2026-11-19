import React, { useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus } from 'lucide-react';
import { getDownloadURL, listAll, ref } from 'firebase/storage';
import {
  AssetUrlOrUploadInput,
  EmptyBox,
  RowActionButtons,
  SectionHeader,
  StatusBadge,
  StatusSelector,
} from '../components/CommonUi';
import { firebaseStorage } from '../firebase';
import {
  hardDeleteEntity,
  normalizeStatusFlags,
  restoreEntity,
  softDeleteEntity,
  updateEntityStatus,
  upsertEntity,
  type CmsStore,
} from '../services/firestoreCms';
import type {
  Lesson,
  MaterialType,
  NavSectionId,
  PublishStatus,
  StaffSession,
  StudyMaterial,
  VideoSourceType,
} from '../types';
import { BLOCK_TYPE_LABELS } from '../types';

export function LessonsSection({
  store,
  staff,
  canEdit,
  canHardDelete,
  onNavigate,
  onToast,
}: {
  store: CmsStore;
  staff: StaffSession;
  canEdit: boolean;
  canHardDelete: boolean;
  onNavigate: (sec: NavSectionId) => void;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);

  const [subjectId, setSubjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [unitTitle, setUnitTitle] = useState('الوحدة الأولى');
  const [unitOrder, setUnitOrder] = useState(1);
  const [lessonOrder, setLessonOrder] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [durationLabel, setDurationLabel] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>('YOUTUBE');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');

  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);
  const activeUnits = store.units.filter((u) => !u.deletedAt && u.subjectId === subjectId);
  const lessons = store.lessons
    .filter((l) => (showDeleted ? true : !l.deletedAt))
    .filter((l) => (!filterSubjectId ? true : l.subjectId === filterSubjectId))
    .sort((a, b) => a.unitOrder - b.unitOrder || a.lessonOrder - b.lessonOrder);

  function startCreate() {
    const firstSubj = filterSubjectId || activeSubjects[0]?.id || '';
    setEditing(null);
    setSubjectId(firstSubj);
    setUnitId('');
    setUnitTitle('الوحدة الأولى');
    setUnitOrder(1);
    setLessonOrder(lessons.length + 1);
    setTitle('');
    setDescription('');
    setTeacherName('');
    setDurationLabel('');
    setVideoUrl('');
    setVideoSourceType('YOUTUBE');
    setThumbnailUrl('');
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(l: Lesson) {
    setEditing(l);
    setSubjectId(l.subjectId);
    setUnitId(l.unitId || '');
    setUnitTitle(l.unitTitle);
    setUnitOrder(l.unitOrder);
    setLessonOrder(l.lessonOrder);
    setTitle(l.title);
    setDescription(l.description);
    setTeacherName(l.teacherName || '');
    setDurationLabel(l.durationLabel || '');
    setVideoUrl(l.videoUrl);
    setVideoSourceType(l.videoSourceType || 'YOUTUBE');
    setThumbnailUrl(l.thumbnailUrl || '');
    setStatus(l.status || (l.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const subj = activeSubjects.find((s) => s.id === subjectId);
    if (!subj || !title.trim()) return;
    try {
      await upsertEntity(
        'lessons',
        editing?.id,
        {
          subjectId: subj.id,
          subjectName: subj.title,
          unitId: unitId || undefined,
          unitTitle: unitTitle.trim() || 'الوحدة الأولى',
          unitOrder: Number(unitOrder) || 1,
          lessonOrder: Number(lessonOrder) || 1,
          title: title.trim(),
          description: description.trim(),
          teacherName: teacherName.trim() || undefined,
          durationLabel: durationLabel.trim() || undefined,
          thumbnailUrl: thumbnailUrl.trim() || undefined,
          videoUrl: videoUrl.trim(),
          videoSourceType,
          ...normalizeStatusFlags(status),
        },
        staff,
        title.trim()
      );
      setOpenForm(false);
      onToast('تم حفظ الدرس بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  return (
    <div>
      <SectionHeader
        title="إدارة الدروس"
        subtitle="أضف دروساً جديدة واربطها بالمادة والوحدة، ثم أضف عدة أساتذة وشروحات لكل درس."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
        action={
          canEdit && (
            <button
              type="button"
              onClick={startCreate}
              disabled={activeSubjects.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              إضافة درس جديد
            </button>
          )
        }
      />

      <div className="mb-4">
        <select
          value={filterSubjectId}
          onChange={(e) => setFilterSubjectId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">كل المواد</option>
          {activeSubjects.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </div>

      {openForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-2xl border border-sky-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">المادة *</label>
              <select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {activeSubjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان الدرس *</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>

            {activeUnits.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">اختيار وحدة مسجلة</label>
                <select
                  value={unitId}
                  onChange={(e) => {
                    const u = activeUnits.find((x) => x.id === e.target.value);
                    setUnitId(e.target.value);
                    if (u) {
                      setUnitTitle(u.title);
                      setUnitOrder(u.sortOrder);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">كتابة اسم وحدة يدوياً</option>
                  {activeUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.sortOrder}. {u.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">اسم الوحدة *</label>
              <input required value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">رقم الوحدة</label>
                <input type="number" min={1} value={unitOrder} onChange={(e) => setUnitOrder(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">ترتيب الدرس</label>
                <input type="number" min={1} value={lessonOrder} onChange={(e) => setLessonOrder(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">رابط الفيديو الأساسي (اختياري عند استخدام شروحات الأساتذة)</label>
              <input dir="ltr" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">مصدر الفيديو</label>
                <select value={videoSourceType} onChange={(e) => setVideoSourceType(e.target.value as VideoSourceType)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="YOUTUBE">YouTube</option>
                  <option value="MP4">ملف MP4</option>
                  <option value="EXTERNAL">رابط خارجي</option>
                </select>
              </div>
              <StatusSelector value={status} onChange={setStatus} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">اسم المدرس الافتراضي</label>
              <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">المدة</label>
              <input value={durationLabel} onChange={(e) => setDurationLabel(e.target.value)} placeholder="15:30" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">وصف الدرس</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>

          <AssetUrlOrUploadInput
            label="الصورة المصغرة للدرس"
            value={thumbnailUrl}
            onChange={(url) => setThumbnailUrl(url)}
            folderPath="lessons/thumbnails"
            imageOnly
            onToast={onToast}
          />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs">إلغاء</button>
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white">حفظ الدرس</button>
          </div>
        </form>
      )}

      {lessons.length === 0 ? (
        <EmptyBox title="لا توجد دروس" subtitle="أضف أول درس وحدد وحدته ومادته." />
      ) : (
        <div className="space-y-2.5">
          {lessons.map((l) => {
            const expCount = store.explanations.filter((e) => e.lessonId === l.id && !e.deletedAt).length;
            return (
              <div key={l.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">{l.subjectName}</span>
                    <span className="font-bold text-[#0F294A]">{l.lessonOrder}. {l.title}</span>
                    <StatusBadge status={l.status} published={l.published} deletedAt={l.deletedAt} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {l.unitTitle} • {expCount} شرح أستاذ مستقل
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('explanations')}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    إدارة شروحات الأساتذة ({expCount})
                  </button>
                  <RowActionButtons
                    published={l.published}
                    deletedAt={l.deletedAt}
                    canEdit={canEdit}
                    canHardDelete={canHardDelete}
                    onTogglePublish={() => updateEntityStatus('lessons', l.id, l.published ? 'DRAFT' : 'PUBLISHED', staff, l.title)}
                    onEdit={() => startEdit(l)}
                    onSoftDelete={() => softDeleteEntity('lessons', l.id, staff, l.title)}
                    onRestore={() => restoreEntity('lessons', l.id, staff, l.title)}
                    onHardDelete={() => hardDeleteEntity('lessons', l.id, staff, l.title)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MaterialsSection({
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
  const [editing, setEditing] = useState<StudyMaterial | null>(null);

  const [subjectId, setSubjectId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [materialType, setMaterialType] = useState<MaterialType>('STUDY_NOTE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');

  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);
  const materials = store.materials.filter((m) => (showDeleted ? true : !m.deletedAt));

  function startCreate() {
    setEditing(null);
    setSubjectId(activeSubjects[0]?.id || '');
    setLessonId('');
    setMaterialType('STUDY_NOTE');
    setTitle('');
    setDescription('');
    setFileUrl('');
    setCoverUrl('');
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(m: StudyMaterial) {
    setEditing(m);
    setSubjectId(m.subjectId);
    setLessonId(m.lessonId || '');
    setMaterialType(m.materialType);
    setTitle(m.title);
    setDescription(m.description);
    setFileUrl(m.fileUrl);
    setCoverUrl(m.coverUrl || '');
    setStatus(m.status || (m.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const subj = activeSubjects.find((s) => s.id === subjectId);
    const lesson = store.lessons.find((l) => l.id === lessonId);
    if (!subj || !title.trim() || !fileUrl.trim()) return;
    try {
      await upsertEntity(
        'materials',
        editing?.id,
        {
          subjectId: subj.id,
          subjectName: subj.title,
          lessonId: lesson?.id || undefined,
          lessonTitle: lesson?.title || undefined,
          materialType,
          title: title.trim(),
          description: description.trim(),
          coverUrl: coverUrl.trim() || undefined,
          fileUrl: fileUrl.trim(),
          ...normalizeStatusFlags(status),
        },
        staff,
        title.trim()
      );
      setOpenForm(false);
      onToast('تم حفظ ملف PDF بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  return (
    <div>
      <SectionHeader
        title="إدارة ملفات PDF والنوطات والكتب"
        subtitle="ارفع الملفات مباشرة إلى Firebase Storage أو أضف روابط مباشرة أو روابط Google Drive."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
        action={
          canEdit && (
            <button type="button" onClick={startCreate} disabled={activeSubjects.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              <Plus className="h-4 w-4" />
              إضافة ملف PDF
            </button>
          )
        }
      />

      {openForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-2xl border border-sky-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">المادة *</label>
              <select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">نوع الملف *</label>
              <select value={materialType} onChange={(e) => setMaterialType(e.target.value as MaterialType)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="TEXTBOOK">كتاب مدرسي</option>
                <option value="STUDY_NOTE">نوطة دراسية</option>
                <option value="SUMMARY">ملخص</option>
                <option value="IMPORTANT_QUESTIONS">أسئلة مهمة</option>
                <option value="WORKSHEET">ورقة عمل</option>
                <option value="PRACTICE_EXAM">امتحان تدريبي</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان الملف *</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <StatusSelector value={status} onChange={setStatus} />
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">الوصف</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>

          <AssetUrlOrUploadInput
            label="ملف PDF (رابط أو رفع مباشر إلى Storage) *"
            value={fileUrl}
            onChange={(url) => setFileUrl(url)}
            folderPath={`materials/${subjectId || 'general'}`}
            onToast={onToast}
          />

          <AssetUrlOrUploadInput
            label="صورة الغلاف (اختياري)"
            value={coverUrl}
            onChange={(url) => setCoverUrl(url)}
            folderPath="materials/covers"
            imageOnly
            onToast={onToast}
          />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs">إلغاء</button>
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white">حفظ الملف</button>
          </div>
        </form>
      )}

      {materials.length === 0 ? (
        <EmptyBox title="لا توجد ملفات PDF" subtitle="أضف كتباً ونوطات وملخصات ونماذج امتحانية." />
      ) : (
        <div className="space-y-2.5">
          {materials.map((m) => (
            <div key={m.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700">{m.subjectName}</span>
                  <span className="font-bold text-[#0F294A]">{m.title}</span>
                  <StatusBadge status={m.status} published={m.published} deletedAt={m.deletedAt} />
                </div>
                <p dir="ltr" className="mt-1 max-w-md truncate text-left text-xs text-slate-500">{m.fileUrl}</p>
              </div>
              <RowActionButtons
                published={m.published}
                deletedAt={m.deletedAt}
                canEdit={canEdit}
                canHardDelete={canHardDelete}
                onTogglePublish={() => updateEntityStatus('materials', m.id, m.published ? 'DRAFT' : 'PUBLISHED', staff, m.title)}
                onEdit={() => startEdit(m)}
                onSoftDelete={() => softDeleteEntity('materials', m.id, staff, m.title)}
                onRestore={() => restoreEntity('materials', m.id, staff, m.title)}
                onHardDelete={() => hardDeleteEntity('materials', m.id, staff, m.title)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VideosOverviewSection({
  store,
  onNavigate,
}: {
  store: CmsStore;
  onNavigate: (sec: NavSectionId) => void;
}) {
  const videoBlocks = store.blocks.filter(
    (b) => !b.deletedAt && (b.blockType === 'YOUTUBE_VIDEO' || b.blockType === 'EXTERNAL_VIDEO')
  );
  const legacyVideos = store.lessons.filter((l) => !l.deletedAt && l.videoUrl);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="إدارة الفيديوهات التعليمية"
        subtitle="استعراض موحد لجميع فيديوهات الشروحات المتعددة والروابط المسجلة عبر المنصة."
        action={
          <button
            type="button"
            onClick={() => onNavigate('explanations')}
            className="rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white"
          >
            إضافة فيديو داخل شرح أستاذ
          </button>
        }
      />

      {videoBlocks.length === 0 && legacyVideos.length === 0 ? (
        <EmptyBox title="لا توجد فيديوهات بعد" subtitle="أضف فيديوهات داخل الدروس أو داخل شروحات الأساتذة." />
      ) : (
        <div className="space-y-2.5">
          {videoBlocks.map((vb) => {
            const exp = store.explanations.find((e) => e.id === vb.explanationId);
            return (
              <div key={vb.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">
                      {BLOCK_TYPE_LABELS[vb.blockType]}
                    </span>
                    <span className="font-bold text-[#0F294A]">{vb.title}</span>
                    <StatusBadge status={vb.status} published={vb.published} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {exp ? `${exp.teacherName} • ${exp.lessonTitle || ''}` : vb.lessonId} {vb.durationLabel ? `• ${vb.durationLabel}` : ''}
                  </p>
                </div>
                {vb.mediaUrl && (
                  <a href={vb.mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-sky-700">
                    <ExternalLink className="h-3.5 w-3.5" />
                    معاينة
                  </a>
                )}
              </div>
            );
          })}
          {legacyVideos.map((lv) => (
            <div key={lv.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">درس أساسي</span>
                  <span className="font-bold text-[#0F294A]">{lv.title}</span>
                  <StatusBadge status={lv.status} published={lv.published} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{lv.subjectName} • {lv.unitTitle}</p>
              </div>
              <a href={lv.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-sky-700">
                <ExternalLink className="h-3.5 w-3.5" />
                فتح الرابط
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QuizzesOverviewSection({
  store,
  onNavigate,
}: {
  store: CmsStore;
  onNavigate: (sec: NavSectionId) => void;
}) {
  const quizAndQaBlocks = useMemo(
    () =>
      store.blocks.filter(
        (b) =>
          !b.deletedAt &&
          (b.blockType === 'QUIZ_MCQ' ||
            b.blockType === 'QUIZ_TRUE_FALSE' ||
            b.blockType === 'INTERACTIVE_EXAM' ||
            b.blockType === 'QA')
      ),
    [store.blocks]
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        title="بنك الأسئلة والاختبارات التفاعلية"
        subtitle="إدارة ومراجعة كافة الاختبارات (اختيار من متعدد، صح وخطأ، سؤال وجواب) المرتبطة بشروحات الأساتذة."
        action={
          <button
            type="button"
            onClick={() => onNavigate('explanations')}
            className="rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white"
          >
            + إنشاء اختبار في شرح أستاذ
          </button>
        }
      />

      {quizAndQaBlocks.length === 0 ? (
        <EmptyBox title="لا توجد اختبارات بعد" subtitle="من قسم ربط الأساتذة بالدروس، اختر كتلة اختبار تفاعلي أو سؤال وجواب." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {quizAndQaBlocks.map((b) => {
            const exp = store.explanations.find((e) => e.id === b.explanationId);
            const qCount = b.blockType === 'QA' ? b.qaItems?.length || 0 : b.quizQuestions?.length || 0;
            return (
              <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    {BLOCK_TYPE_LABELS[b.blockType]}
                  </span>
                  <StatusBadge status={b.status} published={b.published} />
                </div>
                <h4 className="mt-2 font-bold text-[#0F294A]">{b.title}</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {exp ? `${exp.teacherName} • ${exp.lessonTitle}` : ''} • {qCount} سؤال
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MediaLibrarySection({
  onToast,
}: {
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [folder, setFolder] = useState('branding');
  const [uploadUrl, setUploadUrl] = useState('');
  const [files, setFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [loading, setLoading] = useState(false);

  async function loadFolder(targetFolder: string) {
    setLoading(true);
    try {
      const res = await listAll(ref(firebaseStorage, targetFolder));
      const items = await Promise.all(
        res.items.map(async (itemRef) => ({
          name: itemRef.name,
          url: await getDownloadURL(itemRef),
        }))
      );
      setFiles(items);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'تعذر قراءة المجلد من Storage', true);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="مكتبة الصور والملفات (Firebase Storage)"
        subtitle="ارفع الصور والملفات مع التحقق التلقائي من الصيغة والحجم، وانسخ روابطها مباشرة."
      />

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="branding">الهوية والشعارات (branding/)</option>
            <option value="catalog">المراحل والفروع (catalog/)</option>
            <option value="subjects/covers">أغلفة المواد (subjects/covers/)</option>
            <option value="teachers/avatars">صور الأساتذة (teachers/avatars/)</option>
            <option value="materials/general">الكتب والنوطات (materials/general/)</option>
          </select>
          <button
            type="button"
            onClick={() => loadFolder(folder)}
            className="rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white"
          >
            {loading ? 'جاري الجلب...' : 'تحديث محتويات المجلد'}
          </button>
        </div>

        <AssetUrlOrUploadInput
          label={`رفع ملف جديد إلى مجلد ${folder}`}
          value={uploadUrl}
          onChange={(u) => {
            setUploadUrl(u);
            if (u) loadFolder(folder);
          }}
          folderPath={folder}
          onToast={onToast}
        />

        {files.length > 0 && (
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((f) => (
              <div key={f.name} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <span className="truncate font-semibold text-slate-700">{f.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(f.url);
                    onToast('تم نسخ الرابط');
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 font-bold text-sky-700 shadow-2xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
