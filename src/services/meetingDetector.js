const EventEmitter = require('events');
const activeWin = require('active-win');

const MEETING_KEYWORDS = [
  { key: 'zoom', labels: ['zoom', 'zoom meeting'] },
  { key: 'teams', labels: ['microsoft teams', 'teams'] },
  { key: 'meet', labels: ['google meet', 'meet'] }
];

class MeetingDetector extends EventEmitter {
  constructor(pollInterval = 4000) {
    super();
    this.pollInterval = pollInterval;
    this.timer = null;
    this.currentStatus = { isInMeeting: false, app: null, title: null, processName: null };
  }

  start(callback) {
    if (this.timer) {
      return;
    }

    const emitterCallback = (status) => {
      if (typeof callback === 'function') {
        callback(status);
      }
      this.emit('status-changed', status);
    };

    const poll = async () => {
      try {
        const windowInfo = await activeWin();
        const nextStatus = this.detectStatus(windowInfo);
        if (this.hasStatusChanged(nextStatus)) {
          this.currentStatus = nextStatus;
          emitterCallback(nextStatus);
        }
      } catch (error) {
        console.error('Meeting detector failed to read active window', error);
        // TODO: Add OS specific fallbacks for scenarios where accessibility permissions are missing.
      }
    };

    poll();
    this.timer = setInterval(poll, this.pollInterval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  detectStatus(windowInfo) {
    if (!windowInfo) {
      return { isInMeeting: false, app: null, title: null, processName: null };
    }

    const combinedLabel = `${windowInfo.owner?.name || ''} ${windowInfo.title || ''}`.toLowerCase();
    const result = MEETING_KEYWORDS.find((entry) =>
      entry.labels.some((label) => combinedLabel.includes(label))
    );

    if (result) {
      return {
        isInMeeting: true,
        app: result.key,
        title: windowInfo.title || windowInfo.owner?.name || 'Meeting',
        processName: windowInfo.owner?.name || null
      };
    }

    const genericMatch = /meeting|call|conference/gi.test(windowInfo.title || '');
    if (genericMatch) {
      return {
        isInMeeting: true,
        app: 'unknown',
        title: windowInfo.title || 'Meeting',
        processName: windowInfo.owner?.name || null
      };
    }

    return {
      isInMeeting: false,
      app: null,
      title: windowInfo?.title || null,
      processName: windowInfo?.owner?.name || null
    };
  }

  hasStatusChanged(nextStatus) {
    return (
      nextStatus.isInMeeting !== this.currentStatus.isInMeeting ||
      nextStatus.app !== this.currentStatus.app ||
      nextStatus.title !== this.currentStatus.title
    );
  }
}

module.exports = MeetingDetector;
