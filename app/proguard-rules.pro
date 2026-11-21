# ProGuard / R8 Rules for Midad Educational Platform

# Keep line numbers & rename source file attribute for clean stack traces
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Preserve @Keep annotated Firestore models, update models, and JavascriptInterface classes
-keep @androidx.annotation.Keep class * { *; }
-keepclassmembers @androidx.annotation.Keep class * { *; }

-keep class com.example.data.model.** { *; }
-keep class com.example.update.** { *; }

# Keep WebView JavaScript bridge methods (YouTube IFrame player)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve enums used cleanly with Firestore deserialization
-keepclassmembers enum com.example.** {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Strip verbose/debug/info logs from release builds
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
