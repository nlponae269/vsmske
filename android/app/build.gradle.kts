plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "ru.vsmske.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.vsmske.app"
        minSdk = 26
        targetSdk = 35
        // только для проверки: ./gradlew assembleDebug -Pemu=true — локальные эмуляторы Firebase вместо настоящей базы
        val emu = (project.findProperty("emu") as String?) == "true"
        buildConfigField("boolean", "EMU", emu.toString())
        manifestPlaceholders["cleartext"] = emu.toString()
    }

    // Ключ подписи лежит в репозитории: приложение ставится не из Google Play, а новая версия
    // должна быть подписана тем же ключом, иначе Android не даст обновить поверх старой.
    // Из одного кода собираются два приложения: VСмске (full) и «ВС Клипы» (clips) — у каждого свой пакет, название, иконка и версия
    flavorDimensions += "app"
    productFlavors {
        create("full") {
            dimension = "app"
            applicationId = "ru.vsmske.app"
            versionCode = 16
            versionName = "3.12"
            buildConfigField("boolean", "CLIPS", "false")
            resValue("string", "app_name", "VСмске")
        }
        create("clips") {
            dimension = "app"
            applicationId = "ru.vsmske.clips"
            versionCode = 2
            versionName = "1.1"
            buildConfigField("boolean", "CLIPS", "true")
            resValue("string", "app_name", "ВС Клипы")
        }
    }

    signingConfigs {
        create("vs") {
            storeFile = file("vsmske.jks")
            storePassword = "vsmske-app"
            keyAlias = "vsmske"
            keyPassword = "vsmske-app"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("vs")
        }
        debug { signingConfig = signingConfigs.getByName("vs") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")

    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-auth")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-session:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    // ВС Клипы: наложить звук из библиотеки на снятое видео и вынуть звук из клипа (без своих серверов — всё на телефоне)
    implementation("androidx.media3:media3-transformer:1.5.1")
    // ВС Клипы: своя камера (под выбранный звук)
    val camerax = "1.4.1"
    implementation("androidx.camera:camera-core:$camerax")
    implementation("androidx.camera:camera-camera2:$camerax")
    implementation("androidx.camera:camera-lifecycle:$camerax")
    implementation("androidx.camera:camera-video:$camerax")
    implementation("androidx.camera:camera-view:$camerax")
    implementation("androidx.graphics:graphics-shapes:1.0.1")
    // эфиры и звонки — WebRTC (тот же протокол, что у сайта)
    implementation("io.getstream:stream-webrtc-android:1.3.10")
    implementation("io.coil-kt:coil-compose:2.7.0")
    // вход через Google (Credential Manager → idToken → Firebase signInWithCredential)
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    testImplementation("junit:junit:4.13.2")
}
