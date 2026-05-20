# Biass Fabrika Sipariş — iOS Kurulum Rehberi
## Yazılımcı için adım adım

---

## GEREKSİNİMLER
- Mac bilgisayar
- Xcode 15+ (App Store'dan)
- Node.js 18+ (nodejs.org)
- Apple Developer hesabı (bireysel $99/yıl)
- GoogleService-Info.plist (Firebase'den indirildi ✅)
- Bu klasördeki tüm dosyalar

---

## ADIM 1 — Proje Klasörü Kur

```bash
mkdir biass-siparis-ios && cd biass-siparis-ios

# Bu klasördeki dosyaları kopyala:
# - package.json
# - capacitor.config.json

# www/ klasörü oluştur, içine şunları koy:
mkdir www
# www/ içine: index.html, manifest.json, sw.js, icon-192.png, icon-512.png, privacy-policy.html

npm install
npx cap add ios
npx cap sync ios
```

---

## ADIM 2 — GoogleService-Info.plist Ekle

```bash
npx cap open ios
```

Xcode açılır:
1. Sol panelde `App` klasörüne sağ tıkla
2. **"Add Files to App"**
3. `GoogleService-Info.plist` seç → **"Copy items if needed"** → Add

---

## ADIM 3 — Firebase SDK Ekle (Podfile)

`ios/App/Podfile` dosyasına ekle:

```ruby
target 'App' do
  capacitor_pods
  pod 'Firebase/Core'
  pod 'Firebase/Messaging'
end
```

```bash
cd ios/App && pod install && cd ../..
npx cap sync ios
```

---

## ADIM 4 — AppDelegate.swift Güncelle

`ios/App/App/AppDelegate.swift` dosyasını şununla değiştir:

```swift
import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(_ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    FirebaseApp.configure()
    return true
  }

  func application(_ app: UIApplication,
    open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
  }

  func application(_ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Messaging.messaging().apnsToken = deviceToken
    NotificationCenter.default.post(
      name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
  }

  func application(_ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(
      name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
  }
}
```

---

## ADIM 5 — Xcode Signing & Capabilities

1. Xcode'da sol panelde proje adına tıkla
2. **Signing & Capabilities** sekmesi
3. **Team:** Apple Developer hesabını seç
4. **Bundle Identifier:** `com.biass.fabrikasiparis`
5. **"+ Capability"** → **Push Notifications** ekle
6. **"+ Capability"** → **Background Modes** ekle
   - ✅ Remote notifications

---

## ADIM 6 — APNs Sertifikası (Firebase için)

**Mac'te:**
1. Keychain Access aç → Certificate Assistant → Request Certificate from CA
2. Email: Apple Developer email, Common Name: Biass Siparis, CA: boş → Disk'e kaydet

**Apple Developer Console:**
1. developer.apple.com → Certificates → + ekle
2. **Apple Push Notifications service (APNs)** → devam
3. App ID: `com.biass.fabrikasiparis` seç
4. CSR dosyasını yükle → İndir → Çift tıkla (Keychain'e ekle)
5. Keychain'de sertifikayı bul → Sağ tıkla → Export → `.p12` olarak kaydet → şifre koy

**Firebase Console:**
1. Proje Ayarları → Cloud Messaging
2. Apple app configuration → APNs Authentication Key veya APNs Certificate yükle

---

## ADIM 7 — Firebase Service Account (Apps Script için)

**Apps Script'te FCM push çalışması için:**

1. Firebase Console → ⚙️ Proje Ayarları → **Service Accounts**
2. **"Generate new private key"** → JSON indir
3. `apps-script.js` dosyasında `FCM_SERVICE_ACCOUNT = {}` bölümüne JSON içeriğini yapıştır
4. Apps Script'i kaydet → yeniden dağıt

---

## ADIM 8 — Privacy Policy GitHub'a Yükle

`privacy-policy.html` dosyasını GitHub'a yükle.
URL: `https://ozemaria53.github.io/Siparis.app/privacy-policy.html`

Bu URL App Store Connect'te kullanılacak.

---

## ADIM 9 — App Store Connect

1. appstoreconnect.apple.com → My Apps → **+** → New App
2. Platform: **iOS**
3. Name: **Biass Fabrika Sipariş**
4. Bundle ID: `com.biass.fabrikasiparis`
5. SKU: `biass-fabrika-siparis-001`
6. User Access: **Limited Access** (sadece belirli kullanıcılar)
7. Privacy Policy URL: `https://ozemaria53.github.io/Siparis.app/privacy-policy.html`

**App Information:**
- Category: Business
- Age Rating: 4+

**App Review Information:**
- Demo Account Username: `Oğuzhan`
- Demo Account Password: `045743`
- Notes: "Bu uygulama yalnızca Biass şirketi çalışanlarının kullanımına yönelik dahili bir sipariş yönetim sistemidir. Giriş yapabilmek için şirket tarafından atanmış kullanıcı hesabı gerekmektedir."

---

## ADIM 10 — Archive & Upload

Xcode'da:
1. Gerçek cihaz veya "Any iOS Device (arm64)" seç
2. **Product → Archive**
3. Organizer açılır → **Distribute App**
4. **App Store Connect** → Next → Upload
5. App Store Connect'te build görününce TestFlight veya direkt yayın

---

## ADIM 11 — İçerik Güncelleme

`index.html` değişince:
```bash
npx cap sync ios
# Sonra Xcode'da Archive & Upload tekrarla
```

---

## ÖNEMLİ NOTLAR

- Push notification test için **gerçek iPhone** gerekir (simulator çalışmaz)
- Supabase URL: `https://zrftjlqjpmbtgihrhtah.supabase.co`
- Apps Script URL: `index.html` içinde `GS_URL` değişkeninde
- Her yeni dağıtımda Apps Script URL değişirse `index.html`'i güncelle

