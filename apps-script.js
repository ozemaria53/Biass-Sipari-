// ═══════════════════════════════════════════════
// BİASS SİPARİŞ UYGULAMASI — APPS SCRIPT v3
// ═══════════════════════════════════════════════
const SHEET_ID = 'BURAYA_SHEET_ID_YAZIN';

const USER_EMAILS = {
  'oguzhan':  'oguzhan@biass.com.tr',
  'hamza':    'hamzatajimuradow@gmail.com',
  'akif':     'akifarici@biass.com.tr',
  'ahmet':    'ahmetarici@biass.com.tr',
  'cem':      'depo@biass.com.tr',
  'mersan':   'mersanyildirim@biass.com.tr',
  'yasin':    'yasinsuslu@biass.com.tr',
  'yonetici': '',
};
const FABRIKA_USERS = ['oguzhan','hamza'];

// ─── TEMEL FONKSİYONLAR ───────────────────────

function getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readData(sheet) {
  const val = sheet.getRange(1,1).getValue();
  try { return val ? JSON.parse(val) : {orders:[],users:[],notifs:[]}; }
  catch(e) { return {orders:[],users:[],notifs:[]}; }
}

function writeData(sheet, data) {
  sheet.getRange(1,1).setValue(JSON.stringify(data));
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── GET (Veri Yükle) ─────────────────────────

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = getOrCreate(ss, 'SiparisDB');
    const data = readData(sheet);
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── POST (Veri Kaydet) ───────────────────────

function doPost(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = getOrCreate(ss, 'SiparisDB');
    const payload = JSON.parse(e.postData.contents);

    // Yeni sipariş ekle
    if (payload.action === 'addOrder') {
      const data = readData(sheet);
      if (!data.orders.some(o => o.id === payload.order.id)) {
        data.orders.push(payload.order);
        writeData(sheet, data);
        updateSheet(ss, data.orders);
        sendNewOrderMail(payload.order);
      }
      return ok();
    }

    // Sipariş güncelle
    if (payload.action === 'updateOrder') {
      const data = readData(sheet);
      const idx = data.orders.findIndex(o => o.id === payload.order.id);
      if (idx >= 0) {
        data.orders[idx] = payload.order;
        writeData(sheet, data);
        updateSheet(ss, data.orders);
        sendStatusMail(payload.order, payload.prevStatus);
      }
      return ok();
    }

    // Sipariş sil
    if (payload.action === 'deleteOrder') {
      const data = readData(sheet);
      data.orders = (data.orders || []).filter(o => o.id !== payload.orderId);
      // O siparişe ait bildirimleri de temizle
      data.notifs = (data.notifs || []).filter(n => n.orderId !== payload.orderId);
      writeData(sheet, data);
      updateSheet(ss, data.orders);
      return ok();
    }

    // Bildirim senkronizasyonu
    if (payload.action === 'syncNotifs') {
      const data = readData(sheet);
      data.notifs = payload.notifs || [];
      writeData(sheet, data);
      return ok();
    }

    // Genel veri yazma (kullanıcılar vs.)
    const data = readData(sheet);
    const merged = Object.assign(data, payload);
    writeData(sheet, merged);
    return ok();

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── MAİL FONKSİYONLARI ───────────────────────
// ÖNEMLİ: İlk dağıtımda Gmail izni isteyecek, mutlaka onaylayın.

function sendMail(to, subject, body) {
  if (!to || !to.includes('@')) return;
  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      name: 'Sipariş Sistemi'
    });
  } catch(e) {
    Logger.log('Mail hatası: ' + to + ' — ' + e.message);
  }
}

function sendNewOrderMail(order) {
  const subject = '🔔 Yeni Sipariş: #' + order.id;
  const body = buildBody(order, 'Yeni sipariş oluşturuldu. Lütfen uygulamadan onaylayın ve termin tarihi girin.');
  FABRIKA_USERS.forEach(uid => sendMail(USER_EMAILS[uid], subject, body));
}

function sendStatusMail(order, prevStatus) {
  const labels = {
    alindi:     'Sipariş Alındı ✅',
    islemde:    'Sipariş İşlemde ⚙️',
    hazir:      'Sipariş Hazır 📦',
    gonderildi: 'Sipariş Gönderildi 🚚',
    iptal:      'Sipariş İptal Edildi ❌'
  };
  const label = labels[order.status] || order.status;
  const subject = label + ' — Sipariş #' + order.id;
  const body = buildBody(order, 'Sipariş durumu güncellendi: ' + label);

  if (order.status === 'iptal' || order.status === 'gonderildi') {
    // Fabrika + sipariş sahibine bildir
    FABRIKA_USERS.forEach(uid => sendMail(USER_EMAILS[uid], subject, body));
    sendMail(USER_EMAILS[order.createdBy], subject, body);
  } else if (order.status === 'alindi' || order.status === 'islemde' || order.status === 'hazir') {
    // Sadece sipariş sahibine bildir
    sendMail(USER_EMAILS[order.createdBy], subject, body);
  }
}

function buildBody(order, intro) {
  const urunler = (order.items || [])
    .map((i, n) => (n+1) + '. ' + formatItem(i))
    .join('\n');

  const lines = [
    intro, '',
    'Sipariş No: ' + order.id,
    'Oluşturan:  ' + order.createdByName,
    'Tarih:      ' + order.createdAt,
  ];
  if (order.termin)      lines.push('Termin:     ' + order.termin);
  if (order.terminNote)  lines.push('Fabrika Notu: ' + order.terminNote);
  if (order.gonderimTarihi) lines.push('Gönderim Tarihi: ' + order.gonderimTarihi);
  if (order.gonderimNotu)   lines.push('Gönderim Notu: ' + order.gonderimNotu);
  if (order.note)        lines.push('Sipariş Notu: ' + order.note);
  lines.push('', 'Ürünler:', urunler, '', '— Sipariş Sistemi');
  return lines.join('\n');
}

function formatItem(item) {
  const p = [catLabel(item.category)];
  if (item.musteriIsmi) p.push('Müşteri: ' + item.musteriIsmi);
  if (item.productCode) p.push(item.productCode);
  if (item.size || item.olcu) p.push(item.size || item.olcu);
  if (item.material)    p.push(item.material);
  if (item.color)       p.push(item.color);
  if (item.packaging)   p.push(item.packaging);
  if (item.kasnak)      p.push(item.kasnak);
  if (item.kalinlik)    p.push(item.kalinlik);
  if (item.makaraMetre) p.push(item.makaraMetre);
  if (item.quantity)    p.push('Miktar: ' + item.quantity);
  if (item.kesmeRows && item.kesmeRows.length) {
    p.push('Uzunluklar: ' + item.kesmeRows.map(r => r.uzunluk + ' x' + r.qty + ' adet').join(', '));
  }
  if (item.note) p.push('Not: ' + item.note);
  return p.join(' / ');
}

function catLabel(c) {
  return {
    seffaf_lastik: 'Şeffaf Lastik',
    fitil:         'Fitil',
    balen:         'Balen',
    kesme_balen:   'Kesme Balen',
    makara_seffaf: 'Makara Şeffaf Lastik',
    serigrafi:     'Serigrafi Baskılı Yazı'
  }[c] || c;
}

// ─── SHEETS GÜNCELLE ──────────────────────────

function updateSheet(ss, orders) {
  if (!orders || !orders.length) return;
  const s = getOrCreate(ss, 'Siparişler');
  s.clearContents();
  s.getRange(1,1,1,10).setValues([[
    'Sipariş No','Oluşturan','Tarih','Durum',
    'Termin','Gönderim Tarihi','Gönderim Notu',
    'Ürün Sayısı','Not','Güncelleme'
  ]]);
  const rows = orders.map(o => [
    o.id,
    o.createdByName || '',
    o.createdAt || '',
    o.status || '',
    o.termin || '',
    o.gonderimTarihi || '',
    o.gonderimNotu || '',
    (o.items || []).length,
    o.note || '',
    o.updatedAt || ''
  ]);
  if (rows.length) s.getRange(2, 1, rows.length, 10).setValues(rows);
}

// ─── ZAMANLANMIŞ HATIRLATıCı ──────────────────
// Apps Script → Tetikleyiciler → checkPendingOrders → Saat başı ekle

function checkPendingOrders() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('SiparisDB');
  if (!sheet) return;
  const data = readData(sheet);
  const pending = (data.orders || []).filter(o => o.status === 'alinmadi');
  if (!pending.length) return;

  pending.forEach(order => {
    const subject = '⚠️ Onay Bekleyen Sipariş: #' + order.id;
    const body = [
      'Bu sipariş henüz fabrika tarafından alınmadı.',
      '',
      'Sipariş No: ' + order.id,
      'Oluşturan:  ' + order.createdByName,
      'Tarih:      ' + order.createdAt,
      '',
      'Lütfen uygulamadan onaylayın ve termin girin.',
      '',
      '— Sipariş Sistemi'
    ].join('\n');
    FABRIKA_USERS.forEach(uid => sendMail(USER_EMAILS[uid], subject, body));
  });
}
