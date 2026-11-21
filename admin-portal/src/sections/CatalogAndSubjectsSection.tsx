import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react';
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
  CatalogNode,
  CatalogNodeType,
  PublishStatus,
  StaffSession,
  Subject,
  UnitItem,
} from '../types';

export function CatalogNodesSection({
  mode,
  store,
  staff,
  canEdit,
  canHardDelete,
  onToast,
}: {
  mode: 'stages' | 'branches';
  store: CmsStore;
  staff: StaffSession;
  canEdit: boolean;
  canHardDelete: boolean;
  onToast: (msg: string, isError?: boolean) => void;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<CatalogNode | null>(null);
  const [openForm, setOpenForm] = useState(false);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [nodeType, setNodeType] = useState<CatalogNodeType>(mode === 'branches' ? 'BRANCH' : 'STAGE');
  const [typeLabel, setTypeLabel] = useState(mode === 'branches' ? 'فرع' : 'مرحلة');
  const [parentId, setParentId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sortOrder, setSortOrder] = useState(1);
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');
  const [dragId, setDragId] = useState<string | null>(null);

  const items = useMemo(() => {
    return store.nodes
      .filter((n) => (mode === 'branches' ? n.nodeType === 'BRANCH' : n.nodeType !== 'BRANCH'))
      .filter((n) => (showDeleted ? true : !n.deletedAt))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [store.nodes, mode, showDeleted]);

  const parentCandidates = store.nodes.filter((n) => !n.deletedAt);

  function startCreate() {
    setEditing(null);
    setTitle('');
    setSubtitle('');
    setNodeType(mode === 'branches' ? 'BRANCH' : 'STAGE');
    setTypeLabel(mode === 'branches' ? 'فرع' : 'مرحلة');
    setParentId('');
    setImageUrl('');
    setSortOrder(items.length + 1);
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(node: CatalogNode) {
    setEditing(node);
    setTitle(node.title);
    setSubtitle(node.subtitle || '');
    setNodeType(node.nodeType);
    setTypeLabel(node.typeLabel);
    setParentId(node.parentId || '');
    setImageUrl(node.imageUrl || '');
    setSortOrder(node.sortOrder);
    setStatus(node.status || (node.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const flags = normalizeStatusFlags(status);
      await upsertEntity(
        'catalogNodes',
        editing?.id,
        {
          parentId: parentId || undefined,
          nodeType,
          typeLabel: typeLabel.trim() || 'قسم',
          title: title.trim(),
          subtitle: subtitle.trim(),
          imageUrl: imageUrl.trim() || undefined,
          iconKey: nodeType.toLowerCase(),
          sortOrder: Number(sortOrder) || 1,
          ...flags,
        },
        staff,
        title.trim()
      );
      setOpenForm(false);
      onToast('تم حفظ العنصر بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  async function moveOrder(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await commitSortOrderBatch('catalogNodes', reordered.map((x) => x.id));
    onToast('تم تحديث الترتيب');
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const oldIdx = items.findIndex((i) => i.id === dragId);
    const newIdx = items.findIndex((i) => i.id === targetId);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = [...items];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    setDragId(null);
    await commitSortOrderBatch('catalogNodes', reordered.map((x) => x.id));
    onToast('تم إعادة ترتيب العناصر بالسحب والإفلات');
  }

  return (
    <div>
      <SectionHeader
        title={mode === 'branches' ? 'إدارة الفروع والتخصصات' : 'إدارة المراحل والصفوف والدورات'}
        subtitle="هيكلة هرمية مرنة غير ثابتة — أضف، أعد الترتيب بالسحب، اربط بأي مستوى أعلى، أو أخفِ عن الطلاب."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
        action={
          canEdit && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white hover:bg-[#153B6B]"
            >
              <Plus className="h-4 w-4" />
              {mode === 'branches' ? 'إضافة فرع جديد' : 'إضافة مرحلة / صف'}
            </button>
          )
        }
      />

      {openForm && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-[#0F294A]">{editing ? `تعديل: ${editing.title}` : 'إضافة مستوى دراسي جديد'}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">الاسم الظاهر للطالب *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: الثالث الثانوي / الفرع العلمي / دورة التأسيس"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">نوع المستوى</label>
              <select
                value={nodeType}
                onChange={(e) => {
                  const next = e.target.value as CatalogNodeType;
                  setNodeType(next);
                  const defaults: Record<CatalogNodeType, string> = {
                    STAGE: 'مرحلة',
                    GRADE: 'صف',
                    BRANCH: 'فرع',
                    COURSE: 'دورة',
                    CUSTOM: 'تصنيف مخصص',
                  };
                  setTypeLabel(defaults[next]);
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="STAGE">مرحلة دراسية (STAGE)</option>
                <option value="GRADE">صف دراسي (GRADE)</option>
                <option value="BRANCH">فرع / تخصص (BRANCH)</option>
                <option value="COURSE">دورة عامة / معسكر (COURSE)</option>
                <option value="CUSTOM">مستوى مخصص (CUSTOM)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">التسمية المعروضة للنوع</label>
              <input
                value={typeLabel}
                onChange={(e) => setTypeLabel(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">ينتمي إلى (المستوى الأب - اختياري)</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">مستوى رئيسي (في الصفحة الأولى)</option>
                {parentCandidates
                  .filter((p) => p.id !== editing?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.typeLabel}] {p.title}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">وصف مختصر</label>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">الترتيب</label>
                <input
                  type="number"
                  min={1}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <StatusSelector value={status} onChange={setStatus} />
            </div>
          </div>

          <AssetUrlOrUploadInput
            label="صورة البطاقة (تظهر داخل تطبيق Android)"
            value={imageUrl}
            onChange={(url) => setImageUrl(url)}
            folderPath="catalog"
            imageOnly
            platformConfig={store.platformConfig}
            onToast={onToast}
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenForm(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              إلغاء
            </button>
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700">
              حفظ
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyBox
          title="لا توجد عناصر بعد"
          subtitle="أنشئ المراحل والصفوف والفروع حسب خطتك الدراسية دون أي قيود ثابتة."
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((item, idx) => {
            const parent = store.nodes.find((p) => p.id === item.parentId);
            return (
              <div
                key={item.id}
                draggable={canEdit && !item.deletedAt}
                onDragStart={() => setDragId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(item.id)}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3">
                  {canEdit && (
                    <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-slate-400" />
                  )}
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.title} className="h-12 w-12 rounded-xl object-cover" />
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                        {item.typeLabel}
                      </span>
                      <span className="font-bold text-[#0F294A]">
                        {item.sortOrder}. {item.title}
                      </span>
                      <StatusBadge status={item.status} published={item.published} deletedAt={item.deletedAt} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {parent ? `يتبع لـ: ${parent.title}` : 'مستوى رئيسي'} {item.subtitle ? `• ${item.subtitle}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && !item.deletedAt && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveOrder(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOrder(idx, 1)}
                        disabled={idx === items.length - 1}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <RowActionButtons
                    published={item.published}
                    deletedAt={item.deletedAt}
                    canEdit={canEdit}
                    canHardDelete={canHardDelete}
                    onTogglePublish={() =>
                      updateEntityStatus('catalogNodes', item.id, item.published ? 'DRAFT' : 'PUBLISHED', staff, item.title)
                    }
                    onEdit={() => startEdit(item)}
                    onSoftDelete={() => softDeleteEntity('catalogNodes', item.id, staff, item.title)}
                    onRestore={() => restoreEntity('catalogNodes', item.id, staff, item.title)}
                    onHardDelete={() => hardDeleteEntity('catalogNodes', item.id, staff, item.title)}
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

export function SubjectsSection({
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
  const [editing, setEditing] = useState<Subject | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [iconKey, setIconKey] = useState('math');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState(1);
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');

  const subjects = useMemo(
    () =>
      store.subjects
        .filter((s) => (showDeleted ? true : !s.deletedAt))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [store.subjects, showDeleted]
  );

  const activeNodes = store.nodes.filter((n) => !n.deletedAt);
  const activeTeachers = store.teachers.filter((t) => !t.deletedAt);

  function startCreate() {
    setEditing(null);
    setTitle('');
    setDescription('');
    setIconKey('general');
    setImageUrl('');
    setSelectedNodeIds([]);
    setSelectedTeacherIds([]);
    setSortOrder(subjects.length + 1);
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(s: Subject) {
    setEditing(s);
    setTitle(s.title);
    setDescription(s.description);
    setIconKey(s.iconKey || 'general');
    setImageUrl(s.imageUrl || '');
    setSelectedNodeIds(s.nodeIds || []);
    setSelectedTeacherIds(s.teacherIds || []);
    setSortOrder(s.sortOrder);
    setStatus(s.status || (s.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenForm(true);
  }

  function toggleInList(id: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const nodeLabels = activeNodes
      .filter((n) => selectedNodeIds.includes(n.id))
      .map((n) => n.title)
      .join(' • ');
    try {
      await upsertEntity(
        'subjects',
        editing?.id,
        {
          title: title.trim(),
          description: description.trim(),
          imageUrl: imageUrl.trim() || undefined,
          iconKey,
          nodeIds: selectedNodeIds,
          nodePathLabel: nodeLabels,
          teacherIds: selectedTeacherIds,
          sortOrder: Number(sortOrder) || 1,
          ...normalizeStatusFlags(status),
        },
        staff,
        title.trim()
      );
      setOpenForm(false);
      onToast('تم حفظ المادة بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  async function moveSubjectOrder(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= subjects.length) return;
    const reordered = [...subjects];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await commitSortOrderBatch('subjects', reordered.map((x) => x.id));
    onToast('تم تحديث ترتيب المواد');
  }

  return (
    <div>
      <SectionHeader
        title="إدارة المواد الدراسية"
        subtitle="اربط كل مادة بأي مرحلة أو صف أو فرع أو عدة أساتذة مع تحكم كامل بالنشر والترتيب."
        showDeleted={showDeleted}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
        action={
          canEdit && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F294A] px-4 py-2 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              إضافة مادة جديدة
            </button>
          )
        }
      />

      {openForm && (
        <form onSubmit={handleSave} className="mb-6 space-y-4 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-[#0F294A]">{editing ? `تعديل مادة: ${editing.title}` : 'مادة دراسية جديدة'}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">اسم المادة *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">تصنيف الأيقونة</label>
              <select value={iconKey} onChange={(e) => setIconKey(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="math">الرياضيات</option>
                <option value="analysis">التحليل</option>
                <option value="arabic">اللغة العربية</option>
                <option value="religion">التربية الدينية</option>
                <option value="english">اللغة الإنجليزية</option>
                <option value="physics">الفيزياء</option>
                <option value="science">العلوم</option>
                <option value="chemistry">الكيمياء</option>
                <option value="general">مادة عامة</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">الوصف</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">ترتيب العرض</label>
              <input
                type="number"
                min={1}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <StatusSelector value={status} onChange={setStatus} />
          </div>

          <AssetUrlOrUploadInput
            label="صورة غلاف المادة"
            value={imageUrl}
            onChange={(url) => setImageUrl(url)}
            folderPath="subjects/covers"
            imageOnly
            platformConfig={store.platformConfig}
            onToast={onToast}
          />

          {activeNodes.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">ربط بالمراحل / الصفوف / الفروع</label>
              <div className="flex flex-wrap gap-2">
                {activeNodes.map((n) => {
                  const selected = selectedNodeIds.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => toggleInList(n.id, selectedNodeIds, setSelectedNodeIds)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {n.typeLabel}: {n.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTeachers.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">أساتذة المادة</label>
              <div className="flex flex-wrap gap-2">
                {activeTeachers.map((t) => {
                  const selected = selectedTeacherIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleInList(t.id, selectedTeacherIds, setSelectedTeacherIds)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold">
              إلغاء
            </button>
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white">
              حفظ المادة
            </button>
          </div>
        </form>
      )}

      {subjects.length === 0 ? (
        <EmptyBox title="لا توجد مواد دراسية" subtitle="أضف أول مادة وربطها بالمستوى الدراسي." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {subjects.map((subj, idx) => (
            <div key={subj.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start gap-3">
                {subj.imageUrl && (
                  <img src={subj.imageUrl} alt={subj.title} className="h-14 w-14 rounded-xl object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-[#0F294A]">{subj.sortOrder}. {subj.title}</h4>
                    <StatusBadge status={subj.status} published={subj.published} deletedAt={subj.deletedAt} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{subj.description}</p>
                  {subj.nodePathLabel && (
                    <p className="mt-1 text-[11px] font-semibold text-sky-700">{subj.nodePathLabel}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                <span>
                  {store.lessons.filter((l) => l.subjectId === subj.id && !l.deletedAt).length} درس •{' '}
                  {store.units.filter((u) => u.subjectId === subj.id && !u.deletedAt).length} وحدة
                </span>
                <div className="flex items-center gap-2">
                  {canEdit && !subj.deletedAt && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => void moveSubjectOrder(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                        title="تحريك للأعلى"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveSubjectOrder(idx, 1)}
                        disabled={idx === subjects.length - 1}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                        title="تحريك للأسفل"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <RowActionButtons
                    published={subj.published}
                    deletedAt={subj.deletedAt}
                    canEdit={canEdit}
                    canHardDelete={canHardDelete}
                    onTogglePublish={() =>
                      updateEntityStatus('subjects', subj.id, subj.published ? 'DRAFT' : 'PUBLISHED', staff, subj.title)
                    }
                    onEdit={() => startEdit(subj)}
                    onSoftDelete={() => softDeleteEntity('subjects', subj.id, staff, subj.title)}
                    onRestore={() => restoreEntity('subjects', subj.id, staff, subj.title)}
                    onHardDelete={() => hardDeleteEntity('subjects', subj.id, staff, subj.title)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UnitsSection({
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
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<UnitItem | null>(null);

  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(1);
  const [status, setStatus] = useState<PublishStatus>('PUBLISHED');

  const activeSubjects = store.subjects.filter((s) => !s.deletedAt);
  const units = store.units
    .filter((u) => (showDeleted ? true : !u.deletedAt))
    .filter((u) => (!filterSubjectId ? true : u.subjectId === filterSubjectId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function startCreate() {
    setEditing(null);
    setSubjectId(filterSubjectId || activeSubjects[0]?.id || '');
    setTitle('');
    setDescription('');
    setSortOrder(units.length + 1);
    setStatus('PUBLISHED');
    setOpenForm(true);
  }

  function startEdit(u: UnitItem) {
    setEditing(u);
    setSubjectId(u.subjectId);
    setTitle(u.title);
    setDescription(u.description || '');
    setSortOrder(u.sortOrder);
    setStatus(u.status || (u.published ? 'PUBLISHED' : 'DRAFT'));
    setOpenForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const subj = activeSubjects.find((s) => s.id === subjectId);
    if (!subj || !title.trim()) return;
    try {
      await upsertEntity(
        'units',
        editing?.id,
        {
          subjectId: subj.id,
          subjectName: subj.title,
          title: title.trim(),
          description: description.trim(),
          sortOrder: Number(sortOrder) || 1,
          ...normalizeStatusFlags(status),
        },
        staff,
        title.trim()
      );
      setOpenForm(false);
      onToast('تم حفظ الوحدة بنجاح');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'فشل الحفظ', true);
    }
  }

  async function moveUnitOrder(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= units.length) return;
    const reordered = [...units];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await commitSortOrderBatch('units', reordered.map((x) => x.id));
    onToast('تم تحديث ترتيب الوحدات');
  }

  return (
    <div>
      <SectionHeader
        title="إدارة الوحدات والفصول"
        subtitle="تنظيم وحدات كل مادة وترتيبها بوضوح لربط الدروس بها."
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
              إضافة وحدة
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
              <label className="mb-1 block text-xs font-semibold text-slate-600">اسم الوحدة *</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">وصف مختصر</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">الترتيب</label>
                <input type="number" min={1} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <StatusSelector value={status} onChange={setStatus} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs">إلغاء</button>
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white">حفظ</button>
          </div>
        </form>
      )}

      {units.length === 0 ? (
        <EmptyBox title="لا توجد وحدات" subtitle="أضف وحدة جديدة لترتيب الدروس داخل المادة." />
      ) : (
        <div className="space-y-2.5">
          {units.map((u, idx) => (
            <div key={u.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{u.subjectName}</span>
                  <span className="font-bold text-[#0F294A]">{u.sortOrder}. {u.title}</span>
                  <StatusBadge status={u.status} published={u.published} deletedAt={u.deletedAt} />
                </div>
                {u.description && <p className="mt-1 text-xs text-slate-500">{u.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                {canEdit && !u.deletedAt && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void moveUnitOrder(idx, -1)}
                      disabled={idx === 0}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      title="تحريك للأعلى"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveUnitOrder(idx, 1)}
                      disabled={idx === units.length - 1}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                      title="تحريك للأسفل"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <RowActionButtons
                  published={u.published}
                  deletedAt={u.deletedAt}
                  canEdit={canEdit}
                  canHardDelete={canHardDelete}
                  onTogglePublish={() => updateEntityStatus('units', u.id, u.published ? 'DRAFT' : 'PUBLISHED', staff, u.title)}
                  onEdit={() => startEdit(u)}
                  onSoftDelete={() => softDeleteEntity('units', u.id, staff, u.title)}
                  onRestore={() => restoreEntity('units', u.id, staff, u.title)}
                  onHardDelete={() => hardDeleteEntity('units', u.id, staff, u.title)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
