# Keep Ktor classes
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# Keep kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class dev.blitz.companion.**$$serializer { *; }
-keepclassmembers class dev.blitz.companion.** {
    *** Companion;
}
-keepclasseswithmembers class dev.blitz.companion.** {
    kotlinx.serialization.KSerializer serializer(...);
}
