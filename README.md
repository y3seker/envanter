# Rise Up ekip envanterleri

Ekibin dört envanteri web arayüzünde doldurur. Uygulama cevapları orijinal Excel şablonuna aktarır, değerlendirme sekmelerini doldurur ve kişiye özel `.xlsx` indirir. Katılımcı dosyayı yöneticisiyle kendisi paylaşır.

## Yerelde çalıştırma

Node.js 20 veya üzeri yeterli. Paket kurulumu ve derleme gerekmiyor.

```sh
cd /Users/yseker/Desktop/riseup/riseup-app
npm run dev
```

Tarayıcıda `http://127.0.0.1:4173` adresini aç. `index.html` dosyasını çift tıklayarak açmak yerine HTTP sunucusunu kullan; tarayıcı ES modülleri ve şablon dosyası için bunu gerektirir.

## GitHub Pages ile yayınlama

1. Yeni bir GitHub deposu aç. **Yalnızca bu `riseup-app` klasörünün içeriğini** deponun köküne koy. Üst klasördeki e-postayı, bireysel profilleme raporunu ve diğer kişisel belgeleri yükleme.
2. Varsayılan dalına dosyaları gönder.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch** seç.
4. Dal olarak varsayılan dalını, klasör olarak **`/ (root)`** seçip kaydet.
5. GitHub’ın verdiği Pages bağlantısını ekiple paylaş.

Tüm varlık yolları göreli. `https://kullanici.github.io/depo-adi/` gibi bir alt dizinde çalışır. `.nojekyll` dosyası mevcut; npm kurulumu, GitHub Actions veya bir sunucu uygulaması gerekmez.

### Private erişim

**Private depo, private Pages sitesi anlamına gelmez.** GitHub Pages sitesine erişimi kısıtlamak için GitHub Enterprise Cloud kullanan bir organizasyona ait private/internal proje deposu ve Pages erişim ayarı gerekir. Normal kişisel private depodan yayınlanan sitenin gizli olduğunu varsayma. Depoyu private tutarak Pages kullanabilme imkânı da GitHub planına bağlıdır.

Organizasyonunda destekleniyorsa **Settings → Pages** içindeki görünürlük ayarını private olarak yapılandır ve erişimi organizasyonun politikalarına göre ver. Bu uygulama kendi kimlik doğrulamasını eklemez. Gerçek private erişim gereken ve bu özelliği olmayan ortamlarda, dosyaları kurum içi erişim kontrollü bir statik sunucuda barındır.

Resmî kaynaklar:

- [GitHub Pages görünürlüğü ve erişim kontrolü](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)
- [GitHub Pages desteği ve planlar](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

`noindex` etiketi yalnızca arama motorlarına bir yönergedir; erişim kontrolü sağlamaz.

## Katılımcı akışı

- Ad-soyad ve unvan.
- İletişim tarzı: 40 soru, 1–5 puan.
- Davranış tarzı: 28 soru, A/B seçimi.
- Motivasyon ihtiyacı: 40 soru, 1–4 puan.
- Kontrol odağı: 29 soru, A/B seçimi. Excel’deki sekme adı `İç-Dış Motivasyon` olarak korunur.
- Eksikleri kontrol et, Excel’i indir ve yöneticiyle paylaş.

Sorular beşerli sayfalarda gösterilir. Bölümler arasında serbestçe gezinilebilir; eksik cevap varken o sayfadan ileri gitme ve Excel indirme engellenir. Yanıtlar indirmeden önce gözden geçirilebilir.

**Motivasyon bölümünün özgün yönergesi** “Şirketimde birlikte çalıştığım kişiler” şeklindedir. Web arayüzü bu ifadeyi korur; soruları kendi davranışlarına ilişkinmiş gibi yeniden yazmaz. Bu bölümde kaynak yalnızca 1 ve 4 uçlarını tanımlar. Web arayüzünde okunabilirlik için 2 “Nadiren”, 3 “Çoğunlukla” olarak açıklanır; Excel’deki sayısal puanlar ve sorular korunur.

## Veri nerede tutulur?

- Cevaplar, ad-soyad ve unvan **yalnızca tarayıcının `sessionStorage` alanında** tutulur. Aynı sekmeyi yenileyince devam edilebilir. Tarayıcının oturum kurtarma davranışı değişebilir; ortak cihazda iş bitince **bilgilerimi temizle** düğmesini kullan.
- Bilgi ve yanıtları gönderen bir API, e-posta, analitik, haricî font veya CDN çağrısı yoktur. Hosting hizmeti yalnızca sayfanın ve sabit dosyaların normal HTTP isteklerini görür.
- Excel dosyası tarayıcıda oluşturulur. Dosya kendiliğinden yöneticiye gönderilmez.
- GitHub’a yalnızca boş Excel şablonu ve uygulama kodu konur. Dolu Excel dosyaları ve `test-output/` depoya eklenmemelidir.
- Sayfa erişiminin gizliliğini hosting katmanı sağlar. Yanıtların sunucuya gönderilmemesi, sayfanın özel erişimle korunduğu anlamına gelmez.

## Excel çıktısı

`assets/envanter-sablonu.xlsx`, paylaşılan `Envanterler-Uygulama Dosyası.xlsx` dosyasının aynısıdır. Uygulama dosyayı sıfırdan oluşturmak yerine ZIP/OOXML paketindeki gerekli alanları günceller:

- Dokuz sekme, soru metinleri, stiller, görseller, yazdırma alanları ve **143 özgün formül** korunur.
- Cevaplar soru sekmelerine ve değerlendirme sekmelerindeki ilgili giriş hücrelerine aktarılır. Değerlendirme için A → 1, B → 2 dönüşümü yapılır.
- Formül sonuçları önceden hesaplanıp hücre önbelleklerine yazılır. Excel’de otomatik yeniden hesaplama da açık tutulur.
- Giriş sayfasındaki özgün ad-soyad/unvan metin kutusu doldurulur.
- İletişim grafiğinin sayı önbelleği, davranış haritasındaki dikdörtgen ve kontrol odağı göstergesinin konumu sonuçlara göre güncellenir. Haritalar kaynak şablondaki eksenlere göre konumlandırılır; arayüz kişilik veya psikolojik değerlendirme üretmez.
- Dosya adı `RiseUp-Ad-Soyad-YYYY-MM-DD.xlsx` biçimindedir; tarih İstanbul saat dilimiyle oluşturulur.

Formüller, şablonda kullanılan `SUM`, `IF` ve doğrudan hücre başvuruları için sınırlı bir hesaplayıcıyla değerlendirilir. Desteklenmeyen formül sessizce sıfıra dönüştürülmez; dışa aktarma hata verir. Kontrol odağı toplamına dahil olan beş özgün boş hücre Excel’in `SUM` davranışı gibi sıfır sayılır, ancak dosyada boş kalır.

Şablonu değiştirirsen `data/survey.json` içindeki hücre eşlemelerini, formülleri ve harita koordinatlarını da yeni şablona göre güncelle. Değişiklikten sonra testleri yeniden çalıştır.

## Doğrulama

```sh
npm test
# Ek bağımsız kontrol için openpyxl bulunan Python ortamı:
python3 tests/verify_export.py
```

Node testleri üç sentetik örneği `test-output/` içine üretir. Python kontrolü bunları salt okunur açarak tüm cevapları, formüllerin korunmasını, bağımsız puanlama anahtarlarını, kimlik alanını ve grafik önbelleğini doğrular. Soru metinlerini de şablonla karşılaştırır. Değişmemesi gereken ZIP girdileri bayt düzeyinde karşılaştırılır.

Bu kontroller Microsoft Excel veya Numbers içinde canlı görüntüleme doğrulamasının yerine geçmez. Özellikle Office sürümleri arasındaki şekil yerleşimi farkları için ilk gerçek kullanımda bir örnek dosyayı Excel’de açıp kontrol etmek yararlıdır.

Bu teslim hazırlanırken yerel sunucu başlatma ortam tarafından `EPERM` ile engellendiği için gerçek tarayıcı üzerinden görsel ve etkileşim doğrulaması yapılamadı. JavaScript sözdizimi, soru eşlemeleri ve gerçek Excel üretimi otomatik kontrollerle doğrulandı.

## Dosyalar

- `index.html`, `styles.css`, `app.js`: responsive, klavye ile kullanılabilen Türkçe arayüz.
- `core.js`: doğrulama, taslak geri yükleme ve özgün formüllerin hesaplanması.
- `excel.js`: orijinal şablondan Excel üretimi.
- `data/survey.json`: kaynak sorular, hücre eşlemeleri ve formüller.
- `vendor/`: sabit sürüm JSZip 3.10.1 ve lisansları; dış bağlantı gerektirmez.
- `tests/`: kaynak sadakati, değerlendirme ve dışa aktarma kontrolleri.
- `tools/serve.mjs`: sadece yerel önizleme sunucusu. Yayında çalıştırılmaz.
