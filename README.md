# Envanter

İki ayrı akış vardır:

- **`index.html` — katılımcı:** dört envanteri doldurur, sonuçlarını linkle paylaşır veya yalnızca kimlik bilgileri ve 137 cevabını içeren Excel’i indirir. Excel dosyasında sonuç grafikleri, değerlendirme sayfaları ve puanlar bulunmaz.
- **`analiz-982429.html` — yönetici:** repodaki iki boş şablonu otomatik yükler; yönetici katılımcı dosyalarını seçer. Bireysel değerlendirmeleri tek tek veya ZIP olarak, ekip analizini özgün formatında Excel olarak indirir.

## Sonuçları linkle paylaşma

Katılımcı son adımda **Paylaşım linkini kopyala** düğmesini kullanabilir. **Parola (isteğe bağlı)** boş bırakılırsa linki bilen herkes sonuçları açar; parola girilirse alıcı aynı parolayı girmelidir. Parola linkte veya tarayıcı kaydında tutulmaz, alıcıya ayrıca iletilir. Excel indirme seçeneği korunur.

Link, `sonuc.html#r=…` biçiminde tek bir veri alanı taşır. Ad-soyad, unvan, cevaplar ve motivasyon atlama tercihi tarayıcıda kompakt kodlanıp AES-GCM ile şifrelenir. Parolalı linklerde anahtar PBKDF2-SHA-256 (600.000 tur), rastgele salt ve IV ile türetilir. Parolasız linkte rastgele anahtar da aynı pakette bulunur; bu seçenek gizli erişim veya katılımcının kimliğini doğrulama garantisi vermez. Değiştirilmiş şifreli veri reddedilir, ancak anahtarı/parolayı bilen biri yeni bir link oluşturabilir.

Paylaşılan link doğrudan mevcut bireysel grafikleri ve 3D karakteri açar. Sonuçlar yalnızca bellekte işlenir; alıcının form taslağı değişmez. Atlanan motivasyon bölümünün taslaktaki cevapları paylaşılmaz. Soru sürümü/eşlemesi değişmişse eski cevaplardan yanlış sonuç üretmek yerine açık hata gösterilir. Linki iptal etme veya süre dolumu yoktur; başka parola seçmek daha önce paylaşılan linki geçersiz kılmaz. Veri sunucuya gönderilmez; link mesajlarda ve tarayıcı geçmişinde kalabilir. HTTPS veya localhost gerekir.

## Yönetici kullanımı

1. Site adresinin sonuna `/analiz-982429.html` ekle.
2. Boş bireysel ve ekip şablonları otomatik yüklenir; hazır durumunu bekle.
3. Ekipten gelen cevap Excel’lerini topluca yükle. Uygulamanın eski sürümünde üretilmiş değerlendirmeli dosyalar da desteklenir. PDF profilleme raporları bu yükleyicide desteklenmez.
4. Dosya hatalarını kontrol et. Eksik/geçersiz cevaplar veya aynı ad-soyad ve unvana sahip tekrar kayıtlar listeye alınmaz. Bir kişinin güncel dosyası için önce önceki kaydı kaldır.
5. Gerekirse bir kişiyi **Benim profilim** olarak seç. Ekip ortalamasına dahil edilmez ve şablonun ayrı profil satırına yazılır. Kaynağın bireysel profilleme PDF’i ise bu alanı boş bırakıp indirilen Excel’e raporundan elle aktar.
6. **Bireysel değerlendirmeler** ile orijinal 9 sayfalı dosyaları, **Ekip analizi** ile maildeki `Genel Data` düzenini indir.

Ekip şablonunun sırası korunur: davranış (renk, direkt, indirekt, insan, iş), iletişim (güvenli, agresif, pasif-agresif, pasif, toplam), motivasyon (ilişki, etkileme, güvenlik, başarı, toplam), kontrol odağı. On kişiden fazla ekiplerde satırlar, ortalamalar ve profil alanı genişletilir. Tek seferde 200 dosya, dosya başına 8 MB desteklenir.

Davranış rengi önerisi, özgün haritada alanı en büyük olan bölgeye göre üretilir: sol üst Mavi, sağ üst Kırmızı, sağ alt Sarı, sol alt Yeşil. Eşit alanlı bölgeler birlikte yazılır; yönetici öneriyi değiştirebilir. Sayfadaki ekip haritasında yatay koordinat direkt–indirekt, dikey koordinat insan–iş puan farkıdır. Kişisel grafikler yalnızca analiz sayfasında gösterilir.

## Katılımcı ve kayıt

- İletişim: 40 soru, 1–5. Davranış: 28 soru, A/B. Motivasyon: 40 soru, 1–4. İç-dış kontrol: 29 soru, A/B.
- Motivasyon bölümündeki **Yeni başladım · Bu bölümü boş geç** seçeneği yeterli gözlemi olmayan katılımcının diğer 97 soruyu tamamlayıp Excel indirmesini sağlar. Tercih tarayıcı kaydında ve cevap Excel’inin `Katılımcı!B5` hücresinde saklanır. Eski taslaklar normal akışla açılır. Önceki motivasyon yanıtları taslakta korunur, ancak atlama etkin olduğu sürece dışa aktarılmaz; tercih geri alınabilir.
- Yönetici değerlendirmesinde atlanan motivasyon yanıtları, formülleri ve puanları boş kalır; gerekçe görünür. Ekip Excel’inde M:Q boş bırakılır ve yalnızca yanıtlayanların motivasyon ortalaması alınır. Hiç yanıtlayan yoksa ortalama boş kalır; S sütununda durum ve katılımcı sayısı gösterilir. Diğer üç envanterin hesaplamaları bu kişiler için devam eder.
- Beşerli soru sayfaları, eksik yanıt denetimi ve ad-soyad/unvan doğrulaması korunur.
- Yanıtlar ve son açık sayfa `localStorage` ile aynı origin, cihaz ve tarayıcı profilinde saklanır. Eski `sessionStorage` taslağı, kalıcı kayıt yoksa taşınır. Cihazlar arası senkronizasyon yoktur.
- **Yanıtları temizle** uygulamanın kalıcı ve eski oturum kaydını siler. Gizli mod veya site verilerinin silinmesi kaydı kaldırabilir. Aynı anda birkaç sekmede düzenlemede son kayıt geçerlidir.
- Motivasyon yönergesi özgün dosyadaki “Şirketimde birlikte çalıştığım kişiler” ifadesini korur. 2 “Nadiren”, 3 “Çoğunlukla” açıklamaları arayüzde eklenmiştir; kaynak yalnızca 1 ve 4 uçlarını tanımlar.

## Veri ve erişim

Dosyalar ve cevaplar sunucuya gönderilmez. Analiz sayfasına yüklenen dosyalar yalnızca bellekte tutulur; sayfayı kapatınca veya **Yüklenen dosyaları temizle** ile kaldırılır. Kişisel dosyalar ve e-posta depoya yüklenmez. Boş değerlendirme şablonları `assets/` altında repoda tutulur ve siteyle yayımlanır. Kamuya açık `data/survey.json` artık puanlama formülleri içermez; analiz bu formülleri otomatik yüklenen şablondan okur.

Ayrı analiz URL’si bir yetkilendirme sınırı değildir. Bu statik uygulamada giriş kontrolü yoktur. Şablona ve cevap dosyalarına sahip biri analiz yapabilir. Daha önce yayınlanan dosyalar tarayıcı önbelleğinde, eski indirmelerde veya Git geçmişinde bulunabilir; yeni sürüm onları geri alamaz.

## Yerel çalışma ve GitHub Pages

Node.js 20 veya üstüyle, ek paket kurulmadan:

```sh
npm run dev
```

Katılımcı: `http://127.0.0.1:4173/`; yönetici: `http://127.0.0.1:4173/analiz-982429.html`.

GitHub Pages için bu klasörün **takip edilen** dosyalarını yayımla: Settings → Pages → Deploy from a branch → main → root. Tüm yollar göreli ve `.nojekyll` mevcuttur. `private-fixtures/`, `test-output/`, `node_modules/` ve üst klasördeki kişisel belgeleri hiçbir zaman yayın paketine ekleme. Yerel sunucu da bu özel klasörleri sunmaz.

Private Git deposu tek başına siteye erişimi kısıtlamaz. Erişim kontrolü gerekiyorsa hosting katmanında yapılandırılmalıdır; `noindex` bir erişim kontrolü değildir.

## Excel üretimi

Katılımcı şablonu `assets/cevap-sablonu.xlsx` beş görünür sayfa içerir: `Katılımcı` ve dört soru sayfası. Kimlik B2/B3, format etiketi B4, soruların sıra numarası A, cevapları D sütunundadır. Gizli değerlendirme sayfası, formül, grafik veya çizim bulunmaz. Metin değerleri formül olarak çalıştırılmaz.

Repoda tutulan özgün envanter şablonu ZIP/OOXML alanları değiştirilerek doldurulur. Dokuz sekme, stiller, görseller, yazdırma alanları ve 143 özgün formül korunur. A/B cevapları değerlendirmede 1/2’ye çevrilir; formül ve grafik önbellekleri, davranış dikdörtgeni ve kontrol odağı göstergesi güncellenir. Kontrol değerlendirme cevapları D1:D29’a yazılır; D30 boş kalır.

## Testler

Testler, siteyle aynı `assets/envanter-sablonu.xlsx` ve `assets/ekip-sablonu.xlsx` boş şablonlarını kullanır. Şablonları değiştirmek için bu iki dosyayı güncelle.

```sh
npm test
# openpyxl bulunan Python ortamıyla bağımsız doğrulama:
python3 tests/verify_export.py
```

Testler; cevap dosyasında değerlendirme bulunmamasını, 137 cevabın aktarımını, yeni/eski dosyaların okunmasını, özgün değerlendirmeye dönüşümü, geçersiz dosyaların reddini, tüm ekip sütunlarını, 1/10/11/25 kişilik ekipleri, ortalamaları, ayrı yönetici profilini ve yinelenen kayıtları kontrol eder. Python kontrolü Excel’leri bağımsız olarak okuyup puanları, hücreleri, formülleri, birleşimleri ve XML’i doğrular. Sentetik çıktılar `test-output/` altında kalır.

Gerçek tarayıcı ve Microsoft Excel uygulamasıyla görsel kontroller otomatik dosya doğrulamalarından ayrıdır. Yerel önizleme ortamda engellenirse bu doğrulamalar tamamlanmış sayılmaz.

`tools/build-answer-template.mjs`, geliştirme ortamında `@oai/artifact-tool` ile boş cevap şablonunu yeniden üretir; site çalışırken bu bağımlılık kullanılmaz. Soruların yapısı değişirse şablon da yeniden üretilmelidir.

### Analiz sayfasındaki 3D karakterler

Davranış haritasındaki en büyük alanla aynı eşleştirme kullanılır: kırmızı/panter, sarı/tavus kuşu, yeşil/yunus, mavi/baykuş. Eşit renklerde karakter seçilebilir; yöneticinin renk değişikliği de dikkate alınır. Özel bir renk metni eşleşmiyorsa karakter gösterilmez. Ekip listesindeki isme veya “Grafikler” düğmesine tıklayarak kişi açılır.

Kullanıcının sağladığı ZIP’lerden seçilen dört animasyonlu `.glb` modeli `assets/characters/` içinde animasyonlarıyla bulunur. Çalışma anında CDN, model servisi veya internetten ek indirme kullanılmaz. Three.js ve GLTFLoader yerel dosyalardır. WebGL 2 destekleyen tarayıcı gerekir; destek yoksa açıklayıcı metin gösterilir. Model sürüklenebilir ve ok tuşlarıyla döndürülebilir. Duraklat/Oynat kontrolü vardır; azaltılmış hareket tercihiyle duraklatılmış başlar, görünür değilken animasyon durur.

Orijinal indirmeler `glbs/` içinde tutulur ve Git’e dahil edilmez. Seçilen dosyaları yeniden paketlemek için: `python3 tools/import-character-models.py`. Panter: `black-panther.zip` içindeki özgün GLB; yunus ve baykuş: kullanıcının GLB dosyaları; tavus kuşu: `merak_burung_poli_rendah.zip` (Idle animasyonu). Detaylı Indian Peacock dosyası animasyon içermediğinden ve 100 MB üstünde olduğundan seçilmedi. Kaynak ve lisans bilgileri her modelin yanında `*-license.txt` dosyasında ve karakter kartında yer alır. Boyut/merkez, modelin animasyon zarfına göre otomatik ayarlanır; aynı anda tek animasyon klibi oynatılır.

Kamera mesafesi sabit değildir: animasyonun 49 örneğinden hesaplanan çevreleyen küre ve ekranın dar görüş açısı kullanılarak güvenli boşlukla ayarlanır. Bu sınır kullanıcı modeli döndürdüğünde de geçerlidir. Tavus kuşu varsayılan olarak önden gösterilir.
