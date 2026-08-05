import vibrator from '@system.vibrator';

export default {
  onCreate() {
    console.info('[kovo demo] started');
  },
  onDestroy() {
    console.info('[kovo demo] stopped');
    vibrator.vibrate({ mode: 'short' });
  },
};
