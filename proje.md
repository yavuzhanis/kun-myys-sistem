# KAPADOKYA ÜNİVERSİTESİ MİKRO YETERLİLİK YÖNETİM SİSTEMİ (KÜN-MYYS)
## Kurumsal Sistem Mimarisi, Mevzuat Uyum Analizi ve Senato Sunum Master Dosyası

---

# İÇİNDEKİLER

1. [Proje Künyesi ve Yönetici Özeti](#1-proje-künyesi-ve-yönetici-özeti)
2. [YÖK 2026 Mikro Yeterlilikler Çerçevesi Uyum Analizi (13 Madde)](#2-yök-2026-mikro-yeterlilikler-çerçevesi-uyum-analizi)
3. [Sistem Mimarisi ve Kriptografik Güvenlik Altyapısı](#3-sistem-mimarisi-ve-kriptografik-güvenlik-altyapısı)
4. [Modüler Fonksiyonel Özellikler ve Ekran Detayları (14 Modül)](#4-modüler-fonksiyonel-özellikler-ve-ekran-detayları)
5. [Rol ve Yetki Matrisi (8 Kurumsal Rol)](#5-rol-ve-yetki-matrisi)
6. [Uçtan Uca Yaşam Döngüsü ve İş Akışı Senaryosu](#6-uçtan-uca-yaşam-döngüsü-ve-iş-akışı-senaryosu)
7. [Canlı Senato & Yönetim Kurulu Sunum Rehberi (Dakika Dakika)](#7-canlı-senato--yönetim-kurulu-sunum-rehberi)
8. [Kurul Soru-Cevap ve Savunma Dosyası (Q&A)](#8-kurul-soru-cevap-ve-savunma-dosyası)
9. [Gelecek Fazlar ve Kurumsal Entegrasyon Yol Haritası](#9-gelecek-fazlar-ve-kurumsal-entegrasyon-yol-haritası)
10. [Canlı Test, Demo Hesapları ve API Referansı](#10-canlı-test-demo-hesapları-ve-api-referansı)

---

# 1. PROJE KÜNYESİ VE YÖNETİCİ ÖZETİ

### 1.1. Proje Künyesi
* **Proje Adı:** Kapadokya Üniversitesi Mikro Yeterlilik Yönetim Sistemi (KÜN-MYYS)
* **Kurum:** Kapadokya Üniversitesi (KÜN)
* **Sürüm:** 2.0.0 Enterprise Edition
* **Mevzuat Dayanağı:** Yükseköğretim Kurulu (YÖK) 2026 Mikro Yeterlilikler Usul ve Esasları, Türkiye Yeterlilikler Çerçevesi (TYÇ), Avrupa Yeterlilikler Çerçevesi (EQF).
* **Standartlar:** W3C Verifiable Credentials 2.0, 1EdTech Open Badges 3.0, YÖK EK-1 JSON Şeması.
* **Geliştirme Felsefesi:** Sıfır dış kütüphane bağımlılığı (Zero external runtime dependencies), yerli ve milli hafif mimari, kriptografik güvenlik.

### 1.2. Yönetici Özeti
Geleneksel yükseköğretim diplomaları, hızla değişen iş gücü piyasasının ve teknolojik dönüşümün ihtiyaç duyduğu anlık ve odaklı becerileri tek başına karşılamakta yetersiz kalmaktadır. Yükseköğretim Kurulu'nun (YÖK) 2026 yılında yürürlüğe koyduğu usul ve esaslar doğrultusunda; kısa süreli, ölçülebilir ve belirli bir iş yüküne dayanan "Mikro Yeterlilikler", üniversitelerin örgün ve uzaktan eğitim programlarında kredilendirilebilir resmi kazanımlar haline gelmiştir.

**KÜN-MYYS**, Kapadokya Üniversitesi'nin bu alandaki tüm akademik, idari, teknik ve mevzuatsal operasyonlarını tek çatı altında toplayan entegre bir platformdur. Sistem iki ana sütun üzerine inşa edilmiştir:
1. **Kamuya Açık Prestij Vitrini (Landing Page & Açık Katalog):** Aday öğrenenlerin, mezunların ve sektörün onaylı programları inceleyebildiği, başvuru yapabildiği ve düzenlenen belgeleri karekodla anında teyit edebildiği kullanıcı dostu portal.
2. **Kurumsal Yönetim Portalı (MYYS App Shell):** Program tasarlamadan 3 kademeli Senato onayına, 25 saat AKTS hesaplama motorundan SHA-256 sınav kanıtı mühürlemeye, Ed25519 imzalı dijital diploma üretiminden değişmez denetim izine (Audit Trail) kadar 14 modülden oluşan tam kapsamlı yönetim paneli.

---

# 2. YÖK 2026 MİKRO YETERLİLİKLER ÇERÇEVESİ UYUM ANALİZİ

KÜN-MYYS, YÖK'ün 13 temel maddelik çerçevesine tam uyumlu olarak algoritmik kontrol mekanizmalarıyla donatılmıştır:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   YÖK 2026 ÇERÇEVESİ VE KÜN-MYYS UYUM MATRİSİ                     │
├────┬──────────────────────────────────┬──────────────────────────────────────────┤
│ No │ YÖK Mevzuat Maddesi              │ KÜN-MYYS Sistem Karşılığı ve Algoritma   │
├────┼──────────────────────────────────┼──────────────────────────────────────────┤
│ 1  │ Kurumsal Tanım ve Kapsam         │ Üniversite senatosu onaylı bağımsız kod. │
│ 2  │ TYÇ ve EQF Seviyelendirmesi      │ Seviye 3-8 otomatik seviye doğrulaması.  │
│ 3  │ 25 Saat = 1 AKTS Zorunluluğu     │ Katı tam kat kontrolü (Mod 25 = 0).      │
│ 4  │ Bloom Taksonomisi Çıktıları      │ 6 Bilişsel basamak + Ölçme matrisi.      │
│ 5  │ Ölçme-Değerlendirme Güvencesi    │ Yüz yüze/online gözetimli sınav türleri. │
│ 6  │ Kanıt Temelli Kayıt Zinciri      │ SHA-256 dosya/link hash mühürleme.       │
│ 7  │ 30 Günlük Karar SLA'sı           │ Canlı geri sayım sayacı + Kırmızı alarm. │
│ 8  │ 3 Kademeli Onay Zinciri          │ Birim Kurulu ➔ Komisyon ➔ Senato.        │
│ 9  │ %10 Diploma Tanıma Üst Sınırı    │ Diploma AKTS'sinin azami %10 kontrolü.   │
│ 10 │ %50 Uzaktan Eğitim Sınırı        │ Transfer setinde uzaktan oran denetimi.  │
│ 11 │ 11 Zorunlu Bilgi Alanı (EK-1)    │ YÖK EK-1 JSON otomatik çıktı motoru.     │
│ 12 │ Güvenli Dijital Belgelendirme    │ Ed25519 W3C VC 2.0 & Open Badges 3.0.    │
│ 13 │ Değişmez Denetim Kütüğü (Audit)  │ Blok zinciri benzeri SHA-256 kütük zinciri│
└────┴──────────────────────────────────┴──────────────────────────────────────────┘
```

### 2.1. Madde Detayları ve Sistemsel Güvenceler:

* **Katı 25 Saat Kuralı:** YÖK mevzuatına göre 1 AKTS tam olarak 25 saatlik öğrenen iş yüküne karşılık gelmek zorundadır. Sistemde koordinatör ders tasarlarken Teorik, Pratik, Laboratuvar, Bireysel Çalışma, Proje ve Sınav Hazırlığı saatlerini girer. Toplam iş yükü 25'in tam katı değilse (örneğin 48 saat) sistem programın onaya gönderilmesini yazılımsal olarak engeller ve *"48 saat geçerli bir AKTS üretmez (50 saat = 2 AKTS olmalıdır)"* uyarısı verir.
* **30 Günlük Yasal Karar Süresi:** Bir program teklifi veya öğrenci intibak başvurusu yapıldığında sistem otomatik olarak `decision_due_at = CURRENT_TIMESTAMP + 30 gün` atar. Her kurulun onay ekranında kalan gün sayısı yeşil/turuncu/kırmızı sayaçlarla gösterilir; 30 günü aşan dosyalar Kalite Paneline *"Kritik SLA Aşımı"* olarak bildirilir.
* **%10 ve %50 Tanıma Kuralları (Madde 9):** Dış kurumdan veya KÜN'den alınan mikro yeterliliklerin bir önlisans (120 AKTS), lisans (240 AKTS) veya yüksek lisans (90/120 AKTS) diplomasına sayılması aşamasında; diploma kredilerinin azami %10'u kadar intibak yapılabilir. Ayrıca saydırılacak mikro yeterlilikler içerisindeki uzaktan eğitim oranı %50'yi aşamaz. Bu kurallar intibak modülünde otomatik hesaplanır ve aşım durumunda başvuru otomatik reddedilir.

---

# 3. SİSTEM MİMARİSİ VE KRİPTOGRAFİK GÜVENLİK ALTYAPISI

### 3.1. Mimari Prensipler
* **Sıfır Harici Çalışma Bağımlılığı (Zero-Dependency):** Sistem, Node.js yerleşik modülleri (`node:http`, `node:crypto`, `node:sqlite`, `node:fs`) üzerinde geliştirilmiştir. Harici `npm` paketlerine (Express, TypeORM, Prisma, Axios vb.) bağımlı olmadığı için üçüncü parti güvenlik açıkları (supply-chain vulnerabilities) barındırmaz ve bakım maliyeti sıfırdır.
* **Veritabanı Motoru:** Node.js yerel SQLite motoru (`node:sqlite` `DatabaseSync`) ile WAL (Write-Ahead Logging) modunda çalışır. Yüksek eşzamanlılık, ACID güvencesi ve ultra-hızlı sorgulama sunar.

### 3.2. Kriptografik İmza ve Standartlar
```
┌────────────────────────────────────────────────────────────────────────┐
│             KÜN-MYYS KRİPTOGRAFİK İMZA VE DOĞRULAMA AKIŞI              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │     Ed25519 Asimetrik Anahtar Çifti (256-bit Eliptik)   │
       │     Özel Anahtar (Kurum İçi Güvenli) / Açık Anahtar     │
       └────────────────────────────┬────────────────────────────┘
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │             W3C VERIFIABLE CREDENTIALS 2.0              │
       │  • DataIntegrityProof (`eddsa-jcs-2022`)                │
       │  • RFC 8785 JSON Canonicalization Scheme (JCS)          │
       │  • did:web:kapadokya.edu.tr Merkeziyetsiz Kimlik        │
       └────────────────────────────┬────────────────────────────┘
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │              1EdTech OPEN BADGES 3.0                    │
       │  • OpenBadges JSON-LD Metadata Şeması                   │
       │  • Dijital Rozet Görseli & LinkedIn / EU Wallet         │
       └────────────────────────────┬────────────────────────────┘
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │                 YÖK 2026 EK-1 JSON ŞEMASI               │
       │  • 11 Zorunlu Bilgi Alanı + 24 Haneli Doğrulama Kodu    │
       │  • Kamusal Sorgulama: `/verify/:verification_code`      │
       └─────────────────────────────────────────────────────────┘
```

1. **Ed25519 Asimetrik İmzalama:** RSA'ya kıyasla çok daha hızlı, 256-bit eliptik eğri güvenliğine sahip Ed25519 algoritması kullanılır. Kapadokya Üniversitesi'nin kurumsal DID (`did:web:kapadokya.edu.tr`) adresi üzerinden imzalanır.
2. **RFC 8785 JSON Canonicalization (JCS):** Veri bütünlüğü doğrulanırken JSON anahtarları alfabetik olarak deterministik biçimde sıralanır; böylece farklı platformlar arasında imza bozulması yaşanmaz.
3. **Değişmez Denetim İzi (SHA-256 Hash Chain):** Veritabanındaki `audit_logs` tablosunda gerçekleşen her işlem, bir önceki işlemin hash kodunu (`previous_hash`) girdi alarak yeni bir blok özeti (`hash_chain`) üretir:
   $$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \text{Actor} + \text{Action} + \text{Payload} + \text{Timestamp})$$
   Veritabanı yöneticisi dahi geriye dönük bir notu veya onay kaydını değiştirmeye kalktığında zincir kırılır ve Kalite panelinde *"Audit Integrity Mismatch at Record #ID"* alarmı verilir.

---

# 4. MODÜLER FONKSİYONEL ÖZELLİKLER VE EKRAN DETAYLARI

KÜN-MYYS, 14 entegre modülden oluşmaktadır:

```
┌────────────────────────────────────────────────────────────────────────┐
│                     KÜN-MYYS 14 FONKSİYONEL MODÜL                      │
├───────────────────┬────────────────────────────────────────────────────┤
│ 1. Kamusal Vitrin │ Açık katalog, YÖK 4 adım, örnek belge, SSS.        │
│ 2. Genel Bakış    │ Role özel metrikler, bekleyen işler, KPI halkası.  │
│ 3. Bildirimler    │ SLA uyarıları, karar bildirimleri, tebrik mesajı.  │
│ 4. Kullanıcılar   │ 8 kurumsal rol, aktif/pasif yönetimi, güvenlik.    │
│ 5. Programlar     │ 25 saat AKTS hesaplama, Bloom çıktıları, matris.   │
│ 6. Onay Akışları  │ Birim Kurulu ➔ Komisyon ➔ Senato onay zinciri.     │
│ 7. Eğitim Dönemi  │ Kontenjan, yüz yüze/online/hibrit, eğitici, ücret. │
│ 8. Öğrenenler     │ Toplu Excel yükleme, devam %, başarı puanı, harf.  │
│ 9. Kanıt Zinciri  │ SHA-256 mühürlü sınav/proje/rubrik kanıt dosyası.  │
│ 10. Dış Kazanım   │ YÖK Madde 9 intibak (%10 AKTS ve %50 uzaktan test).│
│ 11. İtirazlar     │ 30 günlük öğrenen itirazı ve komisyon incelemesi.  │
│ 12. Belgeler      │ Çift dilli A4 resmi diploma + Yazdır/PDF kaydet.   │
│ 13. Doğrulama     │ Kamuya açık karekod ve kod sorgulama motoru.       │
│ 14. Kalite & KİDR │ Memnuniyet ortalaması, SLA grafiği, CSV dışa aktar.│
└───────────────────┴────────────────────────────────────────────────────┘
```

### Modül Açıklamaları:

* **Modül 1 (Kamusal Vitrin - Landing Page):** Prestijli açık tema (KÜN Bordo `#721b36`, Altın `#c49b55` ve Beyaz kartlar). Öğrenene sürecin nasıl işleyeceğini anlatan 4 adımlı yol haritası, canlı onaylı programlar kataloğu, interaktif belge sorgulama kutusu ve kurumsal giriş butonu.
* **Modül 2 (Role Özel Dashboard):** Öğrenci girdiğinde kendi eğitim ve belgelerini; Koordinatör girdiğinde taslaklarını ve kontenjan doluluğunu; Senato girdiğinde onay bekleyen teklifleri; Kalite girdiğinde akreditasyon grafiklerini gösteren dinamik pano.
* **Modül 5 (Program Tasarımı & Bilgi Paketi):** Bloom Taksonomisi (Hatırlama, Anlama, Uygulama, Analiz, Değerlendirme, Yaratma) düzeyinde öğrenme çıktıları tanımlama. Çıktıların ölçme yöntemleriyle (Yazılı Sınav, Proje, Rubrik vb.) eşleştirildiği birebir matris motoru.
* **Modül 8 (Toplu Öğrenen Kaydı & Notlandırma):** Tek tek ekleme yerine `Ad Soyad, E-posta, T.C. Kimlik No` formatında sınıf listesini kopyalayıp yapıştırarak tek tıkla 100 kişiyi kaydetme. Devam oranı (%80 barajı) ve not girişine göre harf notu üretimi.
* **Modül 12 (Resmi Baskıya Hazır Sertifika):** Kapadokya Üniversitesi kurumsal arması, çift dilli (*Türkçe / İngilizce*) resmi metin, Ed25519 güvenlik mührü, dinamik doğrulama karekodu ve `@media print` A4 yatay baskı uyumluluğu.
* **Modül 14 (Kalite Göstergeleri & CSV Dışa Aktarma):** YÖKAK Kurum İç Değerlendirme Raporu (KİDR) için tamamlama oranları, öğrenen memnuniyeti (5 üzerinden puan), program bazlı başarı dağılımı ve tek tıkla Excel/CSV indirme.

---

# 5. ROL VE YETKİ MATRİSİ

Sistemde RBAC (Role-Based Access Control) mimarisiyle yapılandırılmış 8 kurumsal rol bulunmaktadır:

| Kurumsal Rol | Sistem Kodu | Görev ve Yetki Alanı |
| :--- | :--- | :--- |
| **Sistem Yöneticisi** | `ADMIN` | Kullanıcı oluşturma, rol atama, sistem sağlık takibi, tüm modüllere tam erişim. |
| **Program Koordinatörü** | `COORDINATOR` | Yeni mikro yeterlilik tasarlama (25h kuralı), bilgi paketi hazırlama, eğitim dönemi açma. |
| **Akademik Birim Kurulu** | `UNIT_BOARD` | Fakülte/Bölüm düzeyinde 1. kademe mevzuat, içerik ve iş yükü uygunluk onayı. |
| **Mikro Yeterlilik Komisyonu** | `COMMISSION` | Üniversite düzeyinde 2. kademe akreditasyon, standartlar ve intibak uygunluk incelemesi. |
| **Üniversite Senatosu** | `SENATE` | 3. Kademe nihai senato onay kararı, dijital belge imzalama yetkisi ve belge iptal etme. |
| **Ölçme ve Değerlendirici** | `EVALUATOR` | Öğrenenlerin devam durumunu girme, sınav/proje puanlama ve SHA-256 kanıt yükleme. |
| **Kalite Güvencesi** | `QUALITY` | Öğrenen memnuniyeti, YÖKAK tamamlama oranları, SLA denetimi ve Denetim İzi kontrolü. |
| **Öğrenen (Öğrenci)** | `STUDENT` | Açık programlara başvurma, kayıtlı olduğu eğitimleri ve belgelerini izleme, geri bildirim verme. |

---

# 6. UÇTAN UCA YAŞAM DÖNGÜSÜ VE İŞ AKIŞI SENARYOSU

Bir mikro yeterliliğin tasarlanmasından mezunun dijital cüzdanına girmesine kadar geçen 8 aşamalı yaşam döngüsü:

```
[1. TASARIM]
Koordinatör 25 saat katı iş yükü, Bloom çıktıları ve ölçme matrisi ile programı hazırlar.
     │
     ▼
[2. BİRİM KURULU ONAYI] (Azami 30 Gün SLA)
Akademik Birim Kurulu teklifi inceler ve uygun bularak Komisyona sevk eder.
     │
     ▼
[3. KOMİSYON İNCELEMESİ]
Mikro Yeterlilik Komisyonu kalite ve YÖK standartlarını denetleyip Senatoya sunar.
     │
     ▼
[4. SENATO ONAYI & RESMİYET]
Üniversite Senatosu programı onaylar; program kamuya açık vitrinde ve katalogda yayına girer.
     │
     ▼
[5. EĞİTİM DÖNEMİ & KAYIT]
Koordinatör eğitim dönemi açar; öğrenciler ve dış katılımcılar kontenjana kaydolur.
     │
     ▼
[6. EĞİTİM, ÖLÇME & KANIT GİRİŞİ]
Dersler tamamlanır; Değerlendirici devam ve notları girip SHA-256 sınav kanıtlarını yükler.
     │
     ▼
[7. ED25519 İLE BELGE DÜZENLEME]
Senato yetkilisi başarılı öğrenenler için W3C VC 2.0 ve Open Badges 3.0 belgesini imzalar.
     │
     ▼
[8. DOĞRULAMA & AKTS İNTİBAKI]
Öğrenci belgesini LinkedIn'e ekler; üniversitesine sunarak 30 günde transkriptine AKTS saydırır.
```

---

# 7. CANLI SENATO & YÖNETİM KURULU SUNUM REHBERİ

Kurula sunum yaparken slayt okumak yerine **doğrudan canlı sistem (`http://127.0.0.1:8080/`)** üzerinden, üst çubuktaki `⚡ ROL:` menüsü ile rolleri canlı değiştirerek ilerleyiniz.

### ⏱ 10 DAKİKALIK DETAYLI SUNUM PLANI

#### DAKİKA 00:00 - 01:30 | Giriş ve Kamusal Vitrin Deneyimi
* **Ekranda Yapılacak:** Tarayıcıda `http://127.0.0.1:8080/` açılır (Açık tema kurumsal vitrin görünür).
* **Konuşmacı Sözleri:**
  > *"Sayın Rektörüm, Değerli Senato Üyeleri;*
  > 
  > *YÖK'ün 2026 yılı Mikro Yeterlilikler Çerçevesi ile yükseköğretimde esnek ve kredilendirilebilir eğitim modeli resmiyet kazanmıştır. Bugün Kapadokya Üniversitesi'ni Türkiye'de bu dönüşümün lideri yapacak KÜN Mikro Yeterlilik Yönetim Sistemi'ni (KÜN-MYYS) takdim ediyorum.*
  > 
  > *Şu an ekranda gördüğünüz arayüz, tıpkı Bahçeşehir Üniversitesi'nin BAU GO platformunda olduğu gibi üniversitemize yakışan prestijli, açık temalı vitrinimizdir. Öğrenenler burada YÖK'ün 4 adımlı sürecini, senatomuzun onayladığı güncel program kataloğunu ve karekodlu belge doğrulama motorunu inceleyebilmektedir."*

---

#### DAKİKA 01:30 - 03:30 | Program Tasarımı ve Katı 25 Saat Kuralı
* **Ekranda Yapılacak:** Sağ üstten **Kurumsal Giriş** yapın ➔ Üstteki `⚡ ROL:` menüsünden **Koordinatör** rolünü seçin ➔ Sol menüden **Program Tasarımı** sekmesine tıklayın.
* **Konuşmacı Sözleri:**
  > *"Sistemimizin en kritik güvencesi, YÖK mevzuatını kod seviyesinde zorunlu kılmasıdır. YÖK'ün en temel şartı: Her 1 AKTS tam 25 saatlik iş yüküne denk gelmelidir.*
  > 
  > *Koordinatör hocamız yeni bir program tasarlarken teorik saat, atölye, laboratuvar ve bireysel çalışma saatlerini girdiğinde sistem canlı toplar. 25'in tam katı olmayan (örneğin 48 saat olan) hiçbir taslağın kurullara sunulmasına sistem izin vermez.*
  > 
  > *Ayrıca Bloom taksonomisi basamaklarındaki öğrenme çıktıları ile yazılı sınav veya proje gibi ölçme yöntemleri birebir eşleştirilmeden teklif tamamlanamaz."*

---

#### DAKİKA 03:30 - 05:30 | 30 Günlük Karar SLA'sı ve Senato Onay Zinciri
* **Ekranda Yapılacak:** Üst çubuktan sırasıyla **Birim Kurulu** ➔ **Komisyon** ➔ **Senato** rollerine geçiş yapın ve onay kuyruklarını gösterin.
* **Konuşmacı Sözleri:**
  > *"YÖK mevzuatındaki 30 günlük yasal karar süresi, sistemimizde canlı bir SLA sayacı ile takip edilir. Karar süresi yaklaşan veya aşan dosyalar doğrudan Kalite Paneline kırmızı alarm olarak yansır.*
  > 
  > *Teklif sırasıyla Akademik Birim Kurulu'ndan geçer, Mikro Yeterlilik Komisyonu tarafından akreditasyon süzgecinden geçirilir ve nihai olarak Üniversite Senatomuzun onayına sunulur. Senato uygun bulursa onaylar veya gerekçesiyle revizyon talep eder."*

---

#### DAKİKA 05:30 - 07:00 | Not Girişi ve SHA-256 Mühürlü Kanıt Zinciri
* **Ekranda Yapılacak:** Üstten **Değerlendirici** rolüne geçin ➔ Sol menüden **Öğrenenler ve Başarı** sekmesini açın ➔ Bir öğrencinin not girişi ve kanıt yükleme ekranını açın.
* **Konuşmacı Sözleri:**
  > *"YÖKAK akreditasyon denetimlerinin kalbi kanıta dayalı ölçmedir. Değerlendirici hocamız öğrencinin devam oranını ve başarı notunu girdiğinde; öğrencinin sınav kağıdı veya proje raporu linkini yükler.*
  > 
  > *Sistem bu kanıt dosyasını anında SHA-256 kriptografik özetiyle mühürler. Böylece öğrencinin o krediyi gerçekten hak ettiği, uluslararası denetim standartlarında tahrif edilemez bir kanıtla güvenceye alınır."*

---

#### DAKİKA 07:00 - 08:30 | Ed25519 İmzalı Dijital Diploma & Karekod Doğrulama
* **Ekranda Yapılacak:** Üstten **Senato** rolüne geçin ➔ **Dijital Belgeler** sekmesini açın ➔ Ayşe Örnek adına düzenlenmiş belgeye tıklayın ve **"📜 Resmi Görünüm"** butonuna basın.
* **Konuşmacı Sözleri:**
  > *"Eğitimi başarıyla tamamlayan öğrenen için Senato yetkisiyle Ed25519 dijital imzalı belge üretilir.*
  > 
  > *1. **Resmi Sertifika:** Gördüğünüz gibi çift dilli (Türkçe/İngilizce), Kapadokya Üniversitesi kurumsal armalı ve altın çerçeveli A4 resmi diplomamız baskıya ve PDF indirmeye hazırdır.*
  > *2. **Uluslararası Standart:** Bu belge sıradan bir görsel değildir. Arkasında W3C Verifiable Credentials ve Open Badges 3.0 dijital imzası bulunur. Öğrenci tek tıkla LinkedIn profiline veya AB Dijital Kimlik Cüzdanına ekleyebilir.*
  > *3. **Kamusal Doğrulama:** Belgedeki 24 haneli kodu vitrindeki arama kutusuna yapıştırdığımızda sunucumuz anında '✓ Ed25519 İmzası Doğrulandı' teyidini üretmektedir."*

---

#### DAKİKA 08:30 - 10:00 | YÖK Madde 9 Sınırları ve Değişmez Denetim İzi
* **Ekranda Yapılacak:** Üstten **Kalite** rolüne geçin ➔ **Dış Kazanım Tanıma** ve **Denetim İzi** sekmelerini gösterin.
* **Konuşmacı Sözleri:**
  > *"Sistemimiz YÖK Madde 9 kapsamında bir öğrencinin diploma programında azami %10 AKTS sayılmasına ve uzaktan eğitim oranının %50'yi aşmamasına otomatik bekçilik eder.*
  > 
  > *Son olarak 'Denetim İzi' ekranımızda, kurumumuzda yapılan her işlem (kim, ne zaman, hangi notu veya kararı değiştirdi) blok zinciri mantığıyla birbirine bağlı SHA-256 hash zincirinde saklanır. Geriye dönük hiçbir kayıt silinemez veya manipüle edilemez.*
  > 
  > *KÜN-MYYS; üniversitemizin akademik saygınlığını, öğrenci memnuniyetini ve uluslararası görünürlüğünü en üst düzeye taşıyacak eksiksiz bir sistemdir. Teşekkür ederim."*

---

# 8. KURUL SORU-CEVAP VE SAVUNMA DOSYASI (Q&A)

Kurul üyelerinden (Rektör, Senatörler, Dekanlar, Kalite Komisyonu Başkanı, Bilgi İşlem Daire Başkanı) gelebilecek 8 zor soru ve hazır teknik yanıtlar:

### Soru 1: "Bu sistemi mevcut OBS (Öğrenci Bilgi Sistemi) veya Moodle/Canvas ile nasıl konuşturacağız?"
* **Cevabınız:** *"KÜN-MYYS tamamen RESTful API ve JSON standartlarında inşa edilmiştir. Bilgi İşlem Dairemiz mevcut Öğrenci Bilgi Sistemimize (OBS) veya LMS platformumuza webhook ve API servisleri üzerinden 2-3 iş günü içerisinde kolaylıkla entegre edebilir. Öğrencinin OBS transkriptine notlar ve muafiyetler tek tıkla aktarılabilir."*

### Soru 2: "YÖKAK kurumsal akreditasyon denetiminde bize somut faydası ne olacak?"
* **Cevabınız:** *"YÖKAK denetimlerinde en çok aranan ölçütler; ölçme-değerlendirmenin kanıta dayalı olması, paydaş memnuniyeti ve süreç şeffaflığıdır. KÜN-MYYS; SHA-256 kanıt zinciri, değişmez denetim izi kütüğü ve otomatik kalite raporlama paketi sayesinde akreditasyon denetimlerinde kurumumuza tam puan kazandıracaktır."*

### Soru 3: "KVKK (Kişisel Verilerin Korunması Kanunu) açısından kamuya açık doğrulamada risk var mı?"
* **Cevabınız:** *"Kesinlikle hayır. Kamuya açık `/verify/:code` ekranında KVKK hükümleri uyarınca öğrenen isimleri otomatik olarak maskelenir (`A*** Ö***`). T.C. Kimlik numarası veya e-posta adresi asla kamuya açılmaz; buna rağmen Ed25519 kriptografik imzası sayesinde belgenin sahte olmadığı matematiksel olarak teyit edilir."*

### Soru 4: "Sistemin üniversitemize ek bir sunucu veya lisans maliyeti var mıdır?"
* **Cevabınız:** *"Sistem sıfır dış bağımlılık felsefesiyle geliştirilmiş, tamamen yerli ve hafiftir. Node.js ve dahili SQLite motoru kullandığı için harici pahalı veritabanı lisansları veya yüksek kapasiteli sunucular gerektirmez; üniversitemizin mevcut sanal sunucularında sıfır maliyetle çalışır."*

### Soru 5: "Bir programda 30 günlük yasal karar süresi aşılırsa ne olur?"
* **Cevabınız:** *"Sistemde her aşama için canlı SLA sayacı devrededir. Süre 25. güne geldiğinde ilgili kurula sarı hatırlatma bildirimi, 30. gün dolduğunda ise Senato ve Kalite paneline kırmızı 'Kritik Gecikme' alarmı iletilir. Süreçlerin sürüncemede kalması imkansızdır."*

### Soru 6: "Öğrenci bu belgeyi yurt dışındaki bir üniversiteye veya şirkete nasıl kabul ettirecek?"
* **Cevabınız:** *"Belgelerimiz Avrupa Yeterlilikler Çerçevesi (EQF) seviyesi taşımakta olup W3C Verifiable Credentials ve Open Badges 3.0 küresel standartlarındadır. Yurt dışındaki bir kurum veya işveren, belgedeki karekodu okuttuğunda uluslararası standartta kriptografik doğrulamayı anında görür; ayrıca öğrenci belgeyi Avrupa Birliği Dijital Kimlik Cüzdanına doğrudan aktarabilir."*

### Soru 7: "Dış kurumlardan alınan mikro yeterliliklerin transferinde sahteciliği nasıl önlüyoruz?"
* **Cevabınız:** *"Dış Kazanım Tanıma modülümüz, dışarıdan gelen belgenin doğrulanabilir URL adresini ve SHA-256 dijital özetini zorunlu kılar. İlgili intibak komisyonu doğrulanmamış hiçbir belgeyi onaylayamaz."*

### Soru 8: "Bahçeşehir (BAU GO) veya diğer üniversitelerden farkımız nedir?"
* **Cevabınız:** *"Bahçeşehir Üniversitesi'nin BAU GO platformu şu anda yalnızca bir ön yüz/vitrindir; arka planda henüz onaylanan programları ve çalışan bir senato karar mekanizması bulunmamaktadır. KÜN-MYYS ise hem vitrini hem de arkasında Senato onay zinciri, 25 saat motoru, kanıt mühürleme ve W3C dijital diplomayı barındıran Türkiye'deki tek eksiksiz hibrit sistemdir."*

---

# 9. GELECEK FAZLAR VE KURUMSAL ENTEGRASYON YOL HARİTASI

Kurul onayının ardından planlanan 3 aşamalı kurumsal entegrasyon takvimi:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   KURUMSAL ENTEGRASYON YOL HARİTASI                    │
├───────────┬────────────────────────────────────────────────────────────┤
│ FAZ 1     │ Kurumsal SSO: `@kapadokya.edu.tr` Google/Microsoft 365.    │
│ (1. Ay)   │ Toplu E-posta & SMS SLA uyarı bildirim servisleri.         │
├───────────┼────────────────────────────────────────────────────────────┤
│ FAZ 2     │ OBS (Öğrenci Bilgi Sistemi) & Moodle/Canvas LTI Entegrasyonu│
│ (2. Ay)   │ Otomatik not senkronizasyonu ve muafiyet transkript kaydı. │
├───────────┼────────────────────────────────────────────────────────────┤
│ FAZ 3     │ YÖKSİS Ulusal Mikro Yeterlilik Veritabanı ve               │
│ (3. Ay)   │ e-Devlet Barkodlu Belge Doğrulama Servis Entegrasyonu.     │
└───────────┴────────────────────────────────────────────────────────────┘
```

---

# 10. CANLI TEST, DEMO HESAPLARI VE API REFERANSI

### 10.1. Canlı Erişim ve Test Bilgileri
* **Yerel Sunucu Adresi:** `http://127.0.0.1:8080/`
* **Ortak Demo Parolası:** `Kun2026!`

| Rol | Demo E-Posta Adresi | Yetki ve Sorumluluk Alanı |
| :--- | :--- | :--- |
| **Sistem Yöneticisi** | `admin@kapadokya.edu.tr` | Kurumsal yönetim, tüm kullanıcılar ve makro KPI'lar |
| **Program Koordinatörü** | `koordinator@kapadokya.edu.tr` | Yeni program tasarlama (25h kuralı) ve eğitim dönemi açma |
| **Akademik Birim Kurulu** | `birim@kapadokya.edu.tr` | 1. Kademe müfredat, mevzuat ve iş yükü onayı |
| **Mikro Yeterlilik Komisyonu** | `komisyon@kapadokya.edu.tr` | 2. Kademe akreditasyon ve içerik kalitesi inceleme/onayı |
| **Üniversite Senatosu** | `senato@kapadokya.edu.tr` | 3. Kademe nihai senato kararı ve Ed25519 dijital imza yetkisi |
| **Ölçme ve Değerlendirici** | `degerlendirici@kapadokya.edu.tr` | Öğrenen devam/not girişi ve SHA-256 sınav kanıtı yükleme |
| **Kalite Güvencesi** | `kalite@kapadokya.edu.tr` | Memnuniyet takibi, YÖKAK tamamlama oranları ve Denetim İzi |
| **Öğrenen (Öğrenci)** | `ogrenci@kapadokya.edu.tr` | Eğitim takibi, başarı notu görüntüleme, belge alma ve geri bildirim |

### 10.2. Temel REST API Endpoint Referansı
* `GET  /api/catalog` — Kamuya açık senato onaylı program kataloğu
* `POST /api/auth/login` — Kurumsal rol tabanlı güvenli oturum açma
* `GET  /api/dashboard` — Role özel kişiselleştirilmiş pano metrikleri
* `GET  /api/programs` — Mikro yeterlilik program listesi ve onay durumları
* `POST /api/programs` — 25 saat ve Bloom taksonomisi kontrollü program oluşturma
* `POST /api/programs/:id/approve` — Birim / Komisyon / Senato kademeli onay işlemi
* `GET  /api/offerings` — Açık ve devam eden eğitim dönemleri
* `POST /api/enrollments` — Öğrenen kaydı ve toplu veri içe aktarma
* `PATCH /api/enrollments/:id/result` — Devam ve başarı notu girişi
* `POST /api/evidences` — SHA-256 mühürlü sınav/proje kanıtı yükleme
* `POST /api/credentials/issue` — Ed25519 dijital imzalı W3C/Open Badges belgesi düzenleme
* `GET  /api/credentials/:id/certificate` — Baskıya hazır resmi çift dilli A4 sertifika
* `GET  /api/verify/:verification_code` — Kamuya açık W3C ve Ed25519 imza doğrulama servisi
* `GET  /api/quality` — YÖKAK akreditasyon metrikleri ve tamamlama oranları
* `GET  /api/audit` — SHA-256 değişmez denetim zinciri doğrulama servisi

---

*Bu doküman, Kapadokya Üniversitesi Rektörlüğü, Üniversite Senatosu ve Kalite Komisyonu Brifingi için hazırlanmış resmi Master Proje Dosyasıdır.*
