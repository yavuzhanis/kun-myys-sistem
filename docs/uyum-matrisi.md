# Araştırma–Dosya Çakıştırma ve Uyum Matrisi

Bu belge, eklenen iki teknik dokümandaki önerilerin YÖK'ün 2026 tarihli **Yükseköğretim Kurumlarında Mikro Yeterlilikler Çerçevesine İlişkin Usul ve Esaslar**, Avrupa mikro yeterlilik yaklaşımı ve güncel dijital belge standartlarıyla karşılaştırılması sonucunda alınan uygulama kararlarını açıklar.

## Düzeltilen kritik noktalar

| Konu | Ek dosyalardaki yaklaşım | Uygulamadaki karar |
|---|---|---|
| Resmî metnin adı | “Tanınması, Akreditasyonu ve Kredilendirilmesi…” şeklinde farklı ad kullanılmış | Resmî başlık esas alındı: “Yükseköğretim Kurumlarında Mikro Yeterlilikler Çerçevesine İlişkin Usul ve Esaslar” |
| TYÇ düzeyi | 4–8 aralığı önerilmiş | YÖK metnindeki yükseköğretim düzeyleri olan 5, 6, 7 ve 8 kullanıldı |
| AKTS | Toplam saat / 25 | Aynı kural uygulandı; taslakta kesirli değer gösterilir, onaya gönderimde 25'in tam katı zorunludur |
| %10 sınırı | Diploma toplam AKTS'sinin %10'u | Aynı kural başvuruda ve kararda yeniden hesaplanır |
| %50 uzaktan sınırı | Uzaktan AKTS toplamı üzerinden yorumlanmış | Resmî metindeki “mikro yeterlilik eğitimlerinin en fazla %50'si” ifadesi nedeniyle kredi değil **eğitim sayısı** üzerinden hesaplandı |
| 30 günlük süre | Dört aşamanın toplam SLA'sı | Eksiksiz program açma başvurusunun gönderildiği tarihten nihai karara kadar ortak son tarih olarak uygulandı |
| EK-1 alanları | Kimlik, QR, belge numarası ve imza temel 11 alan gibi sıralanmış | Resmî EK-1'deki 11 alan aynen saklandı. QR/numara/doğrulama bağlantısı ek bilgi olarak tutuldu |
| Dijital imza | `hash_hmac` sonucu “Ed25519Signature2020” adıyla sunulmuş | HMAC kaldırıldı; Node `crypto` ile gerçek Ed25519 anahtar çifti, veri bütünlüğü kanıtı ve EdDSA VC-JWT üretildi |
| Öğrenen kimliği | T.C. kimlikten `did:key` üretilmiş | Geçersiz DID ve kişisel veri sızıntısı engellendi; T.C./e-posta birleşiminin SHA-256 özetiyle kurum içi özne URN'i üretildi |
| JSON-LD bağlamları | Markdown bağlantıları JSON içine girmiş ve ELM/OB/VC tek bağlamda karıştırılmış | Geçerli URL'ler kullanıldı; Open Badge ve genel W3C VC ayrı çıktılar olarak üretildi |
| Europass uyumu | ELM bağlamı eklemenin tek başına uyum sağladığı varsayılmış | EDCI/ELM ihracı kurumsal elektronik mühür ve uygunluk testi gerektiren ayrı üretim adaptörü olarak konumlandırıldı |
| Denetim izi | Normal veritabanı tablosu “değişmez” kabul edilmiş | Her kayıt önceki özetle zincirlendi. Gerçek değişmezlik için WORM/HSM/zaman damgası üretim gereksinimi olarak belirtildi |

## YÖK EK-1 alanlarının yazılımdaki karşılığı

| YÖK alanı | Sistem alanı |
|---|---|
| Öğrenenin kimliği | `learner_identity` |
| Mikro yeterlilik eğitiminin adı | `micro_credential_title` |
| Sertifikayı veren kurum | `awarding_body` |
| Sertifika tarihi | `issue_date` |
| Öğrenme çıktıları | `learning_outcomes[]` |
| Kavramsal iş yükü (AKTS) | `notional_workload.total_hours`, `notional_workload.ects` |
| Yeterlilik düzeyi | `level.tyc`, `level.eqf` |
| Ölçme ve değerlendirmenin türü/yöntemi | `assessment[]` |
| Öğrenme etkinliğine katılım şekli | `participation_form` |
| Başarı kriterleri | `success_criteria` |
| Kalite güvencesi yaklaşımı/mekanizmaları | `quality_assurance` |

## Onay durumu makinesi

```text
DRAFT / REJECTED
  -> SUBMITTED              Akademik Birim Kurulu
  -> UNIT_APPROVED          Mikro Yeterlilik Komisyonu
  -> COMMISSION_APPROVED    Üniversite Senatosu
  -> SENATE_APPROVED        Eğitim açılabilir
```

Her karar; karar veren kişi, rol, tarih, gerekçe, IP ve önceki/sonraki durumla denetim izine eklenir. Ret veya revizyon kararı programı koordinatöre döndürür.

V2’de denetim zinciri baş/önceki özet alanlarıyla yeniden hesaplanabilir; kalite ve denetim ekranları zincir bütünlüğünü raporlar. Başarı sonucu, devam (%80), puan (60) ve programdaki tüm öğrenme çıktılarının kanıt kapsamı birlikte sağlanmadan `COMPLETED` durumuna alınamaz.

## Bilinçli olarak dış entegrasyona bırakılanlar

Sistem dışındaki yetkili bir kuruluş veya gizli anahtar gerektiği için aşağıdaki başlıklar sahte entegrasyonla taklit edilmemiştir:

- YÖKSİS/ABAYS ve e-Devlet servis çağrıları
- Kurumsal OBS/KAYSİS transkript yazma işlemi
- KamuSM nitelikli elektronik sertifika ve PAdES-LTV
- Europass EDCI elektronik mühür ve cüzdana teslim
- Kurumsal Keycloak/SAML kullanıcı dizini
- Moodle/KÜN-UZEM LTI 1.3 not defteri senkronizasyonu

Bu bağlantılar için API sözleşmeleri ve test ortamı sağlandığında çekirdek veri modeli değişmeden adaptör eklenebilir.
