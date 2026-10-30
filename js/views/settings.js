import { state, ghConfig, setGhConfig, ghEnabled, testConnection, syncAll, savePortfolio, triggerWorkflow, ghGetJson, savePushSubscription, exportBackup, importBackup, resetLocal } from '../store.js';
import { mount, $, toast, confirmDialog } from '../ui.js';
import { esc } from '../util.js';

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push wird hier nicht unterstützt. Auf dem iPhone: App über Safari → Teilen → „Zum Home-Bildschirm“ installieren und von dort öffnen (iOS 16.4+).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt.');
  const { data } = await ghGetJson('push/config.json');
  if (!data?.vapidPublicKey) throw new Error('push/config.json im Daten-Repo fehlt.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(data.vapidPublicKey) });
  await savePushSubscription(sub.toJSON());
}

export function renderSettings() {
  const c = ghConfig();
  const s = state.portfolio.settings;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  mount(
    `<section class="card form">
      <h3>Synchronisierung (GitHub)</h3>
      <p class="muted">Deine Daten liegen in deinem privaten Repo. Der Token bleibt nur auf diesem Gerät gespeichert.</p>
      <label>Benutzer<input id="g-owner" autocapitalize="none" value="${esc(c.owner)}"></label>
      <label>Daten-Repo<input id="g-repo" autocapitalize="none" value="${esc(c.repo)}"></label>
      <label>Token (Fine-grained, nur dieses Repo)<input id="g-token" type="password" autocomplete="off" placeholder="${c.token ? '•••••• gespeichert' : 'github_pat_…'}"></label>
      <button class="btn primary" id="g-save">Verbinden & synchronisieren</button>
      <div class="muted small">Status: ${esc(state.sync.status)}${state.sync.error ? ` – <span class="neg">${esc(state.sync.error)}</span>` : ''}</div>
    </section>
    <section class="card form">
      <h3>Push-Benachrichtigungen</h3>
      <p class="muted">${standalone ? 'Erhalte den Wochenbericht jeden Sonntag um 18:00 Uhr als Mitteilung.' : 'Zuerst in Safari über Teilen → „Zum Home-Bildschirm“ installieren und die App von dort öffnen.'}</p>
      <button class="btn" id="p-on" ${ghEnabled() ? '' : 'disabled'}>Push aktivieren</button>
      <button class="btn" id="p-test" ${ghEnabled() ? '' : 'disabled'}>Test-Push senden</button>
    </section>
    <section class="card form">
      <h3>Strategie</h3>
      <label>Ziel ETF-Anteil (%)<input id="t-etf" inputmode="numeric" value="${s.targetEtf}"></label>
      <div class="row2"><label>Positionsgröße min (%)<input id="t-min" inputmode="decimal" value="${s.posMin}"></label><label>max (%)<input id="t-max" inputmode="decimal" value="${s.posMax}"></label></div>
      <button class="btn" id="t-save">Speichern</button>
    </section>
    <section class="card form">
      <h3>Kurse</h3>
      <p class="muted">Kurse kommen von Alpha Vantage (Krypto: CoinGecko) und werden werktags abends automatisch aktualisiert. Der Gratis-Tarif erlaubt 25 Abfragen pro Tag – ein manueller Lauf verbraucht das Tagesbudget.</p>
      <button class="btn" id="k-run" ${ghEnabled() ? '' : 'disabled'}>Kurse jetzt aktualisieren</button>
    </section>
    <section class="card form">
      <h3>Datensicherung</h3>
      <button class="btn" id="b-exp">Sicherung exportieren</button>
      <label class="file"><input type="file" id="b-imp" accept="application/json"><span>Sicherung importieren</span></label>
      <button class="btn danger" id="b-reset">Lokale Daten auf diesem Gerät löschen</button>
    </section>`,
    'Einstellungen',
  );
  $('#g-save').onclick = async () => {
    const token = $('#g-token').value.trim() || c.token;
    setGhConfig({ owner: $('#g-owner').value.trim(), repo: $('#g-repo').value.trim(), branch: c.branch, token });
    try {
      const name = await testConnection();
      await syncAll();
      toast(`Verbunden mit ${name}`);
    } catch (e) {
      toast(e.message, 5000);
    }
    renderSettings();
  };
  $('#p-on').onclick = async () => {
    try {
      await enablePush();
      toast('Push aktiviert');
    } catch (e) {
      toast(e.message, 6000);
    }
  };
  $('#p-test').onclick = async () => {
    try {
      await triggerWorkflow('test-push.yml');
      toast('Test-Push angefordert (ca. 1 Minute)', 4000);
    } catch (e) {
      toast(e.message, 5000);
    }
  };
  $('#t-save').onclick = async () => {
    s.targetEtf = Math.min(100, Math.max(0, parseFloat($('#t-etf').value) || 50));
    s.posMin = parseFloat($('#t-min').value.replace(',', '.')) || 2;
    s.posMax = parseFloat($('#t-max').value.replace(',', '.')) || 3;
    await savePortfolio('Strategie geändert');
    toast('Gespeichert');
  };
  $('#k-run').onclick = async () => {
    try {
      await triggerWorkflow('prices.yml');
      toast('Kursupdate gestartet (ca. 1–2 Minuten)', 4000);
      setTimeout(syncAll, 120000);
    } catch (e) {
      toast(e.message, 5000);
    }
  };
  $('#b-exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportBackup()], { type: 'application/json' }));
    a.download = `finanzapp-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#b-imp').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f || !confirmDialog('Aktuelle Daten durch die Sicherung ersetzen?')) return;
    try {
      importBackup(await f.text());
      await savePortfolio('Sicherung importiert');
      toast('Sicherung importiert');
    } catch (err) {
      toast(err.message);
    }
  };
  $('#b-reset').onclick = () => {
    if (!confirmDialog('Alle lokalen Daten auf diesem Gerät löschen? Die Daten im GitHub-Repo bleiben erhalten.')) return;
    resetLocal();
    location.reload();
  };
}
