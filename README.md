# KÜN-MYYS V2

Kapadokya Üniversitesi Mikro Yeterlilik Yönetim Sistemi; mikro yeterlilik programlarının tasarım, AKTS, onay, eğitim, ölçme, tanıma, belgelendirme, itiraz ve kalite süreçlerini tek uygulamada yöneten çalışan V2 pilot ürünüdür.

## Hızlı başlatma

Gereksinim: **Node.js 24 veya üzeri**. Harici paket kurulumu gerekmez.

```bash
cp .env.example .env
npm start
```

Ardından `http://127.0.0.1:8080` adresini açın.

Servis sağlık kontrolü: `GET http://127.0.0.1:8080/api/health`

Testler:

```bash
npm test
npm run check
```

## Demo hesapları

Tüm hesapların başlangıç parolası `Kun2026!` değeridir.

| Rol | E-posta |
|---|---|
| Sistem yöneticisi | admin@kapadokya.edu.tr |
| Program koordinatörü | koordinator@kapadokya.edu.tr |
| Akademik birim kurulu | birim@kapadokya.edu.tr |
| Mikro Yeterlilik Komisyonu | komisyon@kapadokya.edu.tr |
| Senato sekretaryası | senato@kapadokya.edu.tr |
| Ölçme değerlendiricisi | degerlendirici@kapadokya.edu.tr |
| Kalite güvencesi | kalite@kapadokya.edu.tr |
| Öğrenen | ogrenci@kapadokya.edu.tr |

Canlı ortama geçmeden önce tüm demo hesaplarını kaldırın veya parolalarını değiştirin.

## Uygulanan modüller

- Ölçülebilir öğrenme çıktıları ve Bloom düzeyiyle program tasarımı
- 25 saat = 1 AKTS iş yükü motoru
- Koordinatör → akademik birim → komisyon → senato onay zinciri
- 30 takvim günlük karar süresi ve gecikme göstergeleri
- Senato onaylı programlarda açık/kapalı grup, takvim, yer, kayıt son tarihi ve kontenjan yönetimi
- Kurum içi/kurum dışı öğrenen kaydı ve başarı sonucu
- Öğrenme çıktısına bağlı dosya/URL kanıtlarının SHA-256 özetiyle saklanması
- Kanıt listesi, güvenli indirme ve tüm çıktılar kanıtlanmadan başarıya geçiş kontrolü
- Dış kazanımların tanınması; %10 AKTS ve eğitim sayısına göre %50 uzaktan sınırı
- YÖK EK-1’in 11 zorunlu alanının değişmez anlık görüntüsü
- Open Badges 3.0 ve W3C VC 2.0 uyumlu JSON-LD çıktıları
- Gerçek Ed25519 anahtarıyla imzalanmış VC-JWT ve kamuya açık doğrulama
- Belge iptali, imza kontrolü ve kişisel veri maskeleme
- Katılım, başarı, geri bildirim ve SLA kalite göstergeleri
- Öğrenen geri bildirimi, itiraz başvurusu/kararı ve kullanıcı bildirim kutusu
- Yönetici kullanıcı/rol/aktiflik ve parola yönetimi
- Kamuya açık program kataloğu (`/catalog`) ve servis sağlık kontrolü (`/api/health`)
- Bir önceki kaydın özetini içeren SHA-256 zincirli denetim izi
- Rol tabanlı yetki, Scrypt parola özeti, HttpOnly oturum ve CSRF koruması

## Dizinler

```text
public/        Kurumsal web arayüzü
src/           API, veri modeli, kurallar ve dijital belge servisleri
tests/         Birim ve uçtan uca testler
docs/          Uyum analizi ve üretime geçiş notları
data/          SQLite verisi ve ilk çalıştırmada üretilen kurum anahtarı
storage/       Öğrenme kanıtı dosyaları
```

## Docker ile çalıştırma

```bash
docker compose up -d --build
```

Veriler `kun-myys-data` ve `kun-myys-evidence` birimlerinde kalıcı tutulur.

## V2 uç noktaları

Arayüzdeki yeni V2 akışları şu API gruplarını kullanır: `/api/catalog` (kamu kataloğu), `/api/users` (rol ve parola yönetimi), `/api/notifications` (kişisel bildirim kutusu), `/api/appeals` (itiraz), `/api/evidences` (çıktı kanıtı ve güvenli indirme), `/api/credentials/:id/certificate` (yazdırılabilir belge görünümü) ve `/api/health` (servis sağlık kontrolü). V1 SQLite dosyasıyla başlatıldığında eksik sütunlar otomatik eklenir; kurumsal geçişte yedek alarak temiz V2 veritabanı oluşturulması önerilir.

## Üretime geçiş sınırı

Bu paket çalışan ve test edilmiş bir **kurumsal pilot/MVP**'dir. Aşağıdaki işlemler, üniversitenin gerçek erişim bilgileri ve kurumsal sertifikaları olmadan tamamlanamaz:

- OBS/KAYSİS öğrenci ve transkript aktarımı
- Keycloak/OIDC veya SAML kurumsal SSO
- YÖKSİS/ABAYS başvurusu ve e-Devlet belge servisi
- EBYS ve KamuSM PAdES-LTV imzası
- Moodle/KÜN-UZEM LTI 1.3 sonuç aktarımı
- Europass EDCI elektronik mühür ve uygunluk testi
- KVKK saklama-imha politikalarının kurum kararıyla yapılandırılması

Bu bağlantılar gelene kadar sistem yerel kimlik, SQLite ve kurum içi Ed25519 doğrulamasıyla çalışır. Üretimde SQLite yerine PostgreSQL, dosya sistemi yerine S3/MinIO ve ters vekil üzerinden HTTPS kullanılmalıdır.

## Önemli güvenlik notları

- `data/keys/issuer-ed25519-private.pem` kurumun imza anahtarıdır; yedeklenmeli, erişimi sınırlandırılmalı ve kaynak kod deposuna eklenmemelidir. `data/` ve `storage/` dizinleri `.gitignore` kapsamındadır; bunları depoya eklemeyin.
- Anahtar rotasyonu için `node bin/rotate-keys.js` çalıştırın. Eski açık anahtar `data/keys/retired/` altına taşınır; daha önce imzalanmış belgeler doğrulanmaya devam eder, yeni belgeler yeni anahtarla imzalanır. İmza anahtarı ifşa olduysa rotasyonun ardından eski anahtarla üretilmiş tüm belgeleri gözden geçirin.
- `APP_URL`, kullanıcıya verilen doğrulama bağlantısının alan adıdır; canlı ortamda kesinlikle HTTPS olmalıdır.
- T.C. kimlik/pasaport bilgisi kamuya açık doğrulamada maskelenir ve dijital belge öznesinde doğrudan kullanılmaz.
- Denetim zinciri değişiklikleri görünür kılar; hukuki anlamda değişmez arşiv için zaman damgası/HSM veya WORM depolama eklenmelidir.

Teknik çakıştırma ve düzeltmeler için [docs/uyum-matrisi.md](docs/uyum-matrisi.md), doğrulanan birincil dayanaklar için [docs/kaynaklar.md](docs/kaynaklar.md) dosyasına bakın.
