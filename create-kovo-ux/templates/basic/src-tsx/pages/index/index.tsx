import { useState } from 'kovo-ux';
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
    justify-content: center;
  }
  .title {
    font-size: 22px;
    font-weight: bold;
    color: #38bdf8;
    margin-bottom: 8px;
  }
  .counter-box {
    width: 360px;
    height: 140px;
    background-color: #121722;
    border-radius: 24px;
    border-width: 1px;
    border-color: #1e293b;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }
  .count-label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .count-text {
    font-size: 56px;
    font-weight: bold;
    color: #4ade80;
  }
  .btn-row {
    width: 360px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
  .btn-inc {
    width: 170px;
    height: 48px;
    background-color: #052e16;
    border-color: #16a34a;
    border-width: 1px;
    color: #4ade80;
    font-size: 15px;
    font-weight: bold;
    border-radius: 24px;
  }
  .btn-reset {
    width: 170px;
    height: 48px;
    background-color: #450a0a;
    border-color: #dc2626;
    border-width: 1px;
    color: #fca5a5;
    font-size: 15px;
    font-weight: bold;
    border-radius: 24px;
  }
`;

export default function IndexPage() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount(count + 1);
    triggerHaptic();
  }

  function reset() {
    setCount(0);
    triggerHaptic();
  }

  return (
    <div className="page">
      <text className="title">⌚ Kovo</text>

      <div className="counter-box">
        <text className="count-label">COUNTER</text>
        <text className="count-text">{count}</text>
      </div>

      <div className="btn-row">
        <input className="btn-inc" type="button" value="⚡ +1" onClick={increment} />
        <input className="btn-reset" type="button" value="🔄 RESET" onClick={reset} />
      </div>
    </div>
  );
}
