import vibrator from '@system.vibrator';

export default {
  onCreate() {
    console.info('[kovo] app started');
  },
  onDestroy() {
    console.info('[kovo] app stopped');
  },
};
