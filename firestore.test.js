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

test("Unauthenticated user cannot read or write any collection", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("subjects").where("published", "==", true).get());
  await assertFails(unauthDb.collection("lessons").where("published", "==", true).get());
  await assertFails(unauthDb.collection("materials").where("published", "==", true).get());
  await assertFails(unauthDb.collection("announcements").where("published", "==", true).get());
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

  // Student tries to register as ADMIN -> FAIL
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

  // Student tries to write to /admins -> FAIL
  await assertFails(
    aliceDb.collection("admins").doc(STUDENT_ALICE).set({
      uid: STUDENT_ALICE,
      email: "alice@example.com",
      grantedBy: STUDENT_ALICE,
      createdAt: now,
    })
  );

  // Student registers properly as STUDENT -> SUCCEED
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

  // Student updates own displayName -> SUCCEED
  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).update({
      displayName: "Alice Updated",
      updatedAt: new Date(Date.now() - 500),
    })
  );

  // Student tries to change own role to ADMIN via update -> FAIL
  await assertFails(
    aliceDb.collection("users").doc(STUDENT_ALICE).update({
      role: "ADMIN",
      updatedAt: new Date(Date.now() - 500),
    })
  );

  // Student tries to read another student's PII or list /users -> FAIL
  await assertFails(bobDb.collection("users").doc(STUDENT_ALICE).get());
  await assertFails(bobDb.collection("users").get());
});

test("Admin can create/update/delete subjects, lessons, materials, announcements, and suspend students", async () => {
  const admDb = adminContext().firestore();
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE).firestore();
  const now = new Date(Date.now() - 2000);

  // Admin creates subject (NO 'id' key)
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

  // Admin creates unpublished draft subject
  await assertSucceeds(
    admDb.collection("subjects").doc("subj_draft").set({
      title: "مسودة",
      description: "مادة مخفية",
      iconKey: "general",
      sortOrder: 9,
      published: false,
      createdBy: ADMIN_UID,
      createdAt: now,
      updatedAt: now,
    })
  );

  // Student queries published subjects -> SUCCEED
  await assertSucceeds(
    aliceDb.collection("subjects").where("published", "==", true).get()
  );

  // Student cannot read unpublished subject or unfiltered list containing unpublished doc -> FAIL
  await assertFails(aliceDb.collection("subjects").doc("subj_draft").get());
  await assertFails(aliceDb.collection("subjects").get());

  // Student cannot create/update/delete subjects -> FAIL
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

  // Admin creates lesson linked to subj_math
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

  // Orphaned lesson referencing non-existent subject -> FAIL
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

  // Admin creates PDF material
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

  // Admin creates announcement
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

  // Student queries published lessons/materials/announcements -> SUCCEED
  await assertSucceeds(aliceDb.collection("lessons").where("published", "==", true).get());
  await assertSucceeds(aliceDb.collection("materials").where("published", "==", true).get());
  await assertSucceeds(aliceDb.collection("announcements").where("published", "==", true).get());
});

test("Student favorites, progress, and readAnnouncements isolate strictly by userId", async () => {
  const aliceDb = testEnv.authenticatedContext(STUDENT_ALICE).firestore();
  const bobDb = testEnv.authenticatedContext(STUDENT_BOB).firestore();
  const now = new Date(Date.now() - 2000);

  // Alice adds favorite
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

  // Alice tracks lesson progress & updates position
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

  // Alice marks announcement read
  await assertSucceeds(
    aliceDb.collection("users").doc(STUDENT_ALICE).collection("readAnnouncements").doc("ann_1").set({
      userId: STUDENT_ALICE,
      announcementId: "ann_1",
      createdAt: now,
    })
  );

  // Bob cannot read or write Alice's favorites, progress, or readAnnouncements
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
