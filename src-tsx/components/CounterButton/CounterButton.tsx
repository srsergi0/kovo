import { useState } from 'kovo-ux';

export interface CounterButtonProps {
  value?: number;
  label?: string;
  onChange?: (evt: { detail: { value: number } }) => void;
}

export const style = `
  .counter-btn { width: 80px; height: 40px; background-color: #2ecc71; border-radius: 20px; }
  .counter-btn text { color: #ffffff; font-size: 16px; text-align: center; }
`;

export default function CounterButton({ value = 0, label = '' }: CounterButtonProps) {
  const [internalCount, setInternalCount] = useState(value);

  function handleTap() {
    const nextCount = internalCount + 1;
    setInternalCount(nextCount);
  }

  return (
    <div className="counter-btn" onClick={handleTap}>
      <text>{label}: {internalCount}</text>
    </div>
  );
}
