import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing key lives outside the repository. Point PADDECK_KEYSTORE at a
// keystore.properties file (storeFile, storePassword, keyAlias, keyPassword); without one,
// builds fall back to the local debug key so anyone can build from source.
val keyProps = Properties()
val keyFile = file(System.getenv("PADDECK_KEYSTORE") ?: "${System.getenv("APPDATA") ?: ""}/PadDeck-signing/keystore.properties")
if (keyFile.exists()) keyFile.inputStream().use { keyProps.load(it) }

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
    signingConfigs {
        if (keyProps.isNotEmpty()) create("release") {
            storeFile = file(keyProps.getProperty("storeFile"))
            storePassword = keyProps.getProperty("storePassword")
            keyAlias = keyProps.getProperty("keyAlias")
            keyPassword = keyProps.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keyProps.isNotEmpty()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
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
