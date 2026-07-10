# Native App Packaging

The POS stays editable as the Next.js web app in this repository and deploys to Vercel.

The installable apps are thin native shells:

- Windows EXE: Electron opens `https://shop.globalfsms.com/login`.
- Android APK: Capacitor opens `https://shop.globalfsms.com`.

This keeps updates simple. Most POS improvements only need a normal web deploy. Rebuild native packages only when changing native app branding, app icons, permissions, printer bridges, camera/barcode support, or native update behavior.

## Output Folders

- Windows installer output: `dist-native/windows/`
- Android project: `apps/mobile/android/`
- Android APK output after Gradle build: `apps/mobile/android/app/build/outputs/apk/`

Generated installers/APKs should not be committed to Git.

## Branding

- Shop logo/name: POS `Settings > Shop Settings`.
- POS owner/company branding: Owner portal branding area.
- Native launcher icon source: `apps/native-assets/app-icon.svg`.
- Windows shell: `apps/desktop/`.
- Android shell: `apps/mobile/`.

## Commands

```powershell
npm run desktop:dev
npm run desktop:build
npm run mobile:add:android
npm run mobile:sync
npm run mobile:open
```

Android APK builds require Android Studio, Android SDK, and a JDK. If those are not installed locally, use Android Studio or a GitHub Actions runner later.

## No-Hassle Cloud Builds

GitHub Actions workflow: `.github/workflows/native-packages.yml`.

Open GitHub, go to `Actions > Build Native Packages > Run workflow`.

Artifacts:

- `spos-shop-windows-installer`
- `spos-shop-android-debug-apk`

For a production Play Store style APK/AAB later, add signing keys as GitHub secrets and change the Android build from debug to release.
