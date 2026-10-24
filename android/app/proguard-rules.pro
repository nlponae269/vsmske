# Firestore читает поля через Map, классы моделей не сериализуются — особых правил не нужно.
-keepattributes Signature,*Annotation*
# WebRTC работает через JNI — классы нельзя переименовывать
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
# вход через Google (Credential Manager) — как советует документация androidx.credentials
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }
