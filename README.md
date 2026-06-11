# Bastion TD

A production tower defense game built from the best ideas in the genre. One JavaScript codebase ships to three targets: web (GitHub Pages), Android (Play Store) and iOS (App Store) via Capacitor. All builds run in GitHub Actions, nothing needs to be installed locally.

## Play

1. **Web**: deployed automatically to GitHub Pages on every push to `main`.
2. **Local**: open `www/index.html` in any browser.
3. **Android**: download the debug APK artifact from the latest "Build Android" workflow run and install it on any phone.

## Design pedigree

| System | Inspired by |
|---|---|
| Dual upgrade paths per tower, every placement is a build decision | Bloons TD 6 |
| Active commander abilities on cooldown | Kingdom Rush |
| Persistent research tree and endless scaling | Infinitode 2 |
| Open-field maze building where towers block the path | Desktop TD, Dungeon Warfare |
| Handcrafted map variety and kill-zone pacing | Defense Grid |

## Features

1. **6 modes**: Campaign (5 maps, 3 difficulties, 45 stars), Endless, Maze (flow-field pathfinding), Boss Rush, date-seeded Daily Challenge with mutators, Sandbox.
2. **9 towers**, each with 2 upgrade paths of 3 tiers.
3. **11 enemy types**: armor, flying, stealth, regeneration, splitting, swarms, 2 bosses.
4. **3 commander abilities**, 8 permanent research perks, 10 achievements.
5. Touch and mouse input, responsive layout, save data in localStorage.

## Custom art

The game ships with procedural vector art: rotating turrets with recoil and muzzle flash, animated enemies with unique silhouettes. To replace any of it with painted sprites, drop transparent PNGs at:

1. `www/assets/towers/<id>.png` (top-down, facing right): gunner, cannon, frost, tesla, venom, sniper, missile, bank, beacon
2. `www/assets/enemies/<id>.png` (top-down, facing up): runt, sprinter, swarmling, brute, winged, phantom, regenerator, shellback, splitter, juggernaut, wyvern

The engine detects them at load time, no code changes needed. Towers render at 44px and enemies at about 2.7x their radius, so 128px or 256px source images are plenty.

## Repository layout

```
www/                      the game (no build step, plain HTML/CSS/JS)
resources/                source icon and splash (1024px / 2732px)
capacitor.config.json     app id, name, webDir
.github/workflows/
  deploy-web.yml          GitHub Pages deploy on push
  android-build.yml       debug APK on push, signed AAB on v* tags
  ios-build.yml           unsigned iOS compile check (manual)
```

The `android/` and `ios/` native projects are generated fresh in CI by `npx cap add`, so they are gitignored.

## Releasing to the Play Store

1. Create a [Google Play Console](https://play.google.com/console) account ($25 one time).
2. Generate an upload keystore (once, keep it safe):
   ```
   keytool -genkey -v -keystore bastion.keystore -alias bastion -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Add four repository secrets: `ANDROID_KEYSTORE_BASE64` (the keystore file base64 encoded), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. Tag a release: `git tag v1.0.0 && git push --tags`. The workflow produces a signed `.aab` artifact.
5. Upload the AAB in Play Console, fill the store listing (screenshots, description, content rating questionnaire, privacy policy URL) and submit for review.

## Releasing to the App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99 per year).
2. Create an App ID (`com.ozspidey.bastiontd`), a distribution certificate and a provisioning profile in App Store Connect.
3. Extend `ios-build.yml` with signing (fastlane or Apple's upload tooling) using the certificate and profile as secrets, or build once from any Mac with Xcode: `npm install && npx cap add ios && npx cap open ios`, then Product → Archive → Distribute.
4. Fill the App Store listing and submit for review.

## Local development (optional)

```
npm install
npx cap add android        # requires Android Studio
npx cap sync
npx cap open android       # run on device/emulator
```

## Roadmap

1. Lock landscape orientation on phones (screen-orientation plugin)
2. Move saves from localStorage to Capacitor Preferences
3. Online daily leaderboard
4. Hero unit with XP, more maps, map editor
5. Co-op via WebRTC
