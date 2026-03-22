#!/bin/bash
# Build Matrix Android APK using raw Android SDK tools
# Requirements: Android SDK (aapt, dalvik-exchange/dx, apksigner, zipalign), JDK
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ANDROID_HOME="${ANDROID_HOME:-/usr/lib/android-sdk}"
BUILD_TOOLS="$ANDROID_HOME/build-tools/29.0.3"
PLATFORM="$ANDROID_HOME/platforms/android-23/android.jar"
APP_SRC="app/src/main"
BUILD_DIR="/tmp/android-build-matrix"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/obj" "$BUILD_DIR/apk"

echo "=== Generate R.java ==="
aapt package -f -m \
  -S "$APP_SRC/res" \
  -J "$BUILD_DIR/gen" \
  -M "$APP_SRC/AndroidManifest.xml" \
  -I "$PLATFORM"

echo "=== Compile Java ==="
javac -source 1.8 -target 1.8 -Xlint:-options -d "$BUILD_DIR/obj" \
  -classpath "$PLATFORM" \
  -sourcepath "$BUILD_DIR/gen:$APP_SRC/java" \
  "$BUILD_DIR/gen/com/lukasz/matrix/R.java" \
  "$APP_SRC/java/com/lukasz/matrix/MainActivity.java" \
  "$APP_SRC/java/com/lukasz/matrix/MatrixService.java" \
  "$APP_SRC/java/com/lukasz/matrix/BootReceiver.java"

echo "=== Convert to DEX ==="
dalvik-exchange --dex --min-sdk-version=26 --output="$BUILD_DIR/apk/classes.dex" "$BUILD_DIR/obj"

echo "=== Create unsigned APK ==="
aapt package -f \
  -S "$APP_SRC/res" \
  -M "$APP_SRC/AndroidManifest.xml" \
  -I "$PLATFORM" \
  -F "$BUILD_DIR/matrix-unsigned.apk" \
  "$BUILD_DIR/apk"

echo "=== Generate debug keystore ==="
if [ ! -f "$BUILD_DIR/debug.keystore" ]; then
  keytool -genkey -v -keystore "$BUILD_DIR/debug.keystore" \
    -storepass android -alias androiddebugkey -keypass android \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Debug, OU=Debug, O=Debug, L=Debug, S=Debug, C=US"
fi

echo "=== Zipalign ==="
"$BUILD_TOOLS/zipalign" -f 4 "$BUILD_DIR/matrix-unsigned.apk" "$BUILD_DIR/matrix-aligned.apk"

echo "=== Sign APK ==="
"$BUILD_TOOLS/apksigner" sign \
  --ks "$BUILD_DIR/debug.keystore" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --min-sdk-version 26 \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --out "$SCRIPT_DIR/matrix-debug.apk" \
  "$BUILD_DIR/matrix-aligned.apk"

echo ""
echo "=== APK built successfully ==="
ls -lh "$SCRIPT_DIR/matrix-debug.apk"
echo ""
echo "Transfer to your Android phone and install (enable 'Install unknown apps')."
