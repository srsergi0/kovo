import { useState, useRef } from 'kovo-ux';
import vibrator from '@system.vibrator';
import router from '@system.router';

function triggerHaptic() {
  try {
    if (vibrator && typeof vibrator.vibrate === 'function') {
      vibrator.vibrate({ mode: 'short' });
    }
  } catch (e) {}
}

function useCounter(initialValue = 0) {
  const [clickCount, setClickCount] = useState(initialValue);

  function inc() {
    setClickCount(clickCount + 1);
    triggerHaptic();
  }

  function dec() {
    setClickCount(clickCount - 1);
    triggerHaptic();
  }

  function reset() {
    setClickCount(0);
    triggerHaptic();
  }

  return { clickCount, inc, dec, reset };
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
    color: #38bdf8;
    font-weight: bold;
    margin-bottom: 16px;
  }
  .counter-box {
    width: 400px;
    height: 140px;
    background-color: #121722;
    border-radius: 24px;
    border-width: 1px;
    border-color: #1e293b;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }
  .count-label {
    font-size: 13px;
    color: #94a3b8;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .count-text {
    font-size: 56px;
    font-weight: bold;
    color: #38bdf8;
  }
  .btn-row {
    width: 400px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .btn {
    width: 126px;
    height: 44px;
    background-color: #0f172a;
    border-color: #38bdf8;
    border-width: 1px;
    color: #ffffff;
    font-size: 14px;
    font-weight: bold;
    border-radius: 22px;
  }
  .btn-primary {
    background-color: #052e16;
    border-color: #16a34a;
    color: #4ade80;
  }
  .btn-danger {
    background-color: #450a0a;
    border-color: #dc2626;
    color: #fca5a5;
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
    margin-top: 10px;
  }
`;

export default function DemoPage() {
  const { clickCount, inc, dec, reset } = useCounter(10);
  const containerRef = useRef(null);

  function goBack() {
    triggerHaptic();
    router.back();
  }

  return (
    <div ref={containerRef} className="page">
      <text className="title">🚀 HOOKS & REFS DEMO</text>

      <div className="counter-box">
        <text className="count-label">INLINED useCounter() HOOK</text>
        <text className="count-text">{clickCount}</text>
      </div>

      <div className="btn-row">
        <input className="btn btn-danger" type="button" value="-1 DEC" onClick={dec} />
        <input className="btn btn-primary" type="button" value="+1 INC" onClick={inc} />
        <input className="btn" type="button" value="🔄 RESET" onClick={reset} />
      </div>

      <input className="btn-back" type="button" value="← RETURN TO DASHBOARD" onClick={goBack} />
    </div>
  );
}
