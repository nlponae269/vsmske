# Firestore читает поля через Map, классы моделей не сериализуются — особых правил не нужно.
-keepattributes Signature,*Annotation*
# WebRTC работает через JNI — классы нельзя переименовывать
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
