import { useState } from 'kovo-ux';
import router from '@system.router';
import vibrator from '@system.vibrator';

function triggerHaptic() {
  try {
    if (vibrator && typeof vibrator.vibrate === 'function') {
      vibrator.vibrate({ mode: 'short' });
    }
  } catch (e) {}
}

export const style = `
  .page {
    width: 466px;
    height: 466px;
    background-color: #06080c;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 24px;
    padding-bottom: 24px;
  }
  .title {
    font-size: 20px;
    color: #c084fc;
    font-weight: bold;
    margin-bottom: 16px;
  }
  .setting-row {
    width: 400px;
    height: 56px;
    background-color: #121722;
    border-radius: 20px;
    border-width: 1px;
    border-color: #1e293b;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    margin-bottom: 12px;
  }
  .label {
    font-size: 14px;
    color: #ffffff;
    font-weight: bold;
  }
  .status {
    font-size: 12px;
    font-weight: bold;
    color: #4ade80;
    background-color: #052e16;
    border-radius: 12px;
    padding: 4px 10px;
  }
  .status-off {
    color: #fca5a5;
    background-color: #450a0a;
  }
  .btn-back {
    width: 400px;
    height: 46px;
    background-color: #1e1b4b;
    border-color: #6366f1;
    border-width: 1px;
    color: #c7d2fe;
    font-size: 14px;
    font-weight: bold;
    border-radius: 23px;
    margin-top: 24px;
  }
`;

export default function SettingsPage() {
  const [haptics, setHaptics] = useState(true);
  const [notifications, setNotifications] = useState(true);

  function toggleHaptics() {
    setHaptics(!haptics);
    triggerHaptic();
  }

  function toggleNotifications() {
    setNotifications(!notifications);
    triggerHaptic();
  }

  function goBack() {
    triggerHaptic();
    router.back();
  }

  return (
    <div className="page">
      <text className="title">⚙ SETTINGS & CONFIG</text>

      <div className="setting-row" onClick={toggleHaptics}>
        <text className="label">HAPTIC FEEDBACK</text>
        <text className={haptics ? 'status' : 'status status-off'}>
          {haptics ? 'ENABLED' : 'DISABLED'}
        </text>
      </div>

      <div className="setting-row" onClick={toggleNotifications}>
        <text className="label">SMART NOTIFICATIONS</text>
        <text className={notifications ? 'status' : 'status status-off'}>
          {notifications ? 'ENABLED' : 'DISABLED'}
        </text>
      </div>

      <input className="btn-back" type="button" value="← RETURN TO DASHBOARD" onClick={goBack} />
    </div>
  );
}
