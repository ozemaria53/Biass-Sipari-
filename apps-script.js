// ═══════════════════════════════════════════════
// BİASS SİPARİŞ — APPS SCRIPT v5
// Görev: Mail gönderme + FCM Push Notification
// ═══════════════════════════════════════════════

// ── SUPABASE ──────────────────────────────────
const SUPA_URL = 'https://zrftjlqjpmbtgihrhtah.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZnRqbHFqcG1idGdpaHJodGFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMzM5NTQsImV4cCI6MjA5NDgwOTk1NH0.00b6C_9beoMVYlzxNSb_wUkOwOLoSDQTTCdECCqeWbE';

// ── MAİL ADRESLERİ ────────────────────────────
const USER_EMAILS = {
  'oguzhan':  'oguzhan@biass.com.tr',
  'hamza':    'hamzatajimuradow@gmail.com',
  'akif':     'akifarici@biass.com.tr',
  'ahmet':    'ahmetarici@biass.com.tr',
  'cem':      'depo@biass.com.tr',
  'mersan':   'mersanyildirim@biass.com.tr',
  'yasin':    'yasinsuslu@biass.com.tr',
};
const FABRIKA_USERS = ['oguzhan','hamza'];

// ── FİREBASE SERVİCE ACCOUNT ──────────────────
// Firebase Console → Proje Ayarları → Service Accounts
// → Generate new private key → JSON içeriğini buraya yapıştır
const FCM_SERVICE_ACCOUNT = {
  // Örnek yapı — gerçek JSON'u buraya yapıştır:
  // "type": "service_account",
  // "project_id": "biass-siparis-xxxxx",
  // "private_key_id": "...",
  // "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  // "client_email": "firebase-adminsdk-xxxxx@biass-siparis-xxxxx.iam.gserviceaccount.com",
  // "token_uri": "https://oauth2.googleapis.com/token"
};

// ════════════════════════════════════════════════
// SUPABASE HELPERS
// ════════════════════════════════════════════════
function supaFetch(path, options) {
  const url = SUPA_URL + '/rest/v1/' + path;
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
  };
  if (options.prefer) headers['Prefer'] = options.prefer;
  return UrlFetchApp.fetch(url, {
    method: options.method || 'GET',
    headers: headers,
    payload: options.body ? JSON.stringify(options.body) : undefined,
    muteHttpExceptions: true
  });
}

function getUsers() {
  const r = supaFetch('users?select=*', {});
  return JSON.parse(r.getContentText()) || [];
}

function getFabrikaTokens() {
  const users = getUsers();
  return users
    .filter(u => (u.role === 'fabrika' || u.role === 'yonetici') && u.fcm_token)
    .map(u => u.fcm_token);
}

function getUserToken(userId) {
  const users = getUsers();
  const u = users.find(x => x.id === userId);
  return u ? u.fcm_token : null;
}

// ════════════════════════════════════════════════
// GET — Veri yükle (fallback için)
// ════════════════════════════════════════════════
function doGet(e) {
  try {
    const orders = JSON.parse(supaFetch('orders?select=*&order=ts.desc', {}).getContentText()) || [];
    const users = JSON.parse(supaFetch('users?select=*', {}).getContentText()) || [];
    const notifs = JSON.parse(supaFetch('notifs?select=*&order=ts.desc&limit=200', {}).getContentText()) || [];
    return ContentService
      .createTextOutput(JSON.stringify({orders, users, notifs}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({error: e.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ════════════════════════════════════════════════
// POST — Mail + Push gönder
// ════════════════════════════════════════════════
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'addOrder') {
      sendNewOrderMail(payload.order);
      sendPushToFabrika('🔔 Yeni Sipariş: ' + payload.order.id,
        payload.order.createdByName + ' yeni sipariş oluşturdu.');
      return ok();
    }

    if (payload.action === 'updateOrder') {
      sendStatusMail(payload.order, payload.prevStatus);
      sendStatusPush(payload.order);
      return ok();
    }

    return ok();
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ok: true}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════
// MAİL FONKSİYONLARI
// ════════════════════════════════════════════════
function sendMail(to, subject, body) {
  if (!to || !to.includes('@')) return;
  try {
    MailApp.sendEmail({to, subject, body, name: 'Biass Sipariş Sistemi'});
  } catch(e) {
    Logger.log('Mail hatası: ' + to + ' — ' + e.message);
  }
}

function sendNewOrderMail(order) {
  const subject = '🔔 Yeni Sipariş: ' + order.id;
  const body = buildNewOrderBody(order);
  FABRIKA_USERS.forEach(uid => sendMail(USER_EMAILS[uid], subject, body));
}

function sendStatusMail(order, prevStatus) {
  const labels = {
    alindi: 'Sipariş Alındı ✅',
    islemde: 'Sipariş İşlemde ⚙️',
    hazir: 'Sipariş Hazır 📦',
    gonderildi: 'Sipariş Gönderildi 🚚',
    iptal: 'Sipariş İptal Edildi ❌',
    duzenlendi: 'Sipariş Düzenlendi ✏️',
  };
  const label = labels[order.status] || order.status;
  const subject = label + ' — ' + order.id;
  const body = buildStatusBody(order, label);

  if (['iptal','gonderildi','duzenlendi'].includes(order.status)) {
    FABRIKA_USERS.forEach(uid => sendMail(USER_EMAILS[uid], subject, body));
    sendMail(USER_EMAILS[order.createdBy], subject, body);
  } else {
    sendMail(USER_EMAILS[order.createdBy], subject, body);
  }
}

function buildNewOrderBody(order) {
  const urunler = (order.items||[]).map((item, i) => {
    const p = [catLabel(item.category)];
    if (item.productCode) p.push(item.productCode);
    if (item.size||item.olcu) p.push(item.size||item.olcu);
    if (item.color) p.push(item.color);
    if (item.packaging) p.push(item.packaging);
    if (item.material) p.push(item.material);
    if (item.kasnak) p.push(item.kasnak);
    if (item.kalinlik) p.push(item.kalinlik);
    if (item.makaraMetre) p.push(item.makaraMetre);
    if (item.quantity) p.push('— ' + item.quantity);
    if (item.musteriIsmi) p.push('(Müşteri: ' + item.musteriIsmi + ')');
    if (item.kesmeRows&&item.kesmeRows.length)
      p.push('\n   Uzunluklar: ' + item.kesmeRows.map(r=>r.uzunluk+' x'+r.qty+' adet').join(', '));
    if (item.note) p.push('\n   Not: ' + item.note);
    return p.join(' / ');
  }).join('\n');

  return [
    'Merhaba,', '',
    order.createdByName + ', yeni bir sipariş oluşturdu.', '',
    'Sipariş No: ' + order.id,
    'Oluşturan:  ' + order.createdByName,
    'Tarih:      ' + order.createdAt,
    order.note ? 'Sipariş Notu: ' + order.note : null, '',
    'Ürünler:', urunler, '',
    'Lütfen uygulamadan siparişi onaylayın ve termin tarihi girin.', '',
    'Biass Sipariş Sistemi'
  ].filter(l=>l!==null).join('\n');
}

function buildStatusBody(order, label) {
  const urunler = (order.items||[]).map(item => {
    const p = [catLabel(item.category)];
    if (item.productCode) p.push(item.productCode);
    if (item.size||item.olcu) p.push(item.size||item.olcu);
    if (item.color) p.push(item.color);
    if (item.quantity) p.push('— ' + item.quantity);
    return p.join(' / ');
  }).join('\n');

  const lines = [
    'Merhaba,', '',
    'Sipariş durumu güncellendi: ' + label, '',
    'Sipariş No: ' + order.id,
    'Oluşturan:  ' + order.createdByName,
    'Tarih:      ' + order.createdAt,
  ];
  if (order.termin) lines.push('Termin: ' + order.termin);
  if (order.terminNote) lines.push('Fabrika Notu: ' + order.terminNote);
  if (order.gonderimTarihi) lines.push('Gönderim Tarihi: ' + order.gonderimTarihi);
  if (order.note) lines.push('Sipariş Notu: ' + order.note);
  lines.push('', 'Ürünler:', urunler, '', 'Biass Sipariş Sistemi');
  return lines.join('\n');
}

function catLabel(c) {
  return {
    seffaf_lastik: 'Şeffaf Lastik', fitil: 'Fitil', balen: 'Balen',
    kesme_balen: 'Kesme Balen', makara_seffaf: 'Makara Şeffaf Lastik',
    serigrafi: 'Serigrafi Baskılı Yazı',
  }[c] || c;
}

// ════════════════════════════════════════════════
// FCM PUSH NOTIFICATION
// ════════════════════════════════════════════════
function sendPushToFabrika(title, body) {
  const tokens = getFabrikaTokens();
  tokens.forEach(token => sendFCMPush(token, title, body));
}

function sendStatusPush(order) {
  const labels = {
    alindi: 'Sipariş Alındı ✅',
    islemde: 'Sipariş İşlemde ⚙️',
    hazir: 'Sipariş Hazır 📦',
    gonderildi: 'Sipariş Gönderildi 🚚',
    iptal: 'İptal Edildi ❌',
  };
  const label = labels[order.status];
  if (!label) return;

  const title = label + ' — ' + order.id;
  const body = order.createdByName + ' · ' + order.createdAt;

  if (['iptal','gonderildi'].includes(order.status)) {
    sendPushToFabrika(title, body);
    const ownerToken = getUserToken(order.createdBy);
    if (ownerToken) sendFCMPush(ownerToken, title, body);
  } else {
    const ownerToken = getUserToken(order.createdBy);
    if (ownerToken) sendFCMPush(ownerToken, title, body);
  }
}

function sendFCMPush(token, title, body) {
  if (!token || !FCM_SERVICE_ACCOUNT.project_id) return;
  try {
    const accessToken = getFCMAccessToken();
    const url = 'https://fcm.googleapis.com/v1/projects/' +
      FCM_SERVICE_ACCOUNT.project_id + '/messages:send';
    UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        message: {
          token: token,
          notification: {title, body},
          apns: {payload: {aps: {sound: 'default', badge: 1}}}
        }
      }),
      muteHttpExceptions: true
    });
  } catch(e) {
    Logger.log('FCM push error: ' + e.message);
  }
}

function getFCMAccessToken() {
  const sa = FCM_SERVICE_ACCOUNT;
  const now = Math.floor(Date.now() / 1000);
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const sig = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(header+'.'+claim, sa.private_key)
  );
  const jwt = header+'.'+claim+'.'+sig;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    payload: {grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt}
  });
  return JSON.parse(r.getContentText()).access_token;
}

// ════════════════════════════════════════════════
// ZAMANLANMIŞ HATIRLATıCı
// Apps Script → Tetikleyiciler → saat başı
// ════════════════════════════════════════════════
function checkPendingOrders() {
  try {
    const r = supaFetch('orders?status=eq.alinmadi&select=*', {});
    const pending = JSON.parse(r.getContentText()) || [];
    pending.forEach(order => {
      const subject = '⚠️ Onay Bekleyen Sipariş: ' + order.id;
      const body = 'Sipariş #'+order.id+' henüz onaylanmadı.\nOluşturan: '+
        order.created_by_name+'\nTarih: '+order.created_at+
        '\n\nLütfen uygulamadan onaylayın.\n\nBiass Sipariş Sistemi';
      FABRIKA_USERS.forEach(uid => sendMail(USER_EMAILS[uid], subject, body));
      sendPushToFabrika('⚠️ Onay Bekliyor: '+order.id, order.created_by_name+' siparişi bekliyor');
    });
  } catch(e) {
    Logger.log('checkPendingOrders error: ' + e.message);
  }
}
