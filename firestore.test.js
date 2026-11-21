const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ADMIN_UID = "admin_karim";
const ADMIN_EMAIL = "karimaeti07@gmail.com";
const CONTENT_MGR_UID = "content_mgr_1";
const TEACHER_A_UID = "teacher_qusai_uid";
const TEACHER_B_UID = "teacher_other_uid";
const VIEWER_UID = "viewer_1";
const STUDENT_ALICE = "student_alice";
const STUDENT_BOB = "student_bob";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

function adminContext() {
  return testEnv.authenticatedContext(ADMIN_UID, {
    email: ADMIN_EMAIL,
    email_verified: true,
  });
}

function spoofedAdminContext() {
  return testEnv.authenticatedContext("spoofed_uid", {
    email: ADMIN_EMAIL,
    email_verified: false,
  });
}

function staffContext(uid, abkRole, email = `${uid}@abk.edu`) {
  return testEnv.authenticatedContext(uid, {
    email,
    email_verified: true,
    abkRole,
  });
}

test("Unauthenticated user cannot read or write any collection", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("subjects").where("published", "==", true).get());
  await assertFails(unauthDb.collection("catalogNodes").where("published", "==", true).get());
  await assertFails(unauthDb.collection("teachers").where("published", "==", true).get());
  await assertFails(unauthDb.collection("lessons").where("published", "==", true).get());
  await assertFails(unauthDb.collection("lessonExplanations").where("published", "==", true).get());
  await assertFails(unauthDb.collection("contentBlocks").where("published", "==", true).get());
  await assertFails(unauthDb.collection("materials").where("published", "==", true).get());
  await assertFails(unauthDb.collection("announcements").where("published", "==", true).get());
  await assertFails(unauthDb.collection("platformConfig").doc("main").get());
  await assertFails(unauthDb.collection("appConfig").doc("android_release").get());
  await assertFails(unauthDb.collection("users").doc(STUDENT_ALICE).get());
});

test("Email spoofing with email_verified=false is rejected for admin operations", async () => {
  const spoofDb = spoofedAdminContext().firestore();
  const now = new Date(Date.now() - 1000);
  await assertFails(
    spoofDb.collection("subjects").doc("math").set({
      title: "الرياضيات",
      description: "مادة الرياضيات",
      iconKey: "math",
      sortOrder: 1,
      published: true,
      createdBy: "spoofed_uid",
      createdAt: now,
      updatedAt: now,
    })
  );
});

test("Student cannot self-assign ADMIN role, escalate privileges, or read another user's profile", async () => {
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE, { email: "alice@example.com", email_verified: true }).firestore();
  const bobDb = testEnv.authenticatedContext(STUDENT_BOB, { email: "bob@example.com", email_verified: true }).firestore();
  const now = new Date(Date.now() - 1000);

  await assertFails(
    aliceDb.collection("users").doc(STUDENT_ALICE).set({
      userId: STUDENT_ALICE,
      displayName: "Alice",
      email: "alice@example.com",
      role: "ADMIN",
      accountStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertFails(
    aliceDb.collection("admins").doc(STUDENT_ALICE).set({
      uid: STUDENT_ALICE,
      email: "alice@example.com",
      grantedBy: STUDENT_ALICE,
      createdAt: now,
    })
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).set({
      userId: STUDENT_ALICE,
      displayName: "Alice",
      email: "alice@example.com",
      role: "STUDENT",
      accountStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).update({
      displayName: "Alice Updated",
      updatedAt: new Date(Date.now() - 500),
    })
  );

  await assertFails(
    aliceDb.collection("users").doc(STUDENT_ALICE).update({
      role: "ADMIN",
      updatedAt: new Date(Date.now() - 500),
    })
  );

  await assertFails(bobDb.collection("users").doc(STUDENT_ALICE).get());
  await assertFails(bobDb.collection("users").get());
});

test("Admin can create/update/delete subjects, lessons, materials, announcements, and suspend students", async () => {
  const admDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE).firestore();
  const now = new Date(Date.now() - 2000);

  await assertSucceeds(
    admDb.collection("subjects").doc("subj_math").set({
      title: "الرياضيات",
      description: "الجبر والهندسة والتكامل",
      iconKey: "math",
      sortOrder: 1,
      published: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    admDb.collection("subjects").doc("subj_draft").set({
      title: "مسودة",
      description: "مادة مخفية",
      iconKey: "general",
      sortOrder: 9,
      published: false,
      status: "DRAFT",
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(aliceDb.collection("subjects").where("published", "==", true).get());
  await assertFails(aliceDb.collection("subjects").doc("subj_draft").get());
  await assertFails(aliceDb.collection("subjects").get());

  await assertFails(
    aliceDb.collection("subjects").doc("subj_hack").set({
      title: "Hack",
      description: "Hack",
      iconKey: "math",
      sortOrder: 1,
      published: true,
      createdBy: STUDENT_ALICE,
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertFails(aliceDb.collection("subjects").doc("subj_math").delete());

  await assertSucceeds(
    admDb.collection("lessons").doc("lesson_1").set({
      subjectId: "subj_math",
      subjectName: "الرياضيات",
      unitTitle: "الوحدة الأولى: الأعداد",
      unitOrder: 1,
      lessonOrder: 1,
      title: "مقدمة في الأعداد الحقيقية",
      description: "شرح مفصل لمجموعات الأعداد",
      teacherName: "أ. كريم",
      durationLabel: "15:20",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      videoSourceType: "YOUTUBE",
      published: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertFails(
    admDb.collection("lessons").doc("lesson_orphan").set({
      subjectId: "does_not_exist",
      subjectName: "وهمي",
      unitTitle: "الوحدة الأولى",
      unitOrder: 1,
      lessonOrder: 1,
      title: "درس يتيم",
      description: "وصف",
      videoUrl: "https://example.com/v.mp4",
      videoSourceType: "MP4",
      published: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    admDb.collection("materials").doc("mat_1").set({
      subjectId: "subj_math",
      subjectName: "الرياضيات",
      materialType: "TEXTBOOK",
      title: "كتاب الرياضيات المقرر",
      description: "النسخة الكاملة المعتمدة",
      fileUrl: "https://example.com/math.pdf",
      published: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    admDb.collection("announcements").doc("ann_1").set({
      title: "تمت إضافة درس جديد",
      body: "تم نشر الدرس الأول في مادة الرياضيات",
      category: "NEW_LESSON",
      subjectId: "subj_math",
      pinned: true,
      published: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(aliceDb.collection("lessons").where("published", "==", true).get());
  await assertSucceeds(aliceDb.collection("materials").where("published", "==", true).get());
  await assertSucceeds(aliceDb.collection("announcements").where("published", "==", true).get());
});

test("Dynamic hierarchy, units, teachers, multi-teacher lessonExplanations, contentBlocks, and soft-delete isolation", async () => {
  const admDb = adminContext().firestore();
  const contentMgrDb = staffContext(CONTENT_MGR_UID, "CONTENT_MANAGER").firestore();
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE).firestore();
  const now = new Date(Date.now() - 2000);

  // Content manager builds stage -> grade -> branch
  await assertSucceeds(
    contentMgrDb.collection("catalogNodes").doc("stage_sec").set({
      nodeType: "STAGE",
      typeLabel: "مرحلة",
      title: "المرحلة الثانوية",
      subtitle: "الصفوف الثانوية والأفرع التخصصية",
      iconKey: "school",
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("catalogNodes").doc("grade_12").set({
      parentId: "stage_sec",
      nodeType: "GRADE",
      typeLabel: "صف",
      title: "الثالث الثانوي",
      subtitle: "البكالوريا",
      iconKey: "grade",
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("catalogNodes").doc("branch_sci").set({
      parentId: "grade_12",
      nodeType: "BRANCH",
      typeLabel: "فرع",
      title: "العلمي",
      subtitle: "الفرع العلمي",
      iconKey: "science",
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Subject linked dynamically to branch_sci + unit + two teachers
  await assertSucceeds(
    contentMgrDb.collection("subjects").doc("subj_analysis").set({
      title: "التحليل الرياضي",
      description: "النهايات والاشتقاق والتكامل",
      iconKey: "analysis",
      nodeIds: ["branch_sci"],
      nodePathLabel: "الثالث الثانوي • العلمي",
      teacherIds: ["teacher_qusai", "teacher_karim"],
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("units").doc("unit_limits").set({
      subjectId: "subj_analysis",
      subjectName: "التحليل الرياضي",
      title: "الوحدة الأولى: النهايات والاستمرار",
      description: "أساسيات النهايات",
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("teachers").doc("teacher_qusai").set({
      name: "أ. قصي البابا",
      headline: "مدرس التحليل الرياضي",
      bio: "خبرة 12 عاماً في تدريس البكالوريا",
      linkedUid: TEACHER_A_UID,
      subjectIds: ["subj_analysis"],
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("teachers").doc("teacher_karim").set({
      name: "أ. كريم عيتي",
      headline: "مدرس الرياضيات والفيزياء",
      subjectIds: ["subj_analysis"],
      sortOrder: 2,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("lessons").doc("lesson_limits_1").set({
      subjectId: "subj_analysis",
      subjectName: "التحليل الرياضي",
      unitId: "unit_limits",
      unitTitle: "الوحدة الأولى: النهايات والاستمرار",
      unitOrder: 1,
      lessonOrder: 1,
      title: "نهاية تابع عند اللانهاية",
      description: "درس مشروح من عدة أساتذة",
      videoUrl: "",
      videoSourceType: "YOUTUBE",
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Multiple teachers explain the same lesson
  await assertSucceeds(
    contentMgrDb.collection("lessonExplanations").doc("exp_qusai").set({
      lessonId: "lesson_limits_1",
      lessonTitle: "نهاية تابع عند اللانهاية",
      subjectId: "subj_analysis",
      subjectName: "التحليل الرياضي",
      teacherId: "teacher_qusai",
      teacherName: "أ. قصي البابا",
      teacherUid: TEACHER_A_UID,
      title: "شرح أ. قصي البابا الشامل",
      summary: "يتضمن فيديوهات + نوطة + اختبار تفاعلي",
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("lessonExplanations").doc("exp_karim").set({
      lessonId: "lesson_limits_1",
      lessonTitle: "نهاية تابع عند اللانهاية",
      subjectId: "subj_analysis",
      subjectName: "التحليل الرياضي",
      teacherId: "teacher_karim",
      teacherName: "أ. كريم عيتي",
      title: "شرح أ. كريم عيتي المبسط",
      summary: "أفكار سريعة وحل مسائل",
      sortOrder: 2,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Content blocks inside Qusai's explanation (Video + Interactive Quiz + Soft-deleted block)
  await assertSucceeds(
    contentMgrDb.collection("contentBlocks").doc("blk_video").set({
      explanationId: "exp_qusai",
      lessonId: "lesson_limits_1",
      subjectId: "subj_analysis",
      teacherId: "teacher_qusai",
      teacherUid: TEACHER_A_UID,
      blockType: "YOUTUBE_VIDEO",
      title: "الجزء الأول - شرح النظري",
      mediaUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      durationLabel: "18:40",
      sortOrder: 1,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    contentMgrDb.collection("contentBlocks").doc("blk_quiz").set({
      explanationId: "exp_qusai",
      lessonId: "lesson_limits_1",
      subjectId: "subj_analysis",
      teacherId: "teacher_qusai",
      teacherUid: TEACHER_A_UID,
      blockType: "QUIZ_MCQ",
      title: "اختبر فهمك للدرس",
      quizQuestions: [
        {
          id: "q1",
          prompt: "ما قيمة نهاية 1/x عندما تسعى x إلى اللانهاية؟",
          options: ["0", "1", "اللانهاية", "غير معرفة"],
          correctIndex: 0,
          explanation: "كسر مقامه يتزايد نحو اللانهاية يؤول إلى الصفر.",
          questionType: "MCQ",
        },
      ],
      sortOrder: 2,
      published: true,
      status: "PUBLISHED",
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Soft-deleted block must have published=false and be hidden from students
  await assertSucceeds(
    contentMgrDb.collection("contentBlocks").doc("blk_deleted").set({
      explanationId: "exp_qusai",
      lessonId: "lesson_limits_1",
      subjectId: "subj_analysis",
      teacherId: "teacher_qusai",
      blockType: "NOTE_SUMMARY",
      title: "محذوف",
      published: false,
      status: "ARCHIVED",
      deletedAt: now,
      sortOrder: 3,
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Rule invariant: cannot soft-delete while keeping published=true
  await assertFails(
    contentMgrDb.collection("contentBlocks").doc("blk_invalid_soft_del").set({
      explanationId: "exp_qusai",
      lessonId: "lesson_limits_1",
      subjectId: "subj_analysis",
      teacherId: "teacher_qusai",
      blockType: "NOTE_SUMMARY",
      title: "تناقض",
      published: true,
      status: "PUBLISHED",
      deletedAt: now,
      sortOrder: 4,
      createdBy: CONTENT_MGR_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Student reads published nodes, teachers, explanations, blocks, and cannot see deleted/draft blocks
  await assertSucceeds(aliceDb.collection("catalogNodes").where("published", "==", true).get());
  await assertSucceeds(aliceDb.collection("teachers").where("published", "==", true).get());
  await assertSucceeds(aliceDb.collection("lessonExplanations").where("published", "==", true).get());
  await assertSucceeds(aliceDb.collection("contentBlocks").where("published", "==", true).get());
  await assertFails(aliceDb.collection("contentBlocks").doc("blk_deleted").get());

  // Content manager cannot delete permanently or edit platformConfig or backups
  await assertFails(contentMgrDb.collection("subjects").doc("subj_analysis").delete());
  await assertFails(
    contentMgrDb.collection("platformConfig").doc("main").set({
      platformName: "Hacked",
      homeHeadline: "Hacked",
      primaryColorHex: "#000000",
      secondaryColorHex: "#111111",
      updatedBy: CONTENT_MGR_UID,
      updatedAt: now,
    })
  );

  // Super admin updates platformConfig/main; student reads it
  await assertSucceeds(
    admDb.collection("platformConfig").doc("main").set({
      platformName: "أكاديمية ABK",
      homeHeadline: "ماذا تدرس اليوم؟",
      primaryColorHex: "#0F294A",
      secondaryColorHex: "#0EA5E9",
      accentColorHex: "#38BDF8",
      updatedBy: ADMIN_UID,
      updatedAt: now,
    })
  );
  await assertSucceeds(aliceDb.collection("platformConfig").doc("main").get());
});

test("RBAC strict isolation for TEACHER, VIEWER, auditLogs, and backups", async () => {
  const admDb = adminContext().firestore();
  const teacherADb = staffContext(TEACHER_A_UID, "TEACHER").firestore();
  const teacherBDb = staffContext(TEACHER_B_UID, "TEACHER").firestore();
  const viewerDb = staffContext(VIEWER_UID, "VIEWER").firestore();
  const now = new Date(Date.now() - 2000);

  await admDb.collection("subjects").doc("subj_1").set({
    title: "الفيزياء",
    description: "فيزياء",
    iconKey: "physics",
    sortOrder: 1,
    published: true,
    createdBy: ADMIN_UID,
    createdAt: now,
    updatedAt: now,
  });
  await admDb.collection("teachers").doc("t_a").set({
    name: "أ. قصي",
    linkedUid: TEACHER_A_UID,
    sortOrder: 1,
    published: true,
    createdBy: ADMIN_UID,
    createdAt: now,
    updatedAt: now,
  });
  await admDb.collection("lessons").doc("l_1").set({
    subjectId: "subj_1",
    subjectName: "الفيزياء",
    unitTitle: "الوحدة 1",
    unitOrder: 1,
    lessonOrder: 1,
    title: "الحركة",
    description: "",
    videoUrl: "",
    videoSourceType: "YOUTUBE",
    published: true,
    createdBy: ADMIN_UID,
    createdAt: now,
    updatedAt: now,
  });

  // Teacher A creates draft explanation for self -> SUCCEED
  await assertSucceeds(
    teacherADb.collection("lessonExplanations").doc("exp_a").set({
      lessonId: "l_1",
      subjectId: "subj_1",
      teacherId: "t_a",
      teacherName: "أ. قصي",
      teacherUid: TEACHER_A_UID,
      title: "مسودة شرح أ. قصي",
      sortOrder: 1,
      published: false,
      status: "DRAFT",
      createdBy: TEACHER_A_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Teacher B cannot edit Teacher A's explanation -> FAIL
  await assertFails(
    teacherBDb.collection("lessonExplanations").doc("exp_a").update({
      title: "تعديل غير مصرح",
      updatedAt: new Date(Date.now() - 500),
    })
  );

  // Teacher A cannot directly create subjects or view backups -> FAIL
  await assertFails(
    teacherADb.collection("subjects").doc("subj_hack").set({
      title: "Hack",
      description: "",
      iconKey: "general",
      sortOrder: 1,
      published: true,
      createdBy: TEACHER_A_UID,
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertFails(teacherADb.collection("backups").get());

  // Viewer can read subjects & auditLogs, cannot write anything
  await assertSucceeds(viewerDb.collection("subjects").get());
  await assertSucceeds(
    admDb.collection("auditLogs").doc("log_1").set({
      actorUid: ADMIN_UID,
      actorEmail: ADMIN_EMAIL,
      actorRole: "SUPER_ADMIN",
      action: "CREATE_SUBJECT",
      entityType: "Subject",
      entityId: "subj_1",
      summary: "إنشاء مادة الفيزياء",
      createdAt: now,
    })
  );
  await assertSucceeds(viewerDb.collection("auditLogs").get());
  await assertFails(admDb.collection("auditLogs").doc("log_1").delete());
  await assertFails(viewerDb.collection("subjects").doc("subj_1").delete());

  // Super admin can manage backups; viewer cannot
  await assertSucceeds(
    admDb.collection("backups").doc("bkp_1").set({
      label: "نسخة احتياطية يدوية",
      createdByUid: ADMIN_UID,
      createdAt: now,
    })
  );
  await assertFails(viewerDb.collection("backups").get());
});

test("Student favorites, progress, and readAnnouncements isolate strictly by userId", async () => {
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE).firestore();
  const bobDb = testEnv.authenticatedContext(STUDENT_BOB).firestore();
  const now = new Date(Date.now() - 2000);

  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).collection("favorites").doc("fav_1").set({
      userId: STUDENT_ALICE,
      itemId: "lesson_1",
      itemType: "LESSON",
      title: "الدرس الأول",
      subtitle: "الرياضيات",
      subjectName: "الرياضيات",
      createdAt: now,
    })
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).collection("progress").doc("lesson_1").set({
      userId: STUDENT_ALICE,
      lessonId: "lesson_1",
      lessonTitle: "الدرس الأول",
      subjectId: "subj_math",
      subjectName: "الرياضيات",
      lastPositionMs: 12000,
      durationMs: 60000,
      completed: false,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).collection("progress").doc("lesson_1").update({
      lastPositionMs: 60000,
      completed: true,
      updatedAt: new Date(Date.now() - 500),
    })
  );

  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).collection("readAnnouncements").doc("ann_1").set({
      userId: STUDENT_ALICE,
      announcementId: "ann_1",
      createdAt: now,
    })
  );

  await assertFails(bobDb.collection("users").doc(STUDENT_ALICE).collection("favorites").get());
  await assertFails(bobDb.collection("users").doc(STUDENT_ALICE).collection("progress").get());
  await assertFails(bobDb.collection("users").doc(STUDENT_ALICE).collection("readAnnouncements").get());
  await assertFails(
    bobDb.collection("users").doc(STUDENT_ALICE).collection("favorites").doc("fav_2").set({
      userId: STUDENT_ALICE,
      itemId: "lesson_1",
      itemType: "LESSON",
      title: "Hijack",
      subtitle: "Math",
      subjectName: "Math",
      createdAt: now,
    })
  );
});

test("BANNED and SUSPENDED users are blocked from reading content or writing student data, while ASSIGNMENT blocks/materials validate cleanly", async () => {
  const admDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE, { email: "alice@example.com", email_verified: true }).firestore();
  const now = new Date(Date.now() - 2000);

  await assertSucceeds(
    admDb.collection("subjects").doc("subj_math").set({
      title: "الرياضيات",
      description: "الجبر",
      iconKey: "math",
      sortOrder: 1,
      published: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Admin can create an ASSIGNMENT study material
  await assertSucceeds(
    admDb.collection("materials").doc("mat_assign_1").set({
      subjectId: "subj_math",
      subjectName: "الرياضيات",
      materialType: "ASSIGNMENT",
      title: "واجب التفاضل الأول",
      description: "يرجى حل التمارين 1 إلى 5",
      fileUrl: "https://example.com/assignment1.pdf",
      published: true,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Admin creates BANNED user profile for Alice with banReason
  await assertSucceeds(
    admDb.collection("users").doc(STUDENT_ALICE).set({
      userId: STUDENT_ALICE,
      displayName: "Alice",
      email: "alice@example.com",
      role: "STUDENT",
      accountStatus: "BANNED",
      banReason: "مخالفة تعليمات المنصة",
      bannedAt: now,
      bannedBy: ADMIN_EMAIL,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Alice can read her own user profile doc so the app can render the Banned screen
  await assertSucceeds(aliceDb.collection("users").doc(STUDENT_ALICE).get());

  // Alice is denied reading subjects, materials, announcements, platformConfig, or writing favorites/progress
  await assertFails(aliceDb.collection("subjects").where("published", "==", true).get());
  await assertFails(aliceDb.collection("materials").where("published", "==", true).get());
  await assertFails(aliceDb.collection("announcements").where("published", "==", true).get());
  await assertFails(aliceDb.collection("platformConfig").doc("main").get());
  await assertFails(
    aliceDb.collection("users").doc(STUDENT_ALICE).collection("favorites").doc("fav_blocked").set({
      userId: STUDENT_ALICE,
      itemId: "mat_assign_1",
      itemType: "MATERIAL",
      title: "واجب",
      subtitle: "واجب",
      subjectName: "الرياضيات",
      createdAt: now,
    })
  );

  // Admin unbans Alice -> reads & favorites resume
  await assertSucceeds(
    admDb.collection("users").doc(STUDENT_ALICE).update({
      accountStatus: "ACTIVE",
      banReason: null,
      bannedAt: null,
      updatedAt: new Date(Date.now() - 500),
    })
  );
  await assertSucceeds(aliceDb.collection("subjects").where("published", "==", true).get());
  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).collection("favorites").doc("fav_ok").set({
      userId: STUDENT_ALICE,
      itemId: "mat_assign_1",
      itemType: "MATERIAL",
      title: "واجب",
      subtitle: "واجب",
      subjectName: "الرياضيات",
      createdAt: now,
    })
  );
});

test("appConfig/android_release enforces admin HTTPS+SHA256 validation and active student read-only access", async () => {
  const admDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE, { email: "alice@example.com", email_verified: true }).firestore();
  const now = new Date(Date.now() - 2000);
  const validSha256 = "a".repeat(64);

  // Student cannot write release manifest
  await assertFails(
    aliceDb.collection("appConfig").doc("android_release").set({
      versionCode: 2,
      versionName: "1.1.0",
      apkUrl: "https://github.com/org/repo/releases/download/v1.1.0/midad.apk",
      sha256: validSha256,
      mandatory: false,
      updatedBy: STUDENT_ALICE,
      updatedAt: now,
    })
  );

  // Admin cannot publish insecure HTTP URL
  await assertFails(
    admDb.collection("appConfig").doc("android_release").set({
      versionCode: 2,
      versionName: "1.1.0",
      apkUrl: "http://example.com/midad.apk",
      sha256: validSha256,
      mandatory: false,
      updatedBy: ADMIN_UID,
      updatedAt: now,
    })
  );

  // Admin cannot publish invalid SHA-256 checksum
  await assertFails(
    admDb.collection("appConfig").doc("android_release").set({
      versionCode: 2,
      versionName: "1.1.0",
      apkUrl: "https://github.com/org/repo/releases/download/v1.1.0/midad.apk",
      sha256: "abc123",
      mandatory: false,
      updatedBy: ADMIN_UID,
      updatedAt: now,
    })
  );

  // Admin publishes valid HTTPS + SHA-256 release manifest
  await assertSucceeds(
    admDb.collection("appConfig").doc("android_release").set({
      versionCode: 3,
      versionName: "1.2.0",
      minSupportedVersionCode: 1,
      apkUrl: "https://github.com/org/repo/releases/download/v1.2.0/midad-1.2.0.apk",
      sha256: validSha256,
      fileSizeBytes: 24500000,
      releaseNotes: "تحديث مداد التعليمية مع تحسينات الأداء والأمان",
      mandatory: true,
      publishedAtMillis: Date.now() - 2000,
      updatedBy: ADMIN_UID,
      updatedAt: now,
    })
  );

  // Active student reads android_release, cannot delete it
  await assertSucceeds(aliceDb.collection("appConfig").doc("android_release").get());
  await assertFails(aliceDb.collection("appConfig").doc("android_release").delete());
  await assertFails(admDb.collection("appConfig").doc("android_release").delete());

  // Banned student is denied reading android_release
  await assertSucceeds(
    admDb.collection("users").doc(STUDENT_ALICE).set({
      userId: STUDENT_ALICE,
      displayName: "Alice",
      email: "alice@example.com",
      role: "STUDENT",
      accountStatus: "BANNED",
      createdAt: now,
      updatedAt: now,
    })
  );
  await assertFails(aliceDb.collection("appConfig").doc("android_release").get());
});

test("platformConfig R2 storage limits and mediaAssets RBAC enforce strict access control", async () => {
  const admDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE, { email: "alice@example.com", email_verified: true }).firestore();
  const now = new Date(Date.now() - 2000);

  // Admin writes platformConfig with R2 Worker URL and editable size/quota limits
  await assertSucceeds(
    admDb.collection("platformConfig").doc("main").set({
      platformName: "مداد التعليمية",
      platformTagline: "طريقك نحو التفوّق",
      homeHeadline: "ماذا تدرس اليوم؟",
      primaryColorHex: "#142A43",
      secondaryColorHex: "#167D83",
      accentColorHex: "#C7A15A",
      r2WorkerBaseUrl: "https://midad-r2-worker.example.workers.dev",
      maxVideoSizeMb: 200,
      maxPdfSizeMb: 100,
      maxImageSizeMb: 20,
      totalStorageLimitGb: 25,
      updatedBy: ADMIN_UID,
      updatedAt: now,
    })
  );

  // Reject out-of-range video limit (> 2048 MB)
  await assertFails(
    admDb.collection("platformConfig").doc("main").set({
      platformName: "مداد التعليمية",
      homeHeadline: "ماذا تدرس اليوم؟",
      primaryColorHex: "#142A43",
      secondaryColorHex: "#167D83",
      maxVideoSizeMb: 5000,
      updatedBy: ADMIN_UID,
      updatedAt: now,
    })
  );

  // Student cannot write mediaAssets
  await assertFails(
    aliceDb.collection("mediaAssets").doc("asset_video_1").set({
      title: "شرح الجبر",
      fileName: "algebra.mp4",
      objectKey: "videos/1700_algebra.mp4",
      fileUrl: "https://midad-r2-worker.example.workers.dev/files/videos/1700_algebra.mp4",
      contentType: "video/mp4",
      mediaKind: "VIDEO",
      sizeBytes: 42000000,
      published: true,
      status: "PUBLISHED",
      createdBy: STUDENT_ALICE,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Admin creates published + draft mediaAssets; insecure http:// rejected
  await assertFails(
    admDb.collection("mediaAssets").doc("asset_http").set({
      title: "غير آمن",
      fileName: "x.mp4",
      objectKey: "videos/x.mp4",
      fileUrl: "http://insecure.example.com/x.mp4",
      contentType: "video/mp4",
      mediaKind: "VIDEO",
      sizeBytes: 1024,
      published: true,
      status: "PUBLISHED",
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    admDb.collection("mediaAssets").doc("asset_video_pub").set({
      title: "درس الدوال الحقيقية",
      fileName: "functions.mp4",
      objectKey: "videos/1700_functions.mp4",
      fileUrl: "https://midad-r2-worker.example.workers.dev/files/videos/1700_functions.mp4",
      contentType: "video/mp4",
      mediaKind: "VIDEO",
      sizeBytes: 52428800,
      nodeIds: ["stage_sec"],
      subjectId: "subj_math",
      published: true,
      status: "PUBLISHED",
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  await assertSucceeds(
    admDb.collection("mediaAssets").doc("asset_pdf_draft").set({
      title: "مسودة كتاب",
      fileName: "book.pdf",
      objectKey: "materials/1700_book.pdf",
      fileUrl: "https://midad-r2-worker.example.workers.dev/files/materials/1700_book.pdf",
      contentType: "application/pdf",
      mediaKind: "PDF",
      sizeBytes: 15728640,
      published: false,
      status: "DRAFT",
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Active student reads published asset, denied reading draft or deleting
  await assertSucceeds(aliceDb.collection("mediaAssets").doc("asset_video_pub").get());
  await assertFails(aliceDb.collection("mediaAssets").doc("asset_pdf_draft").get());
  await assertFails(aliceDb.collection("mediaAssets").doc("asset_video_pub").delete());
  await assertSucceeds(admDb.collection("mediaAssets").doc("asset_pdf_draft").delete());
});


