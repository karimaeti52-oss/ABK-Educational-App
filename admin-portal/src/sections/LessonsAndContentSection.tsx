import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  HardDrive,
  Play,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  AssetUrlOrUploadInput,
  EmptyBox,
  RowActionButtons,
  SectionHeader,
  StatusBadge,
  StatusSelector,
} from '../components/CommonUi';
import {
  AuthenticatedDirectVideo,
  VideoPreviewModal,
  YouTubeVideoPlayer,
} from '../components/YouTubePlayer';
import {
  fetchR2QuotaStatus,
  inferStorageProviderFromUrl,
  resolveActiveR2WorkerUrl,
} from '../services/r2UploadClient';
import {
  buildMultiProviderStorageSummary,
  formatBytesReadable,
  resolveR2StorageLimits,
  type R2UploadResult,
} from '../utils/r2Upload';
import { getYouTubeThumbnailUrl, getYouTubeWatchUrl, isYouTubeUrl } from '../utils/youtube';
import {
  commitSortOrderBatch,
  hardDeleteEntity,
  normalizeStatusFlags,
  registerUploadedMediaAsset,
  restoreEntity,
  softDeleteEntity,
  updateEntityStatus,
  upsertEntity,
  type CmsStore,
} from '../services/firestoreCms';
import type {
  Lesson,
  MaterialType,
  MediaAsset,
  MediaKind,
  NavSectionId,
  PublishStatus,
  R2QuotaStatus,
  StaffSession,
  StorageProviderId,
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
  const [videoSourceType, setVideoSourceType] = useState<VideoSourceType>('MP4');
  const [r2ObjectKey, setR2ObjectKey] = useState('');
  const [storageProvider, setStorageProvider] = useState<StorageProviderId>('b2');
  const [sizeBytes, setSizeBytes] = useState<number | undefined>(undefined);
  const [uploadedVideoMeta, setUploadedVideoMeta] = useState<R2UploadResult | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');
  const [previewVideo, setPreviewVideo] = useState<{ title: string; url: string } | null>(null);
  const [showInlinePreview, setShowInlinePreview] = useState(false);

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
    setVideoSourceType('MP4');
    setR2ObjectKey('');
    setStorageProvider('b2');
    setSizeBytes(undefined);
    setUploadedVideoMeta(null);
    setThumbnailUrl('');
    setStatus('PUBLISHED');
    setShowInlinePreview(false);
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
    setVideoSourceType(l.videoSourceType || 'MP4');
    setR2ObjectKey(l.r2ObjectKey || '');
    setStorageProvider(inferStorageProviderFromUrl(l.videoUrl, l.storageProvider));
    setSizeBytes(l.sizeBytes);
    setUploadedVideoMeta(null);
    setThumbnailUrl(l.thumbnailUrl || '');
    setStatus(l.status || (l.published ? 'PUBLISHED' : 'DRAFT'));
    setShowInlinePreview(false);
    setOpenForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const subj = activeSubjects.find((s) => s.id === subjectId);
    if (!subj || !title.trim()) return;
    try {
      const lessonId = await upsertEntity(
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
          r2ObjectKey: r2ObjectKey.trim() || undefined,
          storageProvider: r2ObjectKey.trim() ? storageProvider : undefined,
          sizeBytes: sizeBytes ? Math.round(sizeBytes) : undefined,
          ...normalizeStatusFlags(status),
        },
        staff,
        title.trim()
      );
      if (uploadedVideoMeta) {
        try {
          await registerUploadedMediaAsset(
            uploadedVideoMeta,
            {
              title: title.trim(),
              durationLabel: durationLabel.trim() || undefined,
              nodeIds: subj.nodeIds,
              subjectId: subj.id,
              unitId: unitId || undefined,
              lessonId,
              published: status === 'PUBLISHED',
            },
            staff
          );
        } catch {
          // Best-effort catalog indexing
        }
      }
      setOpenForm(false);
      setUploadedVideoMeta(null);
      onToast('تم حفظ الدرس بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  async function moveLessonOrder(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= lessons.length) return;
    const reordered = [...lessons];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await commitSortOrderBatch('lessons', reordered.map((x) => x.id), 'lessonOrder');
    onToast('تم تحديث ترتيب الدروس');
  }

  return (
    <div>
      <SectionHeader
        title="إدارة الدروس والفيديوهات"
        subtitle="ارفع فيديوهات MP4 (H.264/AAC) مباشرة إلى Backblaze B2 (أو Cloudflare R2) أو اربط روابط خارجية، ونظّم الدروس حسب المواد والوحدات."
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">مصدر الفيديو</label>
                <select value={videoSourceType} onChange={(e) => setVideoSourceType(e.target.value as VideoSourceType)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="MP4">ملف MP4 / Backblaze B2 أو R2</option>
                  <option value="YOUTUBE">YouTube (اختياري)</option>
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
            label="فيديو الدرس (ارفع MP4/WebM إلى Backblaze B2 أو الصق رابطاً مباشراً / YouTube)"
            value={videoUrl}
            onChange={(url) => {
              setVideoUrl(url);
              if (isYouTubeUrl(url)) {
                setVideoSourceType('YOUTUBE');
              } else if (/\.mp4|\.webm|\.m3u8|\/files\/|\/b2\/files\//i.test(url)) {
                setVideoSourceType('MP4');
              }
              if (!url.trim()) {
                setR2ObjectKey('');
                setStorageProvider('b2');
                setSizeBytes(undefined);
                setUploadedVideoMeta(null);
              }
            }}
            onUploadedMeta={(meta) => {
              setVideoSourceType('MP4');
              setR2ObjectKey(meta.objectKey);
              setStorageProvider(meta.storageProvider);
              setSizeBytes(meta.sizeBytes);
              setUploadedVideoMeta(meta);
            }}
            folderPath={`videos/${subjectId || 'general'}`}
            accessLevel="private"
            videoOnly
            platformConfig={store.platformConfig}
            onToast={onToast}
          />

          {videoUrl.trim() && (
            <div>
              <button
                type="button"
                onClick={() => setShowInlinePreview((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100"
              >
                <Play className="h-3.5 w-3.5" />
                {showInlinePreview ? 'إخفاء معاينة الفيديو' : 'معاينة تشغيل الفيديو'}
              </button>
            </div>
          )}

          <AssetUrlOrUploadInput
            label="الصورة المصغرة للدرس"
            value={thumbnailUrl}
            onChange={(url) => setThumbnailUrl(url)}
            folderPath="lessons/thumbnails"
            imageOnly
            platformConfig={store.platformConfig}
            onToast={onToast}
          />

          {showInlinePreview && videoUrl.trim() && (
            isYouTubeUrl(videoUrl) ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <YouTubeVideoPlayer url={videoUrl} title={title || 'معاينة فيديو الدرس'} />
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
                <AuthenticatedDirectVideo url={videoUrl} platformConfig={store.platformConfig} />
              </div>
            )
          )}

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
          {lessons.map((l, idx) => {
            const expCount = store.explanations.filter((e) => e.lessonId === l.id && !e.deletedAt).length;
            return (
              <div key={l.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">{l.subjectName}</span>
                    <span className="font-bold text-[#0F294A]">{l.lessonOrder}. {l.title}</span>
                    {l.sizeBytes ? (
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                        {formatBytesReadable(l.sizeBytes)}
                      </span>
                    ) : null}
                    <StatusBadge status={l.status} published={l.published} deletedAt={l.deletedAt} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {l.unitTitle} • {expCount} شرح أستاذ مستقل
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && !l.deletedAt && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => void moveLessonOrder(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                        title="تحريك للأعلى"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveLessonOrder(idx, 1)}
                        disabled={idx === lessons.length - 1}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                        title="تحريك للأسفل"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {l.videoUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewVideo({ title: l.title, url: l.videoUrl })}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <Play className="h-3.5 w-3.5" />
                      مشاهدة الفيديو
                    </button>
                  )}
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
                    onHardDelete={() =>
                      hardDeleteEntity('lessons', l.id, staff, l.title, {
                        r2ObjectKey: l.r2ObjectKey,
                        storageProvider: l.storageProvider,
                        fileUrl: l.videoUrl,
                        platformConfig: store.platformConfig,
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <VideoPreviewModal
        open={Boolean(previewVideo)}
        title={previewVideo?.title || 'مشاهدة الفيديو'}
        url={previewVideo?.url || ''}
        platformConfig={store.platformConfig}
        onClose={() => setPreviewVideo(null)}
      />
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [materialType, setMaterialType] = useState<MaterialType>('STUDY_NOTE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [r2ObjectKey, setR2ObjectKey] = useState('');
  const [storageProvider, setStorageProvider] = useState<StorageProviderId>('b2');
  const [sizeBytes, setSizeBytes] = useState<number | undefined>(undefined);
  const [uploadedPdfMeta, setUploadedPdfMeta] = useState<R2UploadResult | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');

  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);
  const activeNodes = store.nodes.filter((n) => !n.deletedAt);
  const subjectLessons = store.lessons.filter((l) => !l.deletedAt && (!subjectId || l.subjectId === subjectId));
  const materials = store.materials.filter((m) => (showDeleted ? true : !m.deletedAt));

  function startCreate() {
    const firstSubj = activeSubjects[0];
    setEditing(null);
    setSubjectId(firstSubj?.id || '');
    setLessonId('');
    setSelectedNodeIds(firstSubj?.nodeIds || []);
    setMaterialType('STUDY_NOTE');
    setTitle('');
    setDescription('');
    setFileUrl('');
    setR2ObjectKey('');
    setStorageProvider('b2');
    setSizeBytes(undefined);
    setUploadedPdfMeta(null);
    setCoverUrl('');
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(m: StudyMaterial) {
    setEditing(m);
    setSubjectId(m.subjectId);
    setLessonId(m.lessonId || '');
    setSelectedNodeIds(m.nodeIds || []);
    setMaterialType(m.materialType);
    setTitle(m.title);
    setDescription(m.description);
    setFileUrl(m.fileUrl);
    setR2ObjectKey(m.r2ObjectKey || '');
    setStorageProvider(inferStorageProviderFromUrl(m.fileUrl, m.storageProvider));
    setSizeBytes(m.sizeBytes);
    setUploadedPdfMeta(null);
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
          nodeIds: selectedNodeIds.length ? selectedNodeIds : undefined,
          materialType,
          title: title.trim(),
          description: description.trim(),
          coverUrl: coverUrl.trim() || undefined,
          fileUrl: fileUrl.trim(),
          r2ObjectKey: r2ObjectKey.trim() || undefined,
          storageProvider: r2ObjectKey.trim() ? storageProvider : undefined,
          sizeBytes: sizeBytes ? Math.round(sizeBytes) : undefined,
          ...normalizeStatusFlags(status),
        },
        staff,
        title.trim()
      );
      if (uploadedPdfMeta) {
        try {
          await registerUploadedMediaAsset(
            uploadedPdfMeta,
            {
              title: title.trim(),
              description: description.trim() || undefined,
              nodeIds: selectedNodeIds.length ? selectedNodeIds : subj.nodeIds,
              subjectId: subj.id,
              lessonId: lesson?.id || undefined,
              published: status === 'PUBLISHED',
            },
            staff
          );
        } catch {
          // Best-effort catalog indexing
        }
      }
      setOpenForm(false);
      setUploadedPdfMeta(null);
      onToast('تم حفظ الملف التعليمي بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  return (
    <div>
      <SectionHeader
        title="إدارة ملفات PDF والنوطات والكتب"
        subtitle="ارفع الكتب والنوطات والملخصات مباشرة إلى Backblaze B2 (أو R2) مع دعم الاستئناف حتى 100 MB، وصنّفها حسب المرحلة والمادة والدرس."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
        action={
          canEdit && (
            <button type="button" onClick={startCreate} disabled={activeSubjects.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              <Plus className="h-4 w-4" />
              إضافة ملف PDF / نوطة
            </button>
          )
        }
      />

      {openForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-2xl border border-sky-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">المادة *</label>
              <select
                required
                value={subjectId}
                onChange={(e) => {
                  const nextSubjId = e.target.value;
                  setSubjectId(nextSubjId);
                  setLessonId('');
                  const subj = activeSubjects.find((s) => s.id === nextSubjId);
                  if (subj?.nodeIds?.length && selectedNodeIds.length === 0) {
                    setSelectedNodeIds(subj.nodeIds);
                  }
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">ربط بدرس محدد (اختياري)</label>
              <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">ملف عام للمادة</option>
                {subjectLessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.unitTitle} — {l.title}</option>
                ))}
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
                <option value="ASSIGNMENT">واجب / تكليف</option>
              </select>
            </div>
            <StatusSelector value={status} onChange={setStatus} />
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان الملف *</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">الوصف</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>

          {activeNodes.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">تصنيف المرحلة / الصف / الفرع</label>
              <div className="flex flex-wrap gap-2">
                {activeNodes.map((n) => {
                  const selected = selectedNodeIds.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() =>
                        setSelectedNodeIds(selected ? selectedNodeIds.filter((x) => x !== n.id) : [...selectedNodeIds, n.id])
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {n.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <AssetUrlOrUploadInput
            label="ملف PDF / المرفق (ارفع مباشرة إلى Backblaze B2 أو الصق رابط HTTPS) *"
            value={fileUrl}
            onChange={(url) => {
              setFileUrl(url);
              if (!url.trim()) {
                setR2ObjectKey('');
                setStorageProvider('b2');
                setSizeBytes(undefined);
                setUploadedPdfMeta(null);
              }
            }}
            onUploadedMeta={(meta) => {
              setR2ObjectKey(meta.objectKey);
              setStorageProvider(meta.storageProvider);
              setSizeBytes(meta.sizeBytes);
              setUploadedPdfMeta(meta);
            }}
            folderPath={`materials/${subjectId || 'general'}`}
            accessLevel="private"
            accept=".pdf,application/pdf,.doc,.docx,.ppt,.pptx,.zip"
            platformConfig={store.platformConfig}
            onToast={onToast}
          />

          <AssetUrlOrUploadInput
            label="صورة الغلاف (اختياري)"
            value={coverUrl}
            onChange={(url) => setCoverUrl(url)}
            folderPath="materials/covers"
            imageOnly
            platformConfig={store.platformConfig}
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
                  {m.lessonTitle && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{m.lessonTitle}</span>
                  )}
                  <span className="font-bold text-[#0F294A]">{m.title}</span>
                  {m.sizeBytes ? (
                    <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                      {formatBytesReadable(m.sizeBytes)}
                    </span>
                  ) : null}
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
                onHardDelete={() =>
                  hardDeleteEntity('materials', m.id, staff, m.title, {
                    r2ObjectKey: m.r2ObjectKey,
                    storageProvider: m.storageProvider,
                    fileUrl: m.fileUrl,
                    platformConfig: store.platformConfig,
                  })
                }
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
  const [previewVideo, setPreviewVideo] = useState<{ title: string; url: string } | null>(null);

  const videoBlocks = store.blocks.filter(
    (b) => !b.deletedAt && (b.blockType === 'YOUTUBE_VIDEO' || b.blockType === 'EXTERNAL_VIDEO')
  );
  const legacyVideos = store.lessons.filter((l) => !l.deletedAt && l.videoUrl);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="إدارة الفيديوهات التعليمية"
        subtitle="استعراض ومعاينة موحدة لفيديوهات Backblaze B2 / Cloudflare R2 (MP4/WebM) وروابط YouTube داخل الشروحات والدروس."
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
        <EmptyBox title="لا توجد فيديوهات بعد" subtitle="ارفع فيديو MP4 من قسم الدروس أو من داخل شروحات الأساتذة." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {videoBlocks.map((vb) => {
            const exp = store.explanations.find((e) => e.id === vb.explanationId);
            const isYt = vb.mediaUrl ? isYouTubeUrl(vb.mediaUrl) : false;
            const thumb = vb.thumbnailUrl || (vb.mediaUrl && isYt ? getYouTubeThumbnailUrl(vb.mediaUrl) : null);
            return (
              <div key={vb.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-start gap-3">
                  {thumb && (
                    <img
                      src={thumb}
                      alt={vb.title}
                      className="h-16 w-28 shrink-0 rounded-xl border border-slate-200 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700">
                        {BLOCK_TYPE_LABELS[vb.blockType]}
                      </span>
                      {vb.sizeBytes ? (
                        <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                          {formatBytesReadable(vb.sizeBytes)}
                        </span>
                      ) : null}
                      <StatusBadge status={vb.status} published={vb.published} />
                    </div>
                    <h4 className="mt-1 font-bold text-[#0F294A]">{vb.title}</h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {exp ? `${exp.teacherName} • ${exp.lessonTitle || ''}` : vb.lessonId}{' '}
                      {vb.durationLabel ? `• ${vb.durationLabel}` : ''}
                    </p>
                  </div>
                </div>
                {vb.mediaUrl && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                    <button
                      type="button"
                      onClick={() => setPreviewVideo({ title: vb.title, url: vb.mediaUrl! })}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#163A66]"
                    >
                      <Play className="h-3.5 w-3.5" />
                      تشغيل الفيديو
                    </button>
                    <a
                      href={isYt ? getYouTubeWatchUrl(vb.mediaUrl) : vb.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {isYt ? 'معاينة على YouTube' : 'فتح الرابط المباشر'}
                    </a>
                  </div>
                )}
              </div>
            );
          })}

          {legacyVideos.map((lv) => {
            const isYt = isYouTubeUrl(lv.videoUrl);
            const thumb = lv.thumbnailUrl || (isYt ? getYouTubeThumbnailUrl(lv.videoUrl) : null);
            return (
              <div key={lv.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="flex items-start gap-3">
                  {thumb && (
                    <img
                      src={thumb}
                      alt={lv.title}
                      className="h-16 w-28 shrink-0 rounded-xl border border-slate-200 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {lv.videoSourceType === 'MP4' ? 'فيديو MP4 / R2' : 'درس أساسي'}
                      </span>
                      {lv.sizeBytes ? (
                        <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                          {formatBytesReadable(lv.sizeBytes)}
                        </span>
                      ) : null}
                      <StatusBadge status={lv.status} published={lv.published} />
                    </div>
                    <h4 className="mt-1 font-bold text-[#0F294A]">{lv.title}</h4>
                    <p className="mt-0.5 text-xs text-slate-500">{lv.subjectName} • {lv.unitTitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setPreviewVideo({ title: lv.title, url: lv.videoUrl })}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#163A66]"
                  >
                    <Play className="h-3.5 w-3.5" />
                    تشغيل الفيديو
                  </button>
                  <a
                    href={isYt ? getYouTubeWatchUrl(lv.videoUrl) : lv.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {isYt ? 'معاينة على YouTube' : 'فتح الرابط المباشر'}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <VideoPreviewModal
        open={Boolean(previewVideo)}
        title={previewVideo?.title || 'مشاهدة الفيديو'}
        url={previewVideo?.url || ''}
        platformConfig={store.platformConfig}
        onClose={() => setPreviewVideo(null)}
      />
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

const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  VIDEO: 'فيديو تعليمي',
  PDF: 'ملف PDF / كتاب',
  IMAGE: 'صورة / غلاف',
  ATTACHMENT: 'مرفق / ملف',
};

export function MediaLibrarySection({
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
  const [folder, setFolder] = useState('videos');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadMeta, setUploadMeta] = useState<R2UploadResult | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [filterKind, setFilterKind] = useState<'ALL' | MediaKind>('ALL');
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [quota, setQuota] = useState<R2QuotaStatus | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<{ title: string; url: string } | null>(null);

  const workerUrl = resolveActiveR2WorkerUrl(store.platformConfig);
  const limits = resolveR2StorageLimits(store.platformConfig);
  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);
  const activeNodes = store.nodes.filter((n) => !n.deletedAt);
  const unitsForSubject = store.units.filter((u) => !u.deletedAt && u.subjectId === selectedSubjectId);
  const lessonsForSubject = store.lessons.filter((l) => !l.deletedAt && l.subjectId === selectedSubjectId);

  const refreshQuota = useCallback(async () => {
    if (!workerUrl) {
      setQuota(null);
      setQuotaError(null);
      return;
    }
    setLoadingQuota(true);
    setQuotaError(null);
    try {
      const q = await fetchR2QuotaStatus(store.platformConfig);
      setQuota(q);
    } catch (err) {
      setQuota(null);
      const msg = err instanceof Error ? err.message : 'تعذر التحقق الفعلي من حساب Cloudflare R2';
      setQuotaError(msg);
      onToast(msg, true);
    } finally {
      setLoadingQuota(false);
    }
  }, [workerUrl, store.platformConfig, onToast]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  const activeAssets = useMemo(() => {
    return store.mediaAssets
      .filter((a) => !a.deletedAt)
      .filter((a) => (filterKind === 'ALL' ? true : a.mediaKind === filterKind))
      .filter((a) => (!filterSubjectId ? true : a.subjectId === filterSubjectId));
  }, [store.mediaAssets, filterKind, filterSubjectId]);

  const indexedCatalogBytes = useMemo(
    () => store.mediaAssets.filter((a) => !a.deletedAt).reduce((sum, a) => sum + (a.sizeBytes || 0), 0),
    [store.mediaAssets]
  );

  const storageSummary = useMemo(
    () => buildMultiProviderStorageSummary({ limits, r2Quota: quota }),
    [limits, quota]
  );

  async function handleRegisterManualOrUploaded(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadMeta || !uploadUrl.trim()) {
      onToast('يرجى رفع ملف إلى التخزين السحابي أولاً قبل التسجيل في المكتبة.', true);
      return;
    }
    try {
      await registerUploadedMediaAsset(
        uploadMeta,
        {
          title: uploadTitle.trim() || uploadMeta.fileName,
          description: uploadDesc.trim() || undefined,
          nodeIds: selectedNodeIds,
          subjectId: selectedSubjectId || undefined,
          unitId: selectedUnitId || undefined,
          lessonId: selectedLessonId || undefined,
          published: true,
        },
        staff
      );
      setUploadTitle('');
      setUploadDesc('');
      setUploadUrl('');
      setUploadMeta(null);
      void refreshQuota();
      onToast(
        `تم حفظ الملف وتصنيفه في مكتبة ${uploadMeta.storageProvider === 'b2' ? 'Backblaze B2' : 'Cloudflare R2'}`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل تسجيل الملف في المكتبة', true);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="مكتبة الوسائط ومراقبة السعة التخزينية"
        subtitle={`المساحة المفعّلة حالياً: ${formatBytesReadable(storageSummary.verifiedActiveTotalBytes)} (${storageSummary.b2.enabled ? `Backblaze B2 الأساسي: ${limits.b2StorageLimitGb} GB` : 'Backblaze B2 غير مفعّل بعد'}${storageSummary.r2.verified ? ` + Cloudflare R2: ${limits.r2StorageLimitGb} GB` : ''}) • حد الملف: فيديو ${limits.maxVideoSizeMb} MB • PDF ${limits.maxPdfSizeMb} MB • صور ${limits.maxImageSizeMb} MB.`}
      />

      {/* Aggregate + Per-Provider Multi-Storage Monitor (Strict Verification-Gated) */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#0F294A]">ملخص التخزين الإجمالي لكل المزودين</h3>
                <p className="text-xs text-slate-500">
                  السعة المفعّلة فعلياً تعتمد فقط على الحسابات المربوطة والمُتحقَّق منها — لا تُحسب أي حصة قبل التحقق الفعلي.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void refreshQuota()}
              disabled={!workerUrl || loadingQuota}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#0F294A] hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingQuota ? 'animate-spin' : ''}`} />
              التحقق الفعلي وتحديث السعة
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">السعة المستهدفة الكلية</p>
              <p className="mt-1 text-base font-extrabold text-[#0F294A]">
                {formatBytesReadable(storageSummary.targetTotalBytes)}
              </p>
            </div>
            <div className="rounded-xl bg-sky-50/70 p-3">
              <p className="text-sky-800">المفعّل والمتحقَّق فعلياً</p>
              <p className="mt-1 text-base font-extrabold text-sky-900">
                {formatBytesReadable(storageSummary.verifiedActiveTotalBytes)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">إجمالي الاستهلاك الفعلي</p>
              <p className="mt-1 text-base font-extrabold text-[#0F294A]">
                {formatBytesReadable(storageSummary.totalUsedBytes)} ({storageSummary.usedPercentOfTarget}%)
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 p-3">
              <p className="text-emerald-800">المتبقي الفعلي المتاح الآن</p>
              <p className="mt-1 text-base font-extrabold text-emerald-700">
                {formatBytesReadable(storageSummary.remainingActiveBytes)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">المتبقي من الهدف (20 GB)</p>
              <p className="mt-1 text-base font-extrabold text-slate-700">
                {formatBytesReadable(storageSummary.remainingTargetBytes)}
              </p>
            </div>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#167D83] transition-all"
              style={{ width: `${storageSummary.totalUsedBytes > 0 ? Math.max(2, storageSummary.usedPercentOfTarget) : 0}%` }}
            />
          </div>

          {quotaError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>تعذر التحقق من حساب التخزين (Worker): {quotaError}</span>
            </div>
          )}
        </div>

        {/* Separate Provider Breakdown Cards (Backblaze B2 Primary first, Cloudflare R2 Secondary) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Backblaze B2 Card (Primary Storage) */}
          <div className="rounded-2xl border border-sky-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-[#0F294A]">Backblaze B2 (المزوّد الأساسي)</h4>
                <p className="text-[11px] text-slate-500">
                  المخصص: {formatBytesReadable(storageSummary.b2.allocatedBytes)} • الملفات: {storageSummary.b2.fileCount}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  storageSummary.b2.enabled
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {storageSummary.b2.enabled ? 'متحقق منه ومفعّل' : 'بانتظار التفعيل / الأسرار'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-slate-500">المفعّل فعلياً</p>
                <p className="mt-0.5 font-extrabold text-[#0F294A]">{formatBytesReadable(storageSummary.b2.activeBytes)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-slate-500">المستهلك</p>
                <p className="mt-0.5 font-extrabold text-[#0F294A]">
                  {formatBytesReadable(storageSummary.b2.usedBytes)} ({storageSummary.b2.usedPercentOfAllocated}%)
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-slate-500">المتبقي الفعلي</p>
                <p className="mt-0.5 font-extrabold text-emerald-700">
                  {formatBytesReadable(storageSummary.b2.remainingActiveBytes)}
                </p>
              </div>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${storageSummary.b2.nearLimit ? 'bg-amber-500' : 'bg-teal-600'}`}
                style={{
                  width: `${
                    storageSummary.b2.usedBytes > 0
                      ? Math.max(2, storageSummary.b2.usedPercentOfAllocated)
                      : 0
                  }%`,
                }}
              />
            </div>

            <p className="text-[11px] text-slate-600">{storageSummary.b2.statusMessage}</p>
            {storageSummary.b2.nearLimit && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>تنبيه: اقتربت حصة Backblaze B2 من حدها المخصص ({storageSummary.b2.usedPercentOfAllocated}%).</span>
              </div>
            )}
          </div>

          {/* Cloudflare R2 Card (Secondary / Legacy Fallback) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-[#0F294A]">Cloudflare R2 (ثانوي / أرشيف)</h4>
                <p className="text-[11px] text-slate-500">
                  المخصص: {formatBytesReadable(storageSummary.r2.allocatedBytes)} • الملفات: {storageSummary.r2.fileCount}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  storageSummary.r2.verified
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {storageSummary.r2.verified ? 'متحقق منه ومفعّل' : 'غير مربوط / ثانوي'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-slate-500">المفعّل</p>
                <p className="mt-0.5 font-extrabold text-[#0F294A]">{formatBytesReadable(storageSummary.r2.activeBytes)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-slate-500">المستهلك</p>
                <p className="mt-0.5 font-extrabold text-[#0F294A]">
                  {formatBytesReadable(storageSummary.r2.usedBytes)} ({storageSummary.r2.usedPercentOfAllocated}%)
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-slate-500">المتبقي الفعلي</p>
                <p className="mt-0.5 font-extrabold text-emerald-700">
                  {formatBytesReadable(storageSummary.r2.remainingActiveBytes)}
                </p>
              </div>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${storageSummary.r2.nearLimit ? 'bg-amber-500' : 'bg-sky-600'}`}
                style={{
                  width: `${
                    storageSummary.r2.usedBytes > 0
                      ? Math.max(2, storageSummary.r2.usedPercentOfAllocated)
                      : 0
                  }%`,
                }}
              />
            </div>

            <p className="text-[11px] text-slate-600">{storageSummary.r2.statusMessage}</p>
            {!storageSummary.r2.verified && indexedCatalogBytes > 0 && (
              <p className="text-[11px] text-slate-500">
                إجمالي أحجام الملفات المسجلة في فهرس المكتبة: {formatBytesReadable(indexedCatalogBytes)}
              </p>
            )}
            {storageSummary.r2.nearLimit && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>تنبيه: اقتربت حصة Cloudflare R2 من حدها المخصص ({storageSummary.r2.usedPercentOfAllocated}%).</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload & Classification Form */}
      {canEdit && (
        <form onSubmit={handleRegisterManualOrUploaded} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-extrabold text-[#0F294A]">رفع وتصنيف ملف جديد على Backblaze B2 (أو Cloudflare R2)</h3>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">مجلد التخزين</label>
              <select value={folder} onChange={(e) => setFolder(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="videos">الفيديوهات التعليمية (videos/)</option>
                <option value="materials">الكتب والنوطات PDF (materials/)</option>
                <option value="branding">الهوية والشعارات (branding/)</option>
                <option value="catalog">صور المراحل والفروع (catalog/)</option>
                <option value="subjects/covers">أغلفة المواد (subjects/covers/)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">المادة</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setSelectedUnitId('');
                  setSelectedLessonId('');
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">عام / بدون مادة</option>
                {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">الدرس المرتبط</label>
              <select value={selectedLessonId} onChange={(e) => setSelectedLessonId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">بدون تحديد درس</option>
                {lessonsForSubject.map((l) => <option key={l.id} value={l.id}>{l.unitTitle} — {l.title}</option>)}
              </select>
            </div>
            {unitsForSubject.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">الوحدة</label>
                <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="">بدون تحديد وحدة</option>
                  {unitsForSubject.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">عنوان وصفي للملف</label>
              <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="يُملأ تلقائياً باسم الملف إذا تُرك فارغاً" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">ملاحظات (اختياري)</label>
              <input value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>

          {activeNodes.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">المرحلة / الصف الدراسي</label>
              <div className="flex flex-wrap gap-2">
                {activeNodes.map((n) => {
                  const selected = selectedNodeIds.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() =>
                        setSelectedNodeIds(selected ? selectedNodeIds.filter((x) => x !== n.id) : [...selectedNodeIds, n.id])
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {n.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <AssetUrlOrUploadInput
            label={`اختيار ورفع ملف إلى ${folder}/`}
            value={uploadUrl}
            onChange={(u) => setUploadUrl(u)}
            onUploadedMeta={(meta) => {
              setUploadMeta(meta);
              if (!uploadTitle.trim()) setUploadTitle(meta.fileName);
            }}
            folderPath={folder}
            accessLevel={folder === 'branding' ? 'public' : 'private'}
            platformConfig={store.platformConfig}
            quotaStatus={quota}
            onToast={onToast}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!uploadMeta}
              className="rounded-xl bg-[#0F294A] px-5 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              حفظ وتصنيف الملف في المكتبة
            </button>
          </div>
        </form>
      )}

      {/* Filter & Registered Media Table */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as 'ALL' | MediaKind)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">
            <option value="ALL">جميع الأنواع ({store.mediaAssets.filter((a) => !a.deletedAt).length})</option>
            <option value="VIDEO">فيديو</option>
            <option value="PDF">PDF</option>
            <option value="IMAGE">صور</option>
            <option value="ATTACHMENT">مرفقات</option>
          </select>
          <select value={filterSubjectId} onChange={(e) => setFilterSubjectId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">
            <option value="">كل المواد</option>
            {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        {activeAssets.length === 0 ? (
          <EmptyBox title="لا توجد ملفات مسجلة في مكتبة الوسائط" subtitle="ارفع ملف فيديو MP4 أو PDF أو صورة إلى Backblaze B2 من النموذج أعلاه أو من شاشات الدروس والمواد." />
        ) : (
          <div className="space-y-2.5">
            {activeAssets.map((asset: MediaAsset) => {
              const subj = store.subjects.find((s) => s.id === asset.subjectId);
              const lesson = store.lessons.find((l) => l.id === asset.lessonId);
              const assetProvider = inferStorageProviderFromUrl(asset.fileUrl, asset.storageProvider);
              return (
                <div key={asset.id} className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-800">
                        {MEDIA_KIND_LABELS[asset.mediaKind]}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          assetProvider === 'b2'
                            ? 'bg-indigo-50 text-indigo-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {assetProvider === 'b2' ? 'Backblaze B2' : 'Cloudflare R2'}
                      </span>
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                        {formatBytesReadable(asset.sizeBytes)}
                      </span>
                      <span className="font-bold text-[#0F294A]">{asset.title}</span>
                      <StatusBadge status={asset.status} published={asset.published} deletedAt={asset.deletedAt} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {subj ? subj.title : 'عام'}
                      {lesson ? ` • ${lesson.title}` : ''}
                      {' • '}
                      <span dir="ltr" className="font-mono text-[11px]">{asset.objectKey}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {asset.mediaKind === 'VIDEO' && (
                      <button
                        type="button"
                        onClick={() => setPreviewVideo({ title: asset.title, url: asset.fileUrl })}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
                      >
                        <Play className="h-3.5 w-3.5" />
                        معاينة
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(asset.fileUrl);
                        onToast('تم نسخ رابط الملف');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-slate-200"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      نسخ الرابط
                    </button>
                    <RowActionButtons
                      published={asset.published}
                      deletedAt={asset.deletedAt}
                      canEdit={canEdit}
                      canHardDelete={canHardDelete}
                      onTogglePublish={() =>
                        updateEntityStatus('mediaAssets', asset.id, asset.published ? 'DRAFT' : 'PUBLISHED', staff, asset.title)
                      }
                      onHardDelete={async () => {
                        await hardDeleteEntity('mediaAssets', asset.id, staff, asset.title, {
                          r2ObjectKey: asset.objectKey,
                          storageProvider: asset.storageProvider,
                          fileUrl: asset.fileUrl,
                          platformConfig: store.platformConfig,
                        });
                        void refreshQuota();
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <VideoPreviewModal
        open={Boolean(previewVideo)}
        title={previewVideo?.title || 'معاينة الفيديو'}
        url={previewVideo?.url || ''}
        platformConfig={store.platformConfig}
        onClose={() => setPreviewVideo(null)}
      />
    </div>
  );
}
