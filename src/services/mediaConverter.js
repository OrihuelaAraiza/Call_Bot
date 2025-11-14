const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
    console.warn('FFmpeg binary path was not resolved. Video conversion will likely fail.');
}

function convertWebmToMp4(webmPath) {
  return new Promise((resolve, reject) => {
    if (!webmPath) {
      reject(new Error('webmPath is required for conversion'));
      return;
    }

    const mp4Path = webmPath.replace(/\.webm$/i, '.mp4');

    ffmpeg(webmPath)
      .outputOptions('-movflags', 'faststart')
      .toFormat('mp4')
      .on('end', () => resolve(mp4Path))
      .on('error', reject)
      .save(mp4Path);
  });
}

module.exports = {
  convertWebmToMp4
};
