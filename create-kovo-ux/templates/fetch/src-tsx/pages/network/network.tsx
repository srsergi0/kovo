import { useState } from 'kovo-ux';
import fetch from '@system.fetch';
import vibrator from '@system.vibrator';
import router from '@system.router';

function triggerHaptic() {
  try {
    if (vibrator && typeof vibrator.vibrate === 'function') {
      vibrator.vibrate({ mode: 'short' });
    }
  } catch (e) {}
}

const WEBHOOK_URL = 'https://keen-seal-69.webhook.cool';

export const style = `
  .page {
    width: 466px;
    height: 466px;
    background-color: #06080c;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 14px;
    padding-bottom: 14px;
  }
  .header-row {
    width: 400px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .header-title {
    font-size: 16px;
    font-weight: bold;
    color: #38bdf8;
  }
  .back-btn {
    width: 80px;
    height: 32px;
    background-color: #1e293b;
    color: #94a3b8;
    font-size: 11px;
    font-weight: bold;
    border-radius: 16px;
  }
  .status-card {
    width: 400px;
    background-color: #0f172a;
    border-radius: 16px;
    padding: 12px;
    margin-bottom: 10px;
    flex-direction: column;
    border-width: 1px;
    border-color: #1e293b;
  }
  .status-title {
    font-size: 11px;
    font-weight: bold;
    color: #94a3b8;
    margin-bottom: 4px;
  }
  .status-text {
    font-size: 15px;
    font-weight: bold;
    color: #4ade80;
    margin-bottom: 2px;
  }
  .status-detail {
    font-size: 11px;
    color: #cbd5e1;
  }
  .grid-row {
    width: 400px;
    flex-direction: row;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .net-btn {
    width: 194px;
    height: 44px;
    border-radius: 22px;
    font-size: 13px;
    font-weight: bold;
    color: #ffffff;
    border-width: 1px;
  }
  .btn-get {
    background-color: #0c4a6e;
    border-color: #0284c7;
    color: #38bdf8;
  }
  .btn-post {
    background-color: #052e16;
    border-color: #16a34a;
    color: #4ade80;
  }
  .btn-put {
    background-color: #4c1d95;
    border-color: #7c3aed;
    color: #c084fc;
  }
  .btn-del {
    background-color: #450a0a;
    border-color: #dc2626;
    color: #fca5a5;
  }
`;

export default function NetworkPage() {
  const [statusMsg, setStatusMsg] = useState('READY — TAP A BUTTON');
  const [lastMethod, setLastMethod] = useState('NONE');
  const [lastCode, setLastCode] = useState('200 OK');

  function goBack() {
    triggerHaptic();
    router.back();
  }

  function handleGet() {
    triggerHaptic();
    setStatusMsg('SENDING GET...');
    setLastMethod('GET');

    const self = this;
    fetch.fetch({
      url: WEBHOOK_URL + '?type=GET_TEST&device=XiaomiVela',
      method: 'GET',
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'GET SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'DATA: ' + (res.data ? res.data.substring(0, 30) : 'EMPTY');
      },
      fail: function(data, code) {
        self.statusMsg = 'GET FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  function handlePost() {
    triggerHaptic();
    setStatusMsg('SENDING POST...');
    setLastMethod('POST');

    const self = this;
    fetch.fetch({
      url: WEBHOOK_URL,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ device: 'Redmi Watch 5', steps: 8450, timestamp: Date.now() }),
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'POST SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'PAYLOAD DELIVERED TO WEBHOOK';
      },
      fail: function(data, code) {
        self.statusMsg = 'POST FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  function handlePut() {
    triggerHaptic();
    setStatusMsg('SENDING PUT...');
    setLastMethod('PUT');

    const self = this;
    fetch.fetch({
      url: WEBHOOK_URL + '?action=update',
      method: 'PUT',
      header: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ status: 'ACTIVE', battery: 94 }),
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'PUT SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'DATA UPDATED ON WEBHOOK';
      },
      fail: function(data, code) {
        self.statusMsg = 'PUT FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  function handleDelete() {
    triggerHaptic();
    setStatusMsg('SENDING DELETE...');
    setLastMethod('DELETE');

    const self = this;
    fetch.fetch({
      url: WEBHOOK_URL + '/resource/101',
      method: 'DELETE',
      responseType: 'text',
      success: function(res) {
        self.statusMsg = 'DELETE SUCCESS (' + (res.code || 200) + ')';
        self.lastCode = 'RESOURCE DELETED';
      },
      fail: function(data, code) {
        self.statusMsg = 'DELETE FAIL (' + code + ')';
        self.lastCode = String(data);
      }
    });
  }

  return (
    <div className="page">
      <div className="header-row">
        <text className="header-title">🌐 NETWORK FETCH</text>
        <input className="back-btn" type="button" value="◄ BACK" onClick={goBack} />
      </div>

      <div className="status-card">
        <text className="status-title">LAST METHOD: {lastMethod}</text>
        <text className="status-text">{statusMsg}</text>
        <text className="status-detail">{lastCode}</text>
      </div>

      <div className="grid-row">
        <input className="net-btn btn-get" type="button" value="📡 GET REQUEST" onClick={handleGet} />
        <input className="net-btn btn-post" type="button" value="📤 POST JSON" onClick={handlePost} />
      </div>

      <div className="grid-row">
        <input className="net-btn btn-put" type="button" value="📝 PUT DATA" onClick={handlePut} />
        <input className="net-btn btn-del" type="button" value="🗑️ DELETE" onClick={handleDelete} />
      </div>
    </div>
  );
}
