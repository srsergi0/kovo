export const style = `
  .stat-card {
    width: 400px;
    background-color: #121722;
    border-radius: 24px;
    border-width: 1px;
    border-color: #1e293b;
    flex-direction: column;
    padding: 16px;
    margin-bottom: 12px;
  }
  .stat-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .stat-title {
    font-size: 14px;
    color: #94a3b8;
    font-weight: bold;
  }
  .stat-badge {
    font-size: 11px;
    color: #38bdf8;
    background-color: #0f172a;
    border-radius: 10px;
    padding: 3px 8px;
    font-weight: bold;
  }
  .stat-body {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
  .stat-value {
    font-size: 36px;
    font-weight: bold;
    color: #ffffff;
  }
  .stat-unit {
    font-size: 14px;
    color: #38bdf8;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .progress-bar-bg {
    width: 368px;
    height: 6px;
    background-color: #1e293b;
    border-radius: 3px;
    margin-top: 10px;
  }
  .progress-bar-fill {
    height: 6px;
    background-color: #38bdf8;
    border-radius: 3px;
  }
`;

export default function StatCard({ title = 'Activity', value = '0', unit = 'PTS', badge = 'GOAL 80%', progress = '70%' }) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <text className="stat-title">{title}</text>
        <text className="stat-badge">{badge}</text>
      </div>

      <div className="stat-body">
        <text className="stat-value">{value}</text>
        <text className="stat-unit">{unit}</text>
      </div>

      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={`width: ${progress};`} />
      </div>
    </div>
  );
}
