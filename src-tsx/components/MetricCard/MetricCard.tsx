export const style = `
  .card-container {
    width: 380px;
    height: 72px;
    background-color: #1a202c;
    border-radius: 16px;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    margin-bottom: 10px;
  }
  .card-left {
    flex-direction: column;
  }
  .card-title {
    font-size: 13px;
    color: #a0aec0;
  }
  .card-value {
    font-size: 22px;
    font-weight: bold;
    color: #ffffff;
  }
  .card-unit {
    font-size: 12px;
    color: #48bb78;
    font-weight: bold;
  }
`;

export default function MetricCard({ title = 'Metric', value = '0', unit = 'units' }) {
  return (
    <div className="card-container">
      <div className="card-left">
        <text className="card-title">{title}</text>
        <text className="card-value">{value}</text>
      </div>
      <text className="card-unit">{unit}</text>
    </div>
  );
}
