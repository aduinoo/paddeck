plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.paddeck.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.paddeck.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 210
        versionName = "2.1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            // Sideloaded APK: signed with the local debug key so it installs directly.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

// Bundle the PadDeck interface (built by the dashboard project) inside the APK.
val copyWeb by tasks.registering(Copy::class) {
    from(rootProject.file("../dashboard/dist"))
    into(layout.projectDirectory.dir("src/main/assets/web"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
