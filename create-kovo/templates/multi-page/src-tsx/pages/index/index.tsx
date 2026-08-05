import { useState } from 'kovo';
import vibrator from '@system.vibrator';
import router from '@system.router';
import StatCard from '../../components/StatCard/StatCard';

const WORKOUTS = [
  { name: '🏃 Outdoor Run', detail: '5.2 km  •  320 kcal' },
  { name: '🚴 Road Cycling', detail: '12.4 km  •  450 kcal' },
  { name: '🧘 Evening Yoga', detail: '35 min  •  110 kcal' }
];

function triggerHaptic() {
  try {
    if (vibrator && typeof vibrator.vibrate === 'function') {
      vibrator.vibrate({ mode: 'short' });
    }
  } catch (e) {}
}

function useSteps(initialSteps = 8450) {
  const [steps, setSteps] = useState(initialSteps);

  function addSteps() {
    setSteps(steps + 500);
    triggerHaptic();
  }

  function resetSteps() {
    setSteps(0);
    triggerHaptic();
  }

  return { steps, addSteps, resetSteps };
}

export const style = `
  .page {
    width: 466px;
    height: 466px;
    background-color: #06080c;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: 16px;
    padding-bottom: 16px;
  }
  .top-status-bar {
    width: 400px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .app-logo {
    font-size: 16px;
    font-weight: bold;
    color: #38bdf8;
  }
  .battery-pill {
    font-size: 11px;
    font-weight: bold;
    color: #4ade80;
    background-color: #14532d;
    border-radius: 12px;
    padding: 2px 8px;
  }
  .btn-row {
    width: 400px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
    margin-bottom: 8px;
  }
  .btn-card {
    height: 44px;
    border-radius: 22px;
    color: #ffffff;
    font-size: 13px;
    font-weight: bold;
    border-width: 1px;
  }
  .btn-step {
    width: 126px;
    background-color: #052e16;
    border-color: #16a34a;
    color: #4ade80;
  }
  .btn-reset {
    width: 126px;
    background-color: #450a0a;
    border-color: #dc2626;
    color: #fca5a5;
  }
  .btn-toggle {
    width: 126px;
    background-color: #1e1b4b;
    border-color: #4f46e5;
    color: #a5b4fc;
  }
  .btn-nav {
    width: 400px;
    height: 42px;
    background-color: #0f172a;
    border-color: #38bdf8;
    color: #38bdf8;
    border-radius: 21px;
    font-size: 13px;
    font-weight: bold;
    margin-top: 4px;
  }
  .workouts-box {
    width: 400px;
    background-color: #0f172a;
    border-radius: 16px;
    padding: 10px 14px;
    margin-top: 4px;
    flex-direction: column;
  }
  .workout-head {
    font-size: 12px;
    font-weight: bold;
    color: #94a3b8;
    margin-bottom: 6px;
  }
  .workout-item {
    font-size: 12px;
    color: #e2e8f0;
    margin-bottom: 3px;
  }
`;

export default function IndexPage() {
  const { steps, addSteps, resetSteps } = useSteps(8450);
  const [showWorkouts, setShowWorkouts] = useState(true);
  const workouts = WORKOUTS;

  function toggleWorkouts() {
    setShowWorkouts(!showWorkouts);
    triggerHaptic();
  }

  function goToDemo() {
    triggerHaptic();
    router.push({ uri: 'pages/demo' });
  }

  return (
    <div className="page">
      <div className="top-status-bar">
        <text className="app-logo">⚡ VELA-JSX OS</text>
        <text className="battery-pill">⚡ 94%</text>
      </div>

      <StatCard
        title="🔥 DAILY STEPS"
        value={steps}
        unit="/ 10,000"
        badge="85% GOAL"
        progress="85%"
      />

      <div className="btn-row">
        <input className="btn-card btn-step" type="button" value="⚡ +500" onClick={addSteps} />
        <input className="btn-card btn-reset" type="button" value="🔄 RESET" onClick={resetSteps} />
        <input className="btn-card btn-toggle" type="button" value="📋 LIST" onClick={toggleWorkouts} />
      </div>

      <input className="btn-nav" type="button" value="🚀 HOOKS DEMO" onClick={goToDemo} />

      {showWorkouts && (
        <div className="workouts-box">
          <text className="workout-head">RECENT WORKOUTS</text>
          {workouts.map(w => (
            <text className="workout-item" key={w.name}>{w.name} — {w.detail}</text>
          ))}
        </div>
      )}
    </div>
  );
}
